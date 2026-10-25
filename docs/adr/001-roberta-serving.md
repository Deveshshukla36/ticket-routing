# ADR 001 — Serving RoBERTa alongside the sklearn classifiers

- **Status:** Proposed
- **Date:** 2026-10-25
- **Deciders:** IntentRoute AI maintainers
- **Supersedes:** —

> **Amendment (2026-10-25): deployment topology changed.**
>
> | Part | Now runs on |
> |---|---|
> | FastAPI backend | Render, native Python 3.11 runtime |
> | Database | Neon Postgres |
> | Next.js frontend | Vercel; the browser calls the backend directly through `NEXT_PUBLIC_API_BASE` |
>
> The Vercel Python function (`api/index.py`) is gone. Where this ADR says
> "Vercel function" or "250 MB limit", read "the Render web service". The
> decision itself still holds:
>
> - Render's free and starter instances have 512 MB of RAM.
> - CPU-only `torch` plus `roberta-base` weights need well over 1 GB of RAM
>   to serve.
> - So RoBERTa is still served by Hugging Face, and `requirements.txt`
>   stays torch-free.
>
> The serverless route is `https://router.huggingface.co/hf-inference/models/{HF_MODEL_ID}`.
> The legacy `api-inference.huggingface.co` host no longer resolves; this
> was checked on 2026-10-25.

## Context

IntentRoute AI sorts support tickets into 8 categories (`Account Access`,
`Billing`, `Bug Report`, `Cancellation`, `Complaint`, `Feature Request`,
`General Inquiry`, `Technical Issue`) and routes each one to a team.

What the repo contains today:

| Item | State |
|---|---|
| Variant A — TF-IDF + calibrated LinearSVC (`models/intent_classifier.joblib`) | Committed, served, 92.19% on the 192-row test split |
| Variant B — TF-IDF + Multinomial NB (`models/intent_classifier_b.joblib`) | Committed, served, 92.19% on the same split |
| RoBERTa — `train_transformer.py` | Script only. Its own docstring says it could not run where it was written (no Hugging Face Hub access, no GPU). |
| `models/roberta_metrics.json` (94.0%) | **No weights, logs or checkpoint back this number.** It can't be reproduced from the repo. |
| Dataset — `data/tickets_dataset.csv` | Synthetic: 960 rows from 120 templates (15 per category), only 673 unique texts |

Two problems block a believable accuracy claim:

1. **No RoBERTa model exists.** The 94% figure has to be treated as
   unverified until a real training run produces weights and a metrics file
   that a test can check.
2. **The current test split leaks.** `train.py` uses a random
   `StratifiedShuffleSplit(test_size=0.2, random_state=42)`. On that split,
   78 of the 192 test rows (41%) appear word-for-word in the training set,
   and all 192 come from templates the model saw in training. So the
   reported accuracy measures how well the model remembers templates, not
   how well it handles new tickets.

Deployment limit: the API runs as a Vercel Python function, which is capped
at 250 MB unzipped. `torch` alone is far bigger than that, so
`requirements.txt` deliberately leaves out `torch` and `transformers`.

## Decision

1. **Choose the backend with `MODEL_BACKEND=sklearn|roberta`.**
   - `sklearn` (the default) keeps today's behaviour, including A/B testing
     between Variant A and Variant B.
   - `roberta` is opt-in. Classification goes to a fine-tuned RoBERTa
     hosted by Hugging Face and called over HTTPS. Nothing in the Vercel
     function imports `torch` or `transformers`.
2. **How RoBERTa is reached** is set by environment variables:
   - `HF_MODEL_ID` — the Hub repo, e.g. `<org>/roberta-intent-8class`.
   - `HF_API_TOKEN` — a read-scoped token. It is only ever an environment
     variable and is never committed.
   - `HF_ENDPOINT_URL` (optional) — the URL of a dedicated Inference
     Endpoint. If set, it is used instead of the shared serverless router.
3. **sklearn Variant A is always the fallback.** The RoBERTa path falls back
   to Variant A when:
   - `HF_API_TOKEN` is unset (logged as a warning at startup),
   - a request still fails after retries, or
   - the circuit breaker is open (5 failures in a row → 60 s on sklearn).

   Every prediction records which model actually produced it, so a reader
   can always tell a fallback answer from a RoBERTa answer.
4. **The 8 categories stay as they are.** Both backends must use the same
   label order. The RoBERTa model's `id2label` must match the sklearn
   models' `classes_`. A test checks this.

### Training happens locally; only serving is hosted

Fine-tuning runs on the maintainer's machine with
`train_transformer.py` and `requirements-ml.txt`. An RTX 3050 with 4 GB of
VRAM is enough for `roberta-base` at max length 128, batch size 8, with
fp16. A CPU works too, just more slowly.

The resulting checkpoint (weights, tokenizer, a `config.json` whose
`id2label` matches the 8 categories, and the holdout metrics) is pushed to
the Hub as `HF_MODEL_ID`. Hugging Face only *hosts* the model; it never
trains it. The pretrained `roberta-base` starting weights are the only thing
downloaded from the Hub during training.

### Hosting risk to settle before implementation

Hugging Face retired the old `api-inference.huggingface.co` serverless API
in favour of the Inference Providers router. Not every Hub model, and
especially not every user-uploaded fine-tune, is served there automatically.
Before building on the serverless path:

- Push the trained model to the Hub, then check whether the `hf-inference`
  provider serves it for the `text-classification` task.
- If it doesn't, use a **dedicated Inference Endpoint** (CPU, scale-to-zero)
  through `HF_ENDPOINT_URL`. This is paid per hour while running. Scaling to
  zero keeps an idle demo close to free but adds a cold start of tens of
  seconds after idle periods.

The client code has to support both URL shapes, so this choice can be
changed later without touching code.

## Alternatives considered

### (a) Ship `torch` + `transformers` inside the Vercel function — rejected

- A CPU-only `torch` wheel is several hundred MB unzipped, and adding
  `transformers` and the model weights (~500 MB fp32 for `roberta-base`)
  makes it far bigger still. That is over the 250 MB limit before any
  application code is added.
- Even if it fit, loading the model on every cold start would take
  seconds per instance.

### (b) A separate always-on model server (Modal, RunPod, Fly.io, Cloud Run) — deferred to v2

- This gives full control over batching, latency and cost per request, and
  it removes the dependency on Hugging Face hosting.
- It is rejected for v1 because it means another service to deploy, secure,
  monitor and pay for, and the current traffic doesn't justify that.
- **This is the v2 path.** The same HTTP client contract applies, so moving
  later only means changing `HF_ENDPOINT_URL` (or a renamed equivalent).

### (c) Quantised ONNX RoBERTa inside the Vercel function — future option

Rough sizes, to be measured before relying on this:

| Component | Approx. unzipped size |
|---|---|
| `roberta-base` ONNX, dynamic int8 quantisation | ~125 MB |
| `distilroberta-base` ONNX, int8 | ~80 MB |
| `onnxruntime` (CPU, Linux wheel) | ~15–20 MB |
| `tokenizers` | ~10 MB |
| Existing stack: `numpy` + `scipy` + `scikit-learn` + FastAPI deps | ~150 MB |

- `roberta-base` int8 plus the existing stack is about 300 MB, which is
  **over** the limit.
- `distilroberta` int8 is about 255 MB, which is borderline.
- Downloading the `.onnx` file from object storage into `/tmp` at cold start
  keeps it out of the bundle size, but adds download time to every cold
  start.
- Quantisation also usually costs some accuracy, so this option needs its
  own holdout number before it can be used.

## Consequences

**Positive**

- The Vercel bundle stays torch-free and under the size limit.
- The service stays available without Hugging Face: sklearn always answers.
- The RoBERTa claim becomes checkable: either there is a Hub model ID plus a
  passing CI gate, or there is no claim.

**Negative / costs**

- **Latency:** each RoBERTa call is a network round trip, roughly
  100–300 ms when the model is warm. A cold model, whether a scaled-to-zero
  endpoint or a serverless model loading for the first time, can take
  10–60 s. Callers need a 10 s timeout, so the first request after an idle
  period may fall back to sklearn.
- **Rate limits and quota:** serverless calls are limited by the token's
  plan. HTTP 429 and 503 responses have to be retried with backoff and then
  sent to the fallback.
- **Secret management:** `HF_API_TOKEN` has to be set in Vercel and as a
  GitHub Actions secret, and it must never be logged.
- **Privacy:** ticket text leaves our infrastructure and goes to Hugging
  Face. Logs store a hash of the text, never the raw text.
- **Two labels to keep in sync:** the HF model and the sklearn models must
  use the same category list (enforced by a test).

## Accuracy proof plan

*Revised 2026-10-25 once the split options had been measured; see
`backend/data/README.md`.*

1. **Independent holdout.** `backend/data/holdout.json` contains 200
   hand-written tickets, 25 per category, written independently of the
   generator templates. Any split of `tickets_dataset.csv` was rejected,
   because every split shares templates between train and test. A random
   split with duplicates removed reaches 98.6%, which only shows the model
   remembering templates.
   - `data/build_holdout.py` and a unit test reject any holdout text with
     token Jaccard ≥ 0.7 against any training text. The current maximum
     is 0.41.
   - The committed models never saw the holdout, so no retraining was
     needed.
2. **CI gate.** `tests/test_model_accuracy.py` (marker `accuracy`) runs on
   the holdout:
   - The `accuracy-gate` job requires sklearn **≥ 0.90** on every push.
   - The `roberta-smoke` job requires RoBERTa **≥ 0.92** with zero sklearn
     fallbacks. It runs on `main` and on PRs to `main` when
     `HF_API_TOKEN` is set.
   - Every run prints a confusion matrix per category and uploads a JSON
     report.
   - The gates are hard-coded, so changing one has to go through a
     reviewed commit.
3. **Report what is measured.** The README accuracy table comes from CI
   output, not from `roberta_metrics.json`.

### Measured result (2026-10-25)

| Model | Holdout accuracy | Gate |
|---|---|---|
| sklearn A (TF-IDF + LinearSVC) | **0.635** | ≥ 0.90 — **fails** |
| sklearn B (TF-IDF + NB), report only | 0.620 | — |
| RoBERTa | not yet trained | ≥ 0.92 |

The failure is the honest signal, so the gate stays red. The weakest
category is Bug Report (recall 0.20), which gets confused with Technical
Issue and Feature Request. Two things could close the gap: a pretrained
encoder (RoBERTa), which is what this ADR is for, and more varied training
data. Raising the template count in `generate_dataset.py` is the cheapest
data fix.

### Honest wording until the gates pass

> Built a FastAPI + Next.js ticket-routing platform with an 8-class intent
> classifier, an opt-in RoBERTa backend served via Hugging Face with
> circuit-breaker fallback to TF-IDF/LinearSVC, and a CI accuracy gate on
> an independent hand-written holdout set.

Add a specific accuracy figure only once CI shows it, and say which
holdout it was measured on.

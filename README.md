# IntentRoute AI

**Sorts customer support tickets into 8 categories and routes each one to the right team, with a priority, a response-time target (SLA), and human review when the model is unsure.**

[![CI](https://github.com/Deveshshukla36/ticket-routing/actions/workflows/ci.yml/badge.svg)](https://github.com/Deveshshukla36/ticket-routing/actions/workflows/ci.yml)

FastAPI + Pydantic v2 backend · Next.js 14 dashboard · scikit-learn baseline · optional RoBERTa served through Hugging Face · SQLAlchemy on SQLite (local) or Neon Postgres (production).

---

## Architecture

```
 Browser
   │
   ▼
┌──────────────────────────────┐   NEXT_PUBLIC_API_BASE   ┌──────────────────────────────────┐
│ Next.js 14 dashboard         │ ───────────────────────▶ │ FastAPI  (Render, Python 3.11)   │
│ Vercel                       │        HTTPS / JSON      │ /api/v1/*                        │
│ inference · routing ·        │                          └────────────────┬─────────────────┘
│ analytics · models · A/B     │                                           │
└──────────────────────────────┘                                           ▼
                                                     ┌───────────────────────────────────────┐
                                                     │ ModelRouter     MODEL_BACKEND=        │
                                                     │                 sklearn | roberta     │
                                                     └───────┬───────────────────────┬───────┘
                                                             │ roberta               │ sklearn (default,
                                                             ▼                       ▼  and the fallback)
                                         ┌───────────────────────────────┐ ┌───────────────────────────┐
                                         │ RoBERTaClassifier             │ │ TF-IDF + LinearSVC  (A)   │
                                         │ HTTPS → Hugging Face          │ │ TF-IDF + NaiveBayes (B)   │
                                         │ retries · 10 s timeout ·      │ │ local .joblib, ~1 ms      │
                                         │ circuit breaker ──fallback──▶ │ │                           │
                                         └───────────────────────────────┘ └───────────────────────────┘
                                                             │                       │
                                                             └───────────┬───────────┘
                                                                         ▼
                                              intent decision → sentiment → priority / team / SLA
                                                                         │
                                                                         ▼
                                              SQLAlchemy  →  SQLite (local)  |  Neon Postgres (prod)
```

## What this is and what it isn't

**What it is**

- A working ticket-routing API and dashboard. It covers:
  - classification into 8 categories,
  - sentiment-based priority escalation,
  - response-time (SLA) targets,
  - a human-review queue for low-confidence predictions,
  - feedback capture,
  - an offline response-suggestion assistant.
- A pluggable model layer:
  - The default backend is scikit-learn: a fast local model with no
    external dependencies.
  - `MODEL_BACKEND=roberta` sends classification to a fine-tuned RoBERTa
    hosted by **Hugging Face**. If Hugging Face is unreachable,
    rate-limited, or not configured, the API automatically answers with
    scikit-learn. Every prediction records which model produced it.
- An honest evaluation: a 200-ticket holdout written independently of the
  training data, and a CI gate that prints a confusion matrix on every run.

**What it isn't**

- **RoBERTa doesn't run inside this API.** Weights are never loaded by the
  backend. `torch` and `transformers` are only for local training
  (`requirements-ml.txt`).
- **The data isn't real.** The training data is synthetic: 120 sentence
  templates, see [`backend/data/README.md`](backend/data/README.md). The
  holdout is hand-written, not drawn from real customer traffic.
- **There are no measured RoBERTa numbers yet.** The model hasn't been
  trained and pushed. The API and dashboard list it as "Not Trained" with no
  accuracy until a verified evaluation exists. An earlier "94%" figure had
  no reproducible source and has been withdrawn.

## Measured accuracy

Measured on [`backend/data/holdout.json`](backend/data/holdout.json): 200 hand-written tickets, 25 per category, checked by CI to share no near-duplicate text with the training set. The output comes from `pytest -m accuracy`, run on 2026-10-25.

| Model | Holdout accuracy | CI gate | Status |
|---|---|---|---|
| sklearn A: TF-IDF + calibrated LinearSVC (`v1.0.0`) | **63.5%** | ≥ 90% | ❌ failing |
| sklearn B: TF-IDF + Multinomial NB (`v1.1.0-challenger`) | 62.0% | reported only | none |
| RoBERTa, fine-tuned and served via Hugging Face | not yet measured | ≥ 92% | ⏳ model not trained |

The gate is red on purpose. It shows the real gap between the baseline
and the target, and it is never lowered to make CI pass.

The old "92%" figure came from a test split where every test sentence
came from a template the model had already seen in training. On sentences
from templates the model never saw, the same model scores 55.8%. The full
breakdown is in [`backend/data/README.md`](backend/data/README.md), and
the reasoning is in [ADR 001](docs/adr/001-roberta-serving.md).

<details>
<summary>sklearn A confusion matrix (rows = true, cols = predicted)</summary>

```
                  Acc  Bil  Bug  Can  Com  Fea  Gen  Tec  recall  prec    f1
Account Access     16    0    0    4    1    2    0    2    0.64  0.76  0.70
Billing             1   13    1    4    1    1    3    1    0.52  0.68  0.59
Bug Report          1    2    5    1    1    5    1    9    0.20  0.45  0.28
Cancellation        1    0    0   20    0    2    1    1    0.80  0.65  0.71
Complaint           2    4    1    0   13    1    2    2    0.52  0.72  0.60
Feature Request     0    0    1    0    0   21    0    3    0.84  0.60  0.70
General Inquiry     0    0    1    0    0    2   22    0    0.88  0.73  0.80
Technical Issue     0    0    2    2    2    1    1   17    0.68  0.49  0.57
```
</details>

## Local development

You need Python 3.11+ and Node 18+. Locally, the backend uses SQLite, so
nothing else needs installing.

```bash
# 1. Backend: http://127.0.0.1:8000  (API docs at /docs)
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn main:app --app-dir backend --reload

# 2. Frontend: http://localhost:3000  (in a second terminal)
npm install
npm run dev
```

**How the frontend reaches the backend locally:** leave
`NEXT_PUBLIC_API_BASE` unset. `next.config.js` then forwards the
frontend's `/api/*` calls to the backend on port 8000.

**Configuration:** the backend reads environment variables from the
process; it doesn't load `.env` files automatically.
[`.env.example`](.env.example) lists every variable. The ones that matter:

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `backend/tickets.db` (SQLite) | Set a Neon URL to keep data between restarts and deploys |
| `MODEL_BACKEND` | `sklearn` | `roberta` turns on the Hugging Face path |
| `HF_API_TOKEN` | none | A read-scoped token. Without it, `roberta` falls back to sklearn and logs a warning |
| `HF_MODEL_ID` | none | e.g. `your-user/roberta-intent-8class` |
| `HF_ENDPOINT_URL` | none | Optional dedicated Inference Endpoint; overrides `HF_MODEL_ID` routing |
| `CONFIDENCE_THRESHOLD` | `0.60` | Predictions below this go to the human-review queue |

**Tests and checks** (run from `backend/`):

```bash
ruff check . && mypy .
pytest -m "not accuracy"                # unit + API tests
pytest -m accuracy                      # holdout accuracy gates + confusion matrices
python data/build_holdout.py            # validate the holdout set
```

**End-to-end smoke test** (run from the repo root, in bash):

```bash
scripts/smoke_test.sh                   # start a local backend on a throwaway SQLite DB and check it
scripts/smoke_test.sh --skip-accuracy   # same, without the accuracy gate
```

The script runs six checks, prints ✅, ❌ or ⏭️ for each, and exits non-zero
if anything fails:

1. The backend starts.
2. `/api/v1/health` returns `ok`, and the `X-Request-ID` header comes back.
3. A ticket taken from the holdout set is classified with its holdout label.
4. `/api/v1/route` returns a team, a priority and an SLA.
5. Feedback is saved. The script restarts the server, then reads both the
   prediction and the feedback back, which proves they reached the database
   and aren't just held in memory.
6. The sklearn holdout accuracy gate passes.

While sklearn sits at 63.5%, step 6 fails, as intended.

**Troubleshooting:** if the dev server keeps showing a CSS error after you
change `tailwind.config.ts` (for example "`rounded-panel` class does not
exist"), stop it, delete `.next/cache`, and start it again. Next.js can
keep serving a cached failed build.

**Training RoBERTa** happens locally only. You need `pip install -r requirements-ml.txt`, which also has the GPU install line. Then use `backend/train_transformer.py` and push the result to the Hugging Face Hub (deploy step 2).

## Deploy

Deploy in this order. Each step produces something the next one needs.

1. **Neon (database)**
   1. Create a Neon project.
   2. Copy the **pooled** connection string. It looks like
      `postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/DB?sslmode=require`.
   3. Keep it for step 3. Tables are created automatically on first start.

   You do need this. Without `DATABASE_URL`, the API uses a SQLite file
   on the server's disk, which is **wiped on every restart and redeploy**.

2. **Hugging Face (RoBERTa)**
   1. Fine-tune locally and push the model to the Hub; its repo ID becomes
      `HF_MODEL_ID`. The model's `id2label` must list the same 8
      categories.
   2. Create a **read** access token; this becomes `HF_API_TOKEN`.
   3. The API calls
      `https://router.huggingface.co/hf-inference/models/{HF_MODEL_ID}`.
      If Hugging Face doesn't serve your model on that route, create a
      dedicated Inference Endpoint (CPU, scale-to-zero) and set
      `HF_ENDPOINT_URL` instead.
   4. Optionally, add the same token as a GitHub Actions secret
      (`HF_API_TOKEN`) and the model ID as a repository variable
      (`HF_MODEL_ID`). This turns on the RoBERTa CI gate.

   You can skip this step for now. With `MODEL_BACKEND=roberta` and no
   token, the API runs on sklearn.

3. **Render (backend)**
   - **Blueprint:** New → Blueprint, then pick this repo. It reads
     [`render.yaml`](render.yaml) and asks for the secrets.
   - **Or manual:** New → Web Service, then pick this repo with these
     settings:

     | Setting | Value |
     |---|---|
     | Runtime | Python 3 (version 3.11, taken from `.python-version`) |
     | Build command | `pip install -r requirements.txt` |
     | Start command | `uvicorn main:app --app-dir backend --host 0.0.0.0 --port $PORT` |
     | Health check path | `/api/v1/health` |
     | Environment | `DATABASE_URL` (step 1), `HF_API_TOKEN` + `HF_MODEL_ID` (step 2), `MODEL_BACKEND=roberta` |

   - Once it deploys, `https://<your-service>.onrender.com/api/v1/health`
     should return `"status": "ok"`. Run the full end-to-end check against
     the deployed service:
     `scripts/smoke_test.sh --base-url https://<your-service>.onrender.com --skip-accuracy`.
     This writes one test prediction and one feedback row, with reviewer
     `smoke-test`, to the Neon database.
   - On the free plan, the service sleeps after about 15 minutes idle, and
     the first request after that takes roughly 30–60 s.

4. **Vercel (frontend)**
   1. Import this repo. Vercel detects Next.js; keep the default build
      command (`next build`) and output (`.next`).
   2. Set `NEXT_PUBLIC_API_BASE` to the Render URL from step 3, e.g.
      `https://intentroute-api.onrender.com`, with no trailing slash.
   3. Deploy. Every push to `main` then redeploys, and pull requests get
      preview URLs.

   CORS: the API currently allows any origin. For production, restrict
   `CORS_ORIGINS` in `backend/config.py` to your Vercel domain.

## API reference

The interactive OpenAPI docs are at `/docs` on any running backend. Every
classification endpoint accepts `?variant=A|B`. `B` always means the sklearn
challenger; `A` means the primary model for the configured `MODEL_BACKEND`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/health` | `status` (`ok` / `degraded` / `error`), active `backend`, `model_versions`, `db` (checked with `SELECT 1`). Returns 503 only when no model can load |
| GET | `/api/v1/metrics` | Request count, p50/p95 latency, per-route stats, predictions by backend, fallbacks by reason, circuit-breaker state |
| GET | `/api/v1/model/info` | Version, architecture, labels and stored metrics of a sklearn variant |
| GET | `/api/v1/model/metrics` | Stored training-split metrics for a variant (per-class), plus `holdout_accuracy` |
| GET | `/api/v1/model/compare` | A vs B with holdout accuracy; RoBERTa shows `not_trained` until verified |
| GET | `/api/v1/models` | Model registry, with accuracy measured on the independent holdout |
| POST | `/api/v1/classify` | Classify one ticket: category, confidence, top 3, team, priority |
| POST | `/api/v1/predict` | Alias of `/classify` |
| POST | `/api/v1/classify/batch` | Classify up to 500 tickets |
| POST | `/api/v1/route` | Full routing: category + sentiment → priority, team, SLA, human-review flag, reason |
| GET | `/api/v1/monitoring/recent` | Rolling in-memory prediction log and category distribution |
| GET | `/api/v1/history` | Persisted predictions from the database |
| POST | `/api/v1/feedback` | Submit a human correction, stored for retraining |
| GET | `/api/v1/feedback/list` | Stored feedback records |
| GET | `/api/v1/knowledge-base` | Built-in resolution playbooks for each category |
| POST | `/api/v1/suggest-response` | Offline suggested reply and action items for a ticket |

The root shortcuts `/predict`, `/route`, `/feedback`, `/models` and
`/health` point at the endpoints above. Note that the root `/metrics` is a
shortcut for **model** metrics (`/api/v1/model/metrics`), not service
metrics.

### Observability

- **Request IDs.** Every response carries an `X-Request-ID` header. The
  API reuses the caller's ID if it is safe to log (up to 128 characters,
  letters, digits and `._:-`); otherwise it creates a UUID4. The ID appears
  in every backend log line as `[rid=…]`, so one request can be traced from
  the browser through the logs, including any Hugging Face fallback
  warning. The header is exposed through CORS, so the dashboard can read it.
- **Service metrics.** `/api/v1/metrics` keeps its numbers in memory, per
  process, and resets them on restart. That is enough for one Render
  instance; with multiple instances you would export them as Prometheus
  metrics instead.
  - Percentiles use the last 1,000 requests.
  - Health and metrics probes are left out of the overall latency, so
    Render's health checks don't skew it.
  - Routes are labelled by their template, never the raw URL.

## Repository layout

```
app/, components/, lib/, types/    Next.js 14 dashboard (deployed to Vercel)
backend/
  main.py                          FastAPI app
  api/routes_v1.py                 /api/v1 endpoints (depend on ModelRouter)
  ml/model_router.py               picks sklearn or RoBERTa
  ml/roberta_client.py             Hugging Face client: retries, timeout, circuit breaker, fallback
  ml/classifier.py                 sklearn models + routing table
  ml/evaluation.py                 holdout validation, accuracy, confusion matrix
  services/                        routing, sentiment-aware SLA, persistence, response suggestions
  data/                            synthetic training set, independent holdout, docs
  tests/                           unit, API and accuracy tests
docs/adr/                          architecture decisions
render.yaml                        Render Blueprint for the backend
requirements.txt                   serving deps (Render, CI); no torch
requirements-dev.txt               lint / type / test tooling
requirements-ml.txt                local RoBERTa training only
```

## Roadmap

- **v1.1:** train RoBERTa, publish its holdout accuracy, and replace the
  placeholder benchmark in `/models`. Widen the training data with more
  varied templates, which is the cheapest fix for the 63.5% baseline.
- **v2: always-on RoBERTa inference server.** A dedicated Hugging Face
  Inference Endpoint or a self-hosted model server, to remove cold starts
  and shared rate limits.
- **v2: ONNX-quantised RoBERTa.** An int8 ONNX model run with
  `onnxruntime` could serve the model inside the API process without
  `torch`. It needs its own accuracy measurement, since quantisation
  usually loses some accuracy.
- **v2: real database migrations** with Alembic, replacing
  `create_all()` on startup.

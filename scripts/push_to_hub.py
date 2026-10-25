"""Upload the locally trained RoBERTa intent model to the Hugging Face Hub.

Needs a Hugging Face *write* token, read from the HF_TOKEN environment variable or from
`hf auth login`. It never takes a token on the command line, so it can't end up in your
shell history. See docs/training-roberta.md for creating the token.

Usage (from the repo root, after backend/train_transformer.py):
    python scripts/push_to_hub.py --repo-id <your-user>/roberta-intent-8class --dry-run
    python scripts/push_to_hub.py --repo-id <your-user>/roberta-intent-8class
--repo-id defaults to $HF_MODEL_ID. --dry-run checks the folder and writes the model card
without contacting the Hub.
"""
import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_DIR = ROOT / "backend" / "models" / "roberta-intent-classifier"
UPLOAD_IGNORE = ["checkpoint-*", "*.pt", "optimizer*", "scheduler*", "rng_state*", "trainer_state.json"]
EXPECTED_LABELS = [
    "Account Access", "Billing", "Bug Report", "Cancellation",
    "Complaint", "Feature Request", "General Inquiry", "Technical Issue",
]  # sorted(ROUTING_TABLE) in backend/ml/classifier.py; label id i -> EXPECTED_LABELS[i]


def check_model_dir(model_dir: Path) -> Dict[str, Any]:
    """Return metrics.json if the folder is a complete, correctly-labelled model; exit otherwise."""
    problems: List[str] = []
    config_path, metrics_path = model_dir / "config.json", model_dir / "metrics.json"
    if not model_dir.is_dir():
        sys.exit(f"Model folder not found: {model_dir}\nRun backend/train_transformer.py first.")
    if not any((model_dir / f).exists() for f in ("model.safetensors", "pytorch_model.bin")):
        problems.append("no weights (model.safetensors)")
    if not any((model_dir / f).exists() for f in ("tokenizer.json", "vocab.json")):
        problems.append("no tokenizer files")
    if not config_path.exists():
        problems.append("no config.json")
    else:
        id2label = json.loads(config_path.read_text(encoding="utf-8")).get("id2label", {})
        got = [id2label.get(str(i)) for i in range(len(id2label))]
        if got != EXPECTED_LABELS:
            problems.append(f"id2label {got} does not match the API's label order {EXPECTED_LABELS}")
    if not metrics_path.exists():
        problems.append("no metrics.json (holdout evaluation missing)")
    if problems:
        sys.exit("Refusing to upload:\n  - " + "\n  - ".join(problems))
    metrics: Dict[str, Any] = json.loads(metrics_path.read_text(encoding="utf-8"))
    return metrics


def model_card(repo_id: str, m: Dict[str, Any]) -> str:
    h, v, t = m["holdout"], m["validation"], m["training"]
    rows = "\n".join(
        f"| {label} | {s['precision']:.2f} | {s['recall']:.2f} | {s['f1']:.2f} | {s['support']} |"
        for label, s in h["per_label"].items()
    )
    gate = "passes" if h["passes_gate"] else "does **not** pass"
    return f"""---
pipeline_tag: text-classification
base_model: {m['base_model']}
language: en
tags: [intent-classification, customer-support, ticket-routing]
---

# {repo_id}

`{m['base_model']}` fine-tuned to sort customer-support tickets into 8 intents for
[IntentRoute](https://github.com/Deveshshukla36/ticket-routing):
{", ".join(m["labels"])}.

## Evaluation

| Metric | Value |
|---|---|
| Holdout accuracy | **{h['accuracy']:.1%}** (n = {h['n']}) |
| Holdout F1 (weighted) | {h['f1_weighted']:.1%} |
| Project gate | {h['gate']:.0%}; this model {gate} it |
| Validation accuracy | {(v['accuracy'] or 0):.1%} (n = {v['rows']}, used only to pick the checkpoint) |

The holdout is 200 hand-written tickets (25 per intent), written independently of the
training data and checked for near-duplicates against it. It was not used for training,
checkpoint selection or hyperparameter tuning.

| Intent | Precision | Recall | F1 | Support |
|---|---|---|---|---|
{rows}

## Training data and limitations

- Trained on a **synthetic** dataset: {t['train_rows']} rows built from {t['train_templates']}
  sentence templates, with ~4% deliberately flipped labels. Validation holds out
  {t['validation_templates']} whole templates. Real support traffic will be messier.
- English only; short tickets (max {t['hyperparameters']['max_length']} tokens).
- Labels are ids 0-7 in alphabetical order; `config.json` carries `id2label`.

Model version `{m['model_version']}`, trained {m['created_at']} on {m['environment']['device']}
(commit `{m['environment']['git_commit']}`).
"""


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    p.add_argument("--repo-id", default=os.getenv("HF_MODEL_ID"), help="e.g. your-user/roberta-intent-8class")
    p.add_argument("--private", action="store_true", help="create a private repo (serverless inference may not serve it)")
    p.add_argument("--dry-run", action="store_true", help="check files and write README.md only")
    args = p.parse_args()
    if not args.repo_id or "/" not in args.repo_id:
        sys.exit("Set --repo-id or HF_MODEL_ID to <user-or-org>/<model-name>.")

    metrics = check_model_dir(args.model_dir)
    (args.model_dir / "README.md").write_text(model_card(args.repo_id, metrics), encoding="utf-8")
    acc = metrics["holdout"]["accuracy"]
    print(f"OK: {args.model_dir} is complete; holdout accuracy {acc:.4f}. Wrote model card README.md.")
    if args.dry_run:
        print("Dry run: nothing uploaded.")
        return 0

    from huggingface_hub import HfApi
    from huggingface_hub.errors import HfHubHTTPError

    api = HfApi()  # token from HF_TOKEN or the `hf auth login` cache
    try:
        user = api.whoami()["name"]
    except Exception:
        sys.exit("Not authenticated. Set HF_TOKEN to a *write* token or run `hf auth login`.")
    print(f"Authenticated as {user}. Uploading to {args.repo_id} ({'private' if args.private else 'public'})...")
    try:
        api.create_repo(args.repo_id, repo_type="model", private=args.private, exist_ok=True)
        commit = api.upload_folder(
            repo_id=args.repo_id,
            folder_path=str(args.model_dir),
            ignore_patterns=UPLOAD_IGNORE,
            commit_message=f"Upload {metrics['model_version']} (holdout accuracy {acc:.4f})",
        )
    except HfHubHTTPError as e:
        sys.exit(f"Upload failed: {e}\n(A read-only token gives 403; create a token with write access.)")
    print(f"Done: https://huggingface.co/{args.repo_id}\nCommit: {commit.commit_url}")
    print("Next: set HF_MODEL_ID and a *read* HF_API_TOKEN for the API (docs/training-roberta.md, step 6).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Fine-tune RoBERTa for the 8 intents and measure it honestly on the independent holdout.

Fixes the old script's leakage (see ml/training_data.py):
  * validation = whole templates held out of training (no shared template or text),
  * the checkpoint is chosen by validation loss (early stopping on validation),
  * data/holdout.json is used exactly once, after training, for the reported accuracy.
Do not tune hyperparameters against the holdout number; tune against validation.

Setup and the full workflow: docs/training-roberta.md. Quick start (from the repo root):
    pip install -r requirements-ml.txt            # + the CUDA torch wheel for a GPU
    python backend/train_transformer.py --dry-run # check data + splits, no download
    python backend/train_transformer.py           # train on GPU (fp16), ~minutes
Writes backend/models/roberta-intent-classifier/ (model, tokenizer, metrics.json).
"""
import argparse
import json
import platform
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from ml.evaluation import HOLDOUT_PATH, evaluate, format_report, load_holdout  # noqa: E402
from ml.training_data import (  # noqa: E402
    LABELS,
    Example,
    assert_holdout_independent,
    load_training_rows,
    template_disjoint_split,
)
from schemas.prediction import IntentPrediction  # noqa: E402

DEFAULT_OUTPUT = BACKEND_DIR / "models" / "roberta-intent-classifier"
DEFAULT_CHECKPOINTS = BACKEND_DIR / "checkpoints" / "roberta"
ROBERTA_GATE = 0.92  # backend/tests/test_model_accuracy.py


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--model-name", default="roberta-base", help="any Hub encoder, e.g. distilroberta-base")
    p.add_argument("--epochs", type=int, default=10, help="upper bound; early stopping usually ends sooner")
    p.add_argument("--batch-size", type=int, default=16, help="16 fits a 4 GB RTX 3050 with fp16")
    p.add_argument("--lr", type=float, default=2e-5)
    p.add_argument("--weight-decay", type=float, default=0.01)
    p.add_argument("--warmup-ratio", type=float, default=0.1)
    p.add_argument("--max-length", type=int, default=64, help="tickets are short; 64 tokens covers them")
    p.add_argument("--patience", type=int, default=3, help="epochs without validation-loss improvement")
    p.add_argument("--val-templates-per-label", type=int, default=3)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--checkpoint-dir", type=Path, default=DEFAULT_CHECKPOINTS)
    p.add_argument("--no-fp16", action="store_true", help="disable mixed precision on GPU")
    p.add_argument("--dry-run", action="store_true", help="load data, build and check splits, then exit")
    return p.parse_args()


def git_commit() -> str:
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=BACKEND_DIR, capture_output=True, text=True)
        return out.stdout.strip() or "unknown"
    except OSError:
        return "unknown"


def main() -> int:
    args = parse_args()
    rows = load_training_rows()
    split = template_disjoint_split(rows, args.val_templates_per_label, args.seed)
    n_holdout = assert_holdout_independent([e.text for e in split.train])
    print("Data:", json.dumps({**split.summary(), "holdout_rows": n_holdout}, indent=2))
    if args.dry_run:
        print("Dry run OK: splits are disjoint and the holdout is independent. Nothing was downloaded or trained.")
        return 0

    # Heavy imports only past the dry-run point (keeps --dry-run usable without torch).
    import numpy as np
    import torch
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        DataCollatorWithPadding,
        EarlyStoppingCallback,
        Trainer,
        TrainingArguments,
        set_seed,
    )

    set_seed(args.seed)
    cuda = torch.cuda.is_available()
    fp16 = cuda and not args.no_fp16
    device_name = torch.cuda.get_device_name(0) if cuda else "CPU"
    print(f"Device: {device_name} | fp16: {fp16} | torch {torch.__version__}")
    if not cuda:
        print("WARNING: no CUDA GPU found; training on CPU works but is slow. See docs/training-roberta.md.")

    label2id = {label: i for i, label in enumerate(LABELS)}
    id2label = {i: label for label, i in label2id.items()}
    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.model_name, num_labels=len(LABELS), id2label=id2label, label2id=label2id
    )

    class Encoded(torch.utils.data.Dataset):
        def __init__(self, examples: List[Example]) -> None:
            self.enc = tokenizer([e.text for e in examples], truncation=True, max_length=args.max_length)
            self.labels = [label2id[e.label] for e in examples]

        def __len__(self) -> int:
            return len(self.labels)

        def __getitem__(self, i: int) -> Dict[str, Any]:
            return {**{k: v[i] for k, v in self.enc.items()}, "labels": self.labels[i]}

    def val_metrics(pred: Any) -> Dict[str, float]:
        preds = np.argmax(pred.predictions, axis=-1)
        return {"accuracy": float((preds == pred.label_ids).mean())}

    training_args = TrainingArguments(
        output_dir=str(args.checkpoint_dir),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=64,
        learning_rate=args.lr,
        weight_decay=args.weight_decay,
        warmup_ratio=args.warmup_ratio,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",  # validation loss, never the holdout
        greater_is_better=False,
        save_total_limit=2,
        save_only_model=True,
        logging_steps=10,
        fp16=fp16,
        report_to="none",
        seed=args.seed,
    )
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=Encoded(split.train),
        eval_dataset=Encoded(split.validation),
        data_collator=DataCollatorWithPadding(tokenizer),
        processing_class=tokenizer,
        compute_metrics=val_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=args.patience)],
    )

    t0 = time.time()
    trainer.train()
    train_seconds = time.time() - t0
    validation = trainer.evaluate()
    print("Best checkpoint (by validation loss):", trainer.state.best_model_checkpoint)
    print("Validation:", {k: round(v, 4) for k, v in validation.items() if isinstance(v, float)})

    # ---- The one and only look at the holdout --------------------------------------------
    run_id = f"roberta-intent-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}"
    assert trainer.model is not None
    best = trainer.model.eval()
    dev = next(best.parameters()).device

    def predict_batch(texts: List[str]) -> List[IntentPrediction]:
        out: List[IntentPrediction] = []
        for start in range(0, len(texts), 64):
            chunk = texts[start:start + 64]
            batch = tokenizer(chunk, truncation=True, max_length=args.max_length, padding=True, return_tensors="pt").to(dev)
            t = time.perf_counter()
            with torch.no_grad():
                probs = torch.softmax(best(**batch).logits.float(), dim=-1).cpu().numpy()
            per_item_ms = (time.perf_counter() - t) * 1000 / len(chunk)
            for row in probs:
                scores = {id2label[i]: round(float(p), 4) for i, p in sorted(enumerate(row), key=lambda kv: -kv[1])}
                top = next(iter(scores))
                out.append(IntentPrediction(intent=top, confidence=scores[top], all_scores=scores,
                                            model_version=run_id, latency_ms=round(per_item_ms, 3), backend="roberta"))
        return out

    report = evaluate("roberta-local", predict_batch, load_holdout(), LABELS)
    print("\n" + format_report(report, ROBERTA_GATE) + "\n")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    trainer.save_model(str(args.output_dir))
    tokenizer.save_pretrained(str(args.output_dir))
    total = sum(m.support for m in report.per_label.values())
    metrics = {
        "model_version": run_id,
        "architecture": f"{args.model_name} fine-tuned (sequence classification)",
        "base_model": args.model_name,
        "labels": LABELS,
        "holdout": {
            "path": str(HOLDOUT_PATH.relative_to(BACKEND_DIR)),
            "n": report.n,
            "accuracy": report.accuracy,
            "f1_weighted": round(sum(m.f1 * m.support for m in report.per_label.values()) / total, 4),
            "gate": ROBERTA_GATE,
            "passes_gate": report.accuracy >= ROBERTA_GATE,
            "per_label": {k: v.model_dump() for k, v in report.per_label.items()},
            "confusion": report.confusion,
        },
        "validation": {
            "rows": len(split.validation),
            "templates": split.validation_templates,
            "loss": validation.get("eval_loss"),
            "accuracy": validation.get("eval_accuracy"),
            "note": "template-disjoint from train; used only to choose the checkpoint",
        },
        "training": {
            **split.summary(),
            "epochs_run": round(trainer.state.epoch or 0, 2),
            "best_checkpoint": trainer.state.best_model_checkpoint,
            "train_seconds": round(train_seconds, 1),
            "hyperparameters": {k: (str(v) if isinstance(v, Path) else v) for k, v in vars(args).items() if k != "dry_run"},
        },
        "environment": {
            "device": device_name, "fp16": fp16, "torch": torch.__version__,
            "python": platform.python_version(), "git_commit": git_commit(),
        },
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (args.output_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    verdict = "PASSES" if report.accuracy >= ROBERTA_GATE else "is BELOW"
    print(f"Holdout accuracy {report.accuracy:.4f} {verdict} the {ROBERTA_GATE:.2f} gate.")
    print(f"Saved model, tokenizer and metrics.json to {args.output_dir}")
    print("Next: python scripts/push_to_hub.py --dry-run   (see docs/training-roberta.md)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

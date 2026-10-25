"""Model registry for /models and /model/compare.

Accuracy shown for the sklearn models is measured live (once per process) on the
independent holdout set, not read from the stored train/test-split metrics, because
that split shares templates with training and overstates accuracy (see data/README.md).
RoBERTa numbers are only reported from a metrics file a real evaluation run marked
`"verified": true`; until then the entry is listed as not trained.
"""
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from ml.classifier import ROUTING_TABLE, get_classifier
from ml.evaluation import HOLDOUT_PATH, EvaluationReport, evaluate, load_holdout

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"
ROBERTA_METRICS = "roberta_metrics.json"


@lru_cache(maxsize=2)
def holdout_report(variant: str) -> EvaluationReport:
    clf = get_classifier(variant)
    examples = load_holdout(HOLDOUT_PATH)
    return evaluate(f"sklearn-{variant.lower()}", lambda texts: [clf.predict_intent(t) for t in texts],
                    examples, sorted(ROUTING_TABLE))


def weighted_f1(report: EvaluationReport) -> float:
    total = sum(m.support for m in report.per_label.values())
    return round(sum(m.f1 * m.support for m in report.per_label.values()) / total, 4) if total else 0.0


class ModelRegistry:
    def __init__(self, models_dir: Path = MODELS_DIR):
        self.models_dir = models_dir

    def _read(self, name: str) -> Optional[Dict[str, Any]]:
        path = self.models_dir / name
        if not path.exists():
            return None
        with open(path, "r", encoding="utf-8") as f:
            data: Dict[str, Any] = json.load(f)
        return data

    def get_metrics(self, variant: str = "A") -> Dict[str, Any]:
        """Stored training-time metrics (original split). Use holdout_* fields for accuracy claims."""
        variant_upper = variant.upper()
        if variant_upper in ("C", "ROBERTA", "TRANSFORMER"):
            return self.get_roberta_benchmark() or {"error": "RoBERTa has not been trained and evaluated yet"}
        name = "metrics_b.json" if variant_upper == "B" else "metrics.json"
        data = self._read(name)
        if data is None:
            return {"error": f"Metrics not found for variant {variant}"}
        report = holdout_report("B" if variant_upper == "B" else "A")
        data["holdout_accuracy"] = report.accuracy
        data["holdout_f1_weighted"] = weighted_f1(report)
        data["holdout_samples"] = report.n
        return data

    def get_roberta_benchmark(self) -> Dict[str, Any]:
        """Only metrics produced and marked verified by a real evaluation run."""
        data = self._read(ROBERTA_METRICS)
        return data if data and data.get("verified") is True else {}

    def get_all_models(self) -> List[Dict[str, Any]]:
        metrics_a = self._read("metrics.json") or {}
        metrics_b = self._read("metrics_b.json") or {}
        report_a, report_b = holdout_report("A"), holdout_report("B")
        evaluated_on = f"independent holdout (n={report_a.n})"
        roberta = self.get_roberta_benchmark()

        return [
            {
                "version": metrics_a.get("model_version", "v1.0.0"),
                "name": "Production Intent Classifier",
                "variant": "A",
                "architecture": metrics_a.get("architecture", "TF-IDF + Calibrated LinearSVC"),
                "accuracy": report_a.accuracy,
                "f1_score": weighted_f1(report_a),
                "evaluated_on": evaluated_on,
                "status": "Active (Serving)",
                "benchmark": False,
                "description": "Default and fallback model. Calibrated probabilities, ~1 ms local inference.",
            },
            {
                "version": metrics_b.get("model_version", "v1.1.0-challenger"),
                "name": "Challenger Intent Classifier",
                "variant": "B",
                "architecture": metrics_b.get("architecture", "TF-IDF + Multinomial Naive Bayes"),
                "accuracy": report_b.accuracy,
                "f1_score": weighted_f1(report_b),
                "evaluated_on": evaluated_on,
                "status": "Challenger (A/B Testing)",
                "benchmark": False,
                "description": "Challenger baseline for A/B testing and drift evaluation.",
            },
            {
                "version": roberta.get("model_version", "roberta-v1"),
                "name": "RoBERTa-base Fine-Tuned" if roberta else "RoBERTa-base (planned)",
                "variant": "C",
                "architecture": roberta.get("architecture", "RoBERTa-base fine-tuned, served via Hugging Face"),
                "accuracy": roberta.get("accuracy"),
                "f1_score": roberta.get("f1_weighted"),
                "evaluated_on": roberta.get("evaluated_on"),
                "status": "Benchmark (Verified)" if roberta else "Not Trained",
                "benchmark": True,
                "description": (
                    "Transformer backend served by Hugging Face (MODEL_BACKEND=roberta)."
                    if roberta else
                    "Not trained yet. Accuracy will be reported here once the CI holdout gate measures it."
                ),
            },
        ]

    def get_comparison(self) -> Dict[str, Any]:
        roberta = self.get_roberta_benchmark()
        return {
            "model_a": self.get_metrics("A"),
            "model_b": self.get_metrics("B"),
            "transformer_benchmark": roberta or {"status": "not_trained", "verified": False},
        }


model_registry = ModelRegistry()

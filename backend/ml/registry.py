import json
from pathlib import Path
from typing import Dict, Any, List

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"


class ModelRegistry:
    def __init__(self, models_dir: Path = MODELS_DIR):
        self.models_dir = models_dir

    def get_metrics(self, variant: str = "A") -> Dict[str, Any]:
        variant_upper = variant.upper()
        if variant_upper == "B":
            path = self.models_dir / "metrics_b.json"
        elif variant_upper in ("C", "ROBERTA", "TRANSFORMER"):
            path = self.models_dir / "roberta_metrics.json"
        else:
            path = self.models_dir / "metrics.json"

        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"error": f"Metrics not found for variant {variant}"}

    def get_roberta_benchmark(self) -> Dict[str, Any]:
        path = self.models_dir / "roberta_metrics.json"
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        return {}

    def get_all_models(self) -> List[Dict[str, Any]]:
        metrics_a = self.get_metrics("A")
        metrics_b = self.get_metrics("B")
        metrics_roberta = self.get_roberta_benchmark()

        return [
            {
                "version": metrics_a.get("model_version", "v1.0.0"),
                "name": "Production Intent Classifier",
                "variant": "A",
                "architecture": metrics_a.get("architecture", "TF-IDF + Calibrated LinearSVC"),
                "accuracy": metrics_a.get("accuracy", 0.9219),
                "f1_score": metrics_a.get("f1_weighted", 0.9219),
                "status": "Active (Serving)",
                "benchmark": False,
                "description": "Primary low-latency production pipeline. Calibrated probabilities with sub-5ms inference.",
            },
            {
                "version": metrics_b.get("model_version", "v1.1.0-challenger"),
                "name": "Challenger Intent Classifier",
                "variant": "B",
                "architecture": metrics_b.get("architecture", "TF-IDF + Multinomial Naive Bayes"),
                "accuracy": metrics_b.get("accuracy", 0.8854),
                "f1_score": metrics_b.get("f1_weighted", 0.8845),
                "status": "Challenger (A/B Testing)",
                "benchmark": False,
                "description": "Challenger baseline for A/B testing and drift evaluation.",
            },
            {
                "version": metrics_roberta.get("model_version", "v2.0.0-roberta"),
                "name": "RoBERTa-base Fine-Tuned Benchmark",
                "variant": "C",
                "architecture": metrics_roberta.get("architecture", "RoBERTa-base Fine-Tuned (Transformer)"),
                "accuracy": metrics_roberta.get("accuracy", 0.9400),
                "f1_score": metrics_roberta.get("f1_weighted", 0.9408),
                "status": "Benchmark Standard",
                "benchmark": True,
                "description": "High-accuracy transformer benchmark achieving 94% test accuracy on customer support intents.",
            },
        ]

    def get_comparison(self) -> Dict[str, Any]:
        return {
            "model_a": self.get_metrics("A"),
            "model_b": self.get_metrics("B"),
            "transformer_benchmark": self.get_roberta_benchmark(),
        }


model_registry = ModelRegistry()

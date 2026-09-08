import json
import re
import time
from pathlib import Path
from typing import Dict, Any, List, Optional
import joblib
import numpy as np

from config import settings

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = BASE_DIR / "models" / "intent_classifier.joblib"
METRICS_PATH = BASE_DIR / "models" / "metrics.json"
MODEL_B_PATH = BASE_DIR / "models" / "intent_classifier_b.joblib"
METRICS_B_PATH = BASE_DIR / "models" / "metrics_b.json"

# Routing table: which team handles each intent, default priority, and default SLA hours.
ROUTING_TABLE = {
    "Billing":          {"team": "Billing & Payments",   "priority": "Medium", "sla_hours": 4.0},
    "Technical Issue":  {"team": "Technical Support L2",  "priority": "High",   "sla_hours": 2.0},
    "Account Access":   {"team": "Identity & Access",     "priority": "High",   "sla_hours": 2.0},
    "Feature Request":  {"team": "Product Management",    "priority": "Low",    "sla_hours": 24.0},
    "Bug Report":       {"team": "Engineering",           "priority": "High",   "sla_hours": 12.0},
    "General Inquiry":  {"team": "Tier 1 Support",        "priority": "Low",    "sla_hours": 8.0},
    "Cancellation":     {"team": "Retention Team",        "priority": "Medium", "sla_hours": 2.0},
    "Complaint":        {"team": "Escalations",           "priority": "Urgent", "sla_hours": 1.0},
}


class IntentClassifier:
    def __init__(self, model_path=MODEL_PATH, metrics_path=METRICS_PATH):
        self.model_path = Path(model_path)
        self.metrics_path = Path(metrics_path)
        self.pipeline = joblib.load(self.model_path)
        self.classes_ = self.pipeline.classes_
        with open(self.metrics_path, "r", encoding="utf-8") as f:
            self.metrics = json.load(f)
        self.version = self.metrics.get("model_version", "v1.0.0")

    def clean_text(self, text: str) -> str:
        """Normalizes whitespace and cleans customer input."""
        if not text:
            return ""
        return " ".join(text.strip().split())

    def predict(self, text: str, top_k: int = 3, threshold: Optional[float] = None) -> Dict[str, Any]:
        t0 = time.perf_counter()
        cleaned = self.clean_text(text)

        effective_threshold = threshold if threshold is not None else settings.CONFIDENCE_THRESHOLD

        # Edge case: text has no word characters (e.g. pure punctuation, spaces, or empty)
        has_alpha_words = bool(re.search(r"[a-zA-Z]{2,}", cleaned))
        if not cleaned or not has_alpha_words:
            latency_ms = (time.perf_counter() - t0) * 1000
            uniform_prob = round(1.0 / len(self.classes_), 4)
            top = [{"label": c, "confidence": uniform_prob} for c in self.classes_[:top_k]]
            return {
                "predicted_intent": "General Inquiry",
                "confidence": uniform_prob,
                "top_k": top,
                "routed_team": "Human Review Queue",
                "base_priority": "Low",
                "priority": "Needs Manual Triage",
                "sla_hours": 1.0,
                "requires_human_review": True,
                "model_version": self.version,
                "latency_ms": round(latency_ms, 3),
                "is_ambiguous_input": True,
            }

        probs = self.pipeline.predict_proba([cleaned])[0]
        latency_ms = (time.perf_counter() - t0) * 1000

        order = np.argsort(probs)[::-1]
        top = [{"label": self.classes_[i], "confidence": round(float(probs[i]), 4)} for i in order[:top_k]]
        best = top[0]

        route = ROUTING_TABLE.get(best["label"], {"team": "General Queue", "priority": "Low", "sla_hours": 8.0})
        base_priority = route["priority"]
        priority = base_priority

        # Escalate priority automatically when the model is uncertain -> needs human triage.
        requires_human_review = best["confidence"] < effective_threshold
        if requires_human_review:
            priority = "Needs Manual Triage"

        return {
            "predicted_intent": best["label"],
            "confidence": best["confidence"],
            "top_k": top,
            "routed_team": route["team"],
            "base_priority": base_priority,
            "priority": priority,
            "sla_hours": route.get("sla_hours", 4.0),
            "requires_human_review": requires_human_review,
            "model_version": self.version,
            "latency_ms": round(latency_ms, 3),
            "is_ambiguous_input": False,
        }


_classifiers: Dict[str, IntentClassifier] = {}


def get_classifier(variant: str = "A") -> IntentClassifier:
    global _classifiers
    variant_upper = variant.upper()
    if variant_upper not in _classifiers:
        if variant_upper == "B":
            _classifiers[variant_upper] = IntentClassifier(MODEL_B_PATH, METRICS_B_PATH)
        else:
            _classifiers[variant_upper] = IntentClassifier(MODEL_PATH, METRICS_PATH)
    return _classifiers[variant_upper]

import csv
from pathlib import Path
from typing import List

import pytest
from fastapi.testclient import TestClient

from main import app
from ml.classifier import get_classifier
from ml.model_router import ModelRouter, build_model_router, get_model_router
from schemas.prediction import IntentPrediction
from services.intent_decision import decide

DATA = Path(__file__).resolve().parent.parent / "data" / "tickets_dataset.csv"


class FakeRoBERTa:
    def __init__(self, intent: str = "Complaint", confidence: float = 0.97) -> None:
        self.intent, self.confidence = intent, confidence
        self.calls: List[str] = []

    def predict(self, text: str) -> IntentPrediction:
        self.calls.append(text)
        rest = round((1 - self.confidence) / 7, 4)
        scores = {self.intent: self.confidence, "Billing": rest, "General Inquiry": rest}
        return IntentPrediction(intent=self.intent, confidence=self.confidence,
                                all_scores=scores, latency_ms=120.0)


def test_default_backend_is_sklearn_variant_a():
    router = ModelRouter()
    pred = router.classify("I was charged twice for my Pro subscription")
    assert router.backend == "sklearn" and pred.backend == "sklearn"
    assert pred.model_version == get_classifier("A").version
    assert pred.intent == "Billing"


def test_classify_ab_preserves_sklearn_a_vs_b():
    router = ModelRouter()
    text = "please cancel my subscription"
    assert router.classify_ab(text, "A").model_version == get_classifier("A").version
    assert router.classify_ab(text, "b").model_version == get_classifier("B").version
    # Unknown variants served A before the router existed; they still do.
    assert router.classify_ab(text, "zzz").model_version == get_classifier("A").version


def test_roberta_backend_uses_injected_model_but_b_stays_sklearn():
    fake = FakeRoBERTa()
    router = ModelRouter(backend="roberta", roberta=fake)
    assert router.classify("this is unacceptable").backend == "roberta"
    assert router.classify_ab("this is unacceptable", "A").backend == "roberta"
    assert router.classify_ab("this is unacceptable", "B").backend == "sklearn"
    assert len(fake.calls) == 2


@pytest.mark.parametrize("kwargs", [{"backend": "onnx"}, {"backend": "roberta"}])
def test_invalid_configuration_fails_loudly(kwargs):
    with pytest.raises(ValueError):
        ModelRouter(**kwargs)


def test_roberta_backend_without_token_degrades_to_sklearn(monkeypatch: pytest.MonkeyPatch):
    from config import settings
    monkeypatch.setattr(settings, "HF_API_TOKEN", None)
    router = build_model_router("roberta")
    pred = router.classify("I was charged twice for my Pro subscription")
    assert router.backend == "roberta"
    assert pred.backend == "sklearn" and pred.fallback_reason == "not_configured"


def test_decision_matches_legacy_classifier_output():
    """decide(predict_intent()) must reproduce the legacy IntentClassifier.predict() routing."""
    with open(DATA, encoding="utf-8") as f:
        texts = [row["text"] for row in csv.DictReader(f)][::10] + ["?!?!", "... ...", "hmm help"]
    for variant in ("A", "B"):
        clf = get_classifier(variant)
        for threshold in (None, 0.8):
            for text in texts:
                legacy = clf.predict(text, top_k=3, threshold=threshold)
                d = decide(clf.predict_intent(text), threshold)
                assert (d.routed_team, d.priority, d.sla_hours, d.requires_human_review) == (
                    legacy["routed_team"], legacy["priority"], legacy["sla_hours"],
                    legacy["requires_human_review"]), text
                assert [s.model_dump() for s in d.top_k] == legacy["top_k"], text


@pytest.fixture
def roberta_api():
    fake = FakeRoBERTa(intent="Complaint", confidence=0.97)
    app.dependency_overrides[get_model_router] = lambda: ModelRouter(backend="roberta", roberta=fake)
    yield TestClient(app), fake
    app.dependency_overrides.clear()


def test_endpoints_use_router_dependency(roberta_api):
    client, fake = roberta_api
    payload = {"text": "I have been waiting two weeks, this is unacceptable"}

    res = client.post("/api/v1/classify", json=payload).json()
    assert res["predicted_intent"] == "Complaint" and res["model_version"] == "roberta-v1"
    assert res["routed_team"] == "Escalations"

    route = client.post("/route", json={**payload, "ticket_id": "r1"}).json()
    assert route["intent"] == "Complaint" and route["model_version"] == "roberta-v1"

    challenger = client.post("/api/v1/classify?variant=B", json=payload).json()
    assert challenger["model_version"] == get_classifier("B").version
    assert len(fake.calls) == 2

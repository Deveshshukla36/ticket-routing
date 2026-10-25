from typing import Any, List, Optional

import pytest
import requests

from ml.circuit_breaker import CircuitBreaker
from ml.roberta_client import INTENT_LABELS, RoBERTaClassifier, text_fingerprint
from schemas.prediction import IntentPrediction


def _scores(top: str, top_score: float = 0.9) -> List[dict]:
    rest = (1.0 - top_score) / (len(INTENT_LABELS) - 1)
    return [{"label": lab, "score": top_score if lab == top else rest} for lab in INTENT_LABELS]


class FakeResponse:
    def __init__(self, status: int, payload: Any = None) -> None:
        self.status_code = status
        self._payload = payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(f"HTTP {self.status_code}", response=self)  # type: ignore[arg-type]

    def json(self) -> Any:
        return self._payload


class FakeSession:
    """Returns queued responses (or raises queued exceptions) in order."""

    def __init__(self, *queue: Any) -> None:
        self.queue = list(queue)
        self.calls: List[dict] = []

    def post(self, url: str, json: Any, headers: dict, timeout: float) -> FakeResponse:
        self.calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        item = self.queue.pop(0)
        if isinstance(item, BaseException):
            raise item
        return item


def fake_fallback(text: str, reason: str) -> IntentPrediction:
    return IntentPrediction(intent="General Inquiry", confidence=0.5, latency_ms=0.1,
                            model_version="v1.0.0", backend="sklearn", fallback_reason=reason)


def make_client(session: FakeSession, breaker: Optional[CircuitBreaker] = None,
                token: Optional[str] = "hf_test") -> RoBERTaClassifier:
    return RoBERTaClassifier(api_token=token, model_id="org/roberta-intent-8class",
                             session=session, breaker=breaker, fallback=fake_fallback,  # type: ignore[arg-type]
                             sleep=lambda _: None)


def test_predict_success_maps_scores_and_sends_auth():
    session = FakeSession(FakeResponse(200, _scores("Billing")))
    pred = make_client(session).predict("I was charged twice this month")
    assert pred.backend == "roberta" and pred.fallback_reason is None
    assert pred.intent == "Billing" and pred.confidence == 0.9
    assert set(pred.all_scores) == set(INTENT_LABELS)
    call = session.calls[0]
    assert call["url"].endswith("/hf-inference/models/org/roberta-intent-8class")
    assert call["headers"]["Authorization"] == "Bearer hf_test"
    assert call["timeout"] == 10.0


def test_generic_label_ids_are_mapped_to_intents():
    payload = [{"label": f"LABEL_{i}", "score": 0.93 if i == 2 else 0.01} for i in range(8)]
    pred = make_client(FakeSession(FakeResponse(200, payload))).predict("the export button crashes")
    assert pred.intent == INTENT_LABELS[2]


def test_batch_uses_one_request_for_nested_response():
    session = FakeSession(FakeResponse(200, [_scores("Billing"), _scores("Complaint")]))
    preds = make_client(session).predict_batch(["refund my invoice", "worst service ever"])
    assert [p.intent for p in preds] == ["Billing", "Complaint"]
    assert len(session.calls) == 1


def test_retries_transient_errors_then_succeeds():
    session = FakeSession(FakeResponse(503), requests.Timeout(), FakeResponse(200, _scores("Cancellation")))
    pred = make_client(session).predict("please cancel my subscription")
    assert pred.backend == "roberta" and pred.intent == "Cancellation"
    assert len(session.calls) == 3


def test_gives_up_after_three_attempts_and_falls_back():
    session = FakeSession(FakeResponse(500), FakeResponse(502), FakeResponse(503))
    pred = make_client(session).predict("please cancel my subscription")
    assert pred.backend == "sklearn" and pred.fallback_reason == "remote_error"
    assert len(session.calls) == 3


def test_auth_errors_are_not_retried():
    session = FakeSession(FakeResponse(401))
    pred = make_client(session).predict("please cancel my subscription")
    assert pred.fallback_reason == "remote_error"
    assert len(session.calls) == 1


def test_unknown_label_falls_back():
    payload = [{"label": "POSITIVE", "score": 0.99}]
    pred = make_client(FakeSession(FakeResponse(200, payload))).predict("love the product")
    assert pred.backend == "sklearn" and pred.fallback_reason == "remote_error"


def test_circuit_opens_after_five_failures_and_recovers():
    now = [0.0]
    breaker = CircuitBreaker(failure_threshold=5, reset_timeout_s=60.0, clock=lambda: now[0])
    session = FakeSession(*[FakeResponse(404) for _ in range(5)], FakeResponse(200, _scores("Billing")))
    client = make_client(session, breaker=breaker)

    for _ in range(5):
        assert client.predict("refund my invoice").fallback_reason == "remote_error"
    assert breaker.state == "open"

    assert client.predict("refund my invoice").fallback_reason == "circuit_open"
    assert len(session.calls) == 5  # no network call while open

    now[0] = 61.0
    assert breaker.state == "half_open"
    assert client.predict("refund my invoice").backend == "roberta"
    assert breaker.state == "closed"


def test_missing_token_degrades_without_network(caplog: pytest.LogCaptureFixture):
    session = FakeSession()
    with caplog.at_level("WARNING", logger="intentroute.roberta"):
        client = make_client(session, token=None)
    assert "HF_API_TOKEN is not set" in caplog.text
    assert client.predict("refund my invoice").fallback_reason == "not_configured"
    assert session.calls == []


def test_logs_never_contain_raw_text_or_token(caplog: pytest.LogCaptureFixture):
    text = "my secret account number is 12345"
    with caplog.at_level("INFO", logger="intentroute.roberta"):
        make_client(FakeSession(FakeResponse(200, _scores("Account Access")))).predict(text)
    assert text not in caplog.text and "hf_test" not in caplog.text
    assert text_fingerprint(text) in caplog.text


def test_real_sklearn_fallback_is_used_by_default():
    client = RoBERTaClassifier(api_token=None)
    pred = client.predict("I was charged twice for my Pro subscription")
    assert pred.backend == "sklearn" and pred.intent == "Billing"
    assert pred.fallback_reason == "not_configured"

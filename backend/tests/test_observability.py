import logging
import uuid
from typing import List, Literal

import pytest
from fastapi.testclient import TestClient

import api.routes_v1 as routes_v1
from main import app
from ml.circuit_breaker import CircuitBreaker
from ml.classifier import get_classifier
from ml.model_router import ModelRouter, get_model_router
from schemas.prediction import IntentPrediction
from services.request_metrics import RequestMetrics, percentile, request_metrics
from utils.request_context import RequestIdFilter, get_request_id, normalize_request_id, request_id_var

client = TestClient(app)


class RecordingRoBERTa:
    """Fake RoBERTa that records the request id visible inside the (threadpool) handler."""

    model_version = "roberta-v1"
    model_id = "org/roberta-intent-8class"

    def __init__(self, fallback_reason: str | None = None) -> None:
        self.breaker = CircuitBreaker(failure_threshold=5, reset_timeout_s=60.0)
        self.seen_request_ids: List[str] = []
        self.fallback_reason = fallback_reason

    def predict(self, text: str) -> IntentPrediction:
        self.seen_request_ids.append(get_request_id())
        backend: Literal["sklearn", "roberta"] = "sklearn" if self.fallback_reason else "roberta"
        return IntentPrediction(intent="Billing", confidence=0.95, all_scores={"Billing": 0.95},
                                latency_ms=1.0, backend=backend, fallback_reason=self.fallback_reason)


@pytest.fixture
def roberta_app():
    fake = RecordingRoBERTa()
    router = ModelRouter(backend="roberta", roberta=fake, on_prediction=request_metrics.record_prediction)
    app.dependency_overrides[get_model_router] = lambda: router
    yield fake
    app.dependency_overrides.clear()


# --- X-Request-ID ---------------------------------------------------------------

def test_request_id_is_generated_and_returned():
    rid = client.get("/api/v1/health").headers["X-Request-ID"]
    assert uuid.UUID(rid).version == 4


def test_client_request_id_is_echoed():
    res = client.get("/api/v1/health", headers={"X-Request-ID": "support-ticket-42"})
    assert res.headers["X-Request-ID"] == "support-ticket-42"


@pytest.mark.parametrize("bad", ["has space", "x" * 200, "evil\r\ninjected", ""])
def test_unsafe_request_ids_are_replaced(bad: str):
    assert normalize_request_id(bad) != bad


def test_request_id_reaches_sync_handlers_and_errors(roberta_app: RecordingRoBERTa):
    client.post("/api/v1/classify", json={"text": "refund my invoice"}, headers={"X-Request-ID": "rid-123"})
    assert roberta_app.seen_request_ids == ["rid-123"]
    assert client.get("/no/such/path").headers["X-Request-ID"]
    assert request_id_var.get() == "-"  # reset after the request


def test_log_records_carry_request_id():
    record = logging.LogRecord("intentroute.test", logging.INFO, __file__, 1, "msg", None, None)
    token = request_id_var.set("rid-log")
    try:
        RequestIdFilter().filter(record)
    finally:
        request_id_var.reset(token)
    assert getattr(record, "request_id") == "rid-log"


# --- /api/v1/health ----------------------------------------------------------------

def test_health_reports_backend_versions_and_db():
    data = client.get("/api/v1/health").json()
    assert data["status"] == "ok" and data["db"] == "ok" and data["backend"] == "sklearn"
    assert data["model_versions"] == {"sklearn_a": get_classifier("A").version,
                                      "sklearn_b": get_classifier("B").version}
    assert data["model_loaded"] is True  # legacy field kept


def test_health_includes_roberta_when_active(roberta_app: RecordingRoBERTa):
    data = client.get("/api/v1/health").json()
    assert data["backend"] == "roberta"
    assert data["model_versions"]["roberta"] == "roberta-v1"
    assert data["model_versions"]["roberta_model_id"] == "org/roberta-intent-8class"


def test_health_degraded_when_db_down(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(routes_v1, "check_db_health", lambda: False)
    res = client.get("/api/v1/health")
    assert res.status_code == 200 and res.json()["status"] == "degraded" and res.json()["db"] == "error"


def test_health_503_when_models_cannot_load():
    def broken(_: str):
        raise FileNotFoundError("intent_classifier.joblib")

    app.dependency_overrides[get_model_router] = lambda: ModelRouter(sklearn_provider=broken)
    try:
        res = client.get("/health")  # root alias shares the same handler
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 503 and res.json()["status"] == "error"


# --- /api/v1/metrics ---------------------------------------------------------------

def test_percentile_nearest_rank():
    assert percentile([], 50) is None
    assert percentile([5.0], 95) == 5.0
    values = [float(v) for v in range(1, 101)]
    assert percentile(values, 50) == 50.0 and percentile(values, 95) == 95.0


def test_metrics_store_uses_route_templates_and_skips_probes_in_latency():
    m = RequestMetrics(window=10)
    m.record_request("GET", "/api/v1/health", 200, 1.0)
    m.record_request("POST", "/api/v1/classify", 200, 20.0)
    m.record_request("POST", "/api/v1/classify", 500, 40.0)
    snap = m.snapshot()
    assert snap["requests_total"] == 3 and snap["requests_by_status"] == {"2xx": 2, "5xx": 1}
    assert snap["latency_ms"]["samples"] == 2
    assert snap["routes"]["POST /api/v1/classify"]["count"] == 2


def test_metrics_endpoint_counts_requests_and_predictions(roberta_app: RecordingRoBERTa):
    before = client.get("/api/v1/metrics").json()
    for _ in range(3):
        client.post("/api/v1/classify", json={"text": "refund my invoice"})
    client.get("/api/v1/does-not-exist")
    after = client.get("/api/v1/metrics").json()

    assert after["requests_total"] >= before["requests_total"] + 5
    assert after["routes"]["POST /api/v1/classify"]["count"] >= 3
    assert after["routes"]["GET unmatched"]["count"] >= 1
    assert after["latency_ms"]["p50"] is not None and after["latency_ms"]["p95"] >= after["latency_ms"]["p50"]
    gained = after["predictions"]["by_backend"].get("roberta", 0) - before["predictions"]["by_backend"].get("roberta", 0)
    assert gained == 3
    assert after["model_backend"] == "roberta"
    assert after["circuit_breaker"] == {"state": "closed", "consecutive_failures": 0,
                                        "failure_threshold": 5, "reset_timeout_s": 60.0}


def test_metrics_show_open_breaker_and_fallbacks():
    fake = RecordingRoBERTa(fallback_reason="circuit_open")
    for _ in range(5):
        fake.breaker.record_failure()
    app.dependency_overrides[get_model_router] = lambda: ModelRouter(
        backend="roberta", roberta=fake, on_prediction=request_metrics.record_prediction)
    try:
        before = client.get("/api/v1/metrics").json()["predictions"]["fallbacks_by_reason"].get("circuit_open", 0)
        client.post("/api/v1/classify", json={"text": "refund my invoice"})
        data = client.get("/api/v1/metrics").json()
    finally:
        app.dependency_overrides.clear()
    assert data["circuit_breaker"]["state"] == "open"
    assert data["predictions"]["fallbacks_by_reason"]["circuit_open"] == before + 1


def test_metrics_breaker_is_null_for_sklearn_backend():
    assert client.get("/api/v1/metrics").json()["circuit_breaker"] is None

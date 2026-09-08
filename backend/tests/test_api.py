import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("healthy", "degraded")
    assert data["model_loaded"] is True
    assert data["model_version"] == "v1.0.0"

    # Test root alias
    root_res = client.get("/health")
    assert root_res.status_code == 200
    assert root_res.json()["model_loaded"] is True


def test_model_info():
    response = client.get("/api/v1/model/info")
    assert response.status_code == 200
    data = response.json()
    assert data["model_version"] == "v1.0.0"
    assert "TF-IDF" in data["architecture"]
    assert data["accuracy"] > 0.90
    assert len(data["labels"]) == 8


def test_model_metrics():
    response = client.get("/api/v1/model/metrics")
    assert response.status_code == 200
    data = response.json()
    assert "per_class" in data
    assert "confusion_matrix" in data
    assert len(data["per_class"]) == 8


def test_model_compare():
    response = client.get("/api/v1/model/compare")
    assert response.status_code == 200
    data = response.json()
    assert "model_a" in data
    assert "model_b" in data
    assert "transformer_benchmark" in data
    # Verify reported 94% RoBERTa benchmark is preserved
    roberta = data["transformer_benchmark"]
    assert roberta["accuracy"] == 0.9400
    assert roberta["model_version"] == "v2.0.0-roberta"


def test_list_models():
    response = client.get("/models")
    assert response.status_code == 200
    models = response.json()
    assert len(models) >= 3
    versions = [m["version"] for m in models]
    assert "v1.0.0" in versions
    assert "v1.1.0-challenger" in versions
    assert "v2.0.0-roberta" in versions


def test_classify_single_ticket():
    payload = {"text": "I was charged twice for my subscription this month", "ticket_id": "test-101"}
    response = client.post("/api/v1/classify", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["predicted_intent"] == "Billing"
    assert data["routed_team"] == "Billing & Payments"
    assert data["confidence"] > 0.50
    assert len(data["top_k"]) == 3
    assert data["ticket_id"] == "test-101"


def test_predict_endpoint_alias():
    payload = {"text": "The app crashes every time I click the export button", "ticket_id": "test-102"}
    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["predicted_intent"] in ("Bug Report", "Technical Issue")
    assert "sentiment" in data


def test_batch_classify():
    payload = {
        "tickets": [
            {"text": "How do I change my billing address?"},
            {"text": "My account has been locked due to too many login attempts."},
            {"text": "Please consider adding support for dark mode in the dashboard."},
        ]
    }
    response = client.post("/api/v1/classify/batch", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 3
    assert len(data["results"]) == 3
    assert data["avg_latency_ms"] >= 0


def test_smart_routing():
    payload = {
        "text": "This service is completely broken and I demand an immediate refund right now!",
        "confidence_threshold": 0.60
    }
    response = client.post("/route", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["sentiment"] in ("Negative", "Urgent")
    assert data["sla_hours"] <= 4.0
    assert "routed_team" in data


def test_feedback_submission():
    payload = {
        "ticket_id": "fb-test-01",
        "text": "I need to reset my MFA device",
        "predicted_intent": "General Inquiry",
        "correct_intent": "Account Access",
        "notes": "Agent corrected prediction"
    }
    response = client.post("/feedback", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "recorded"
    assert data["feedback_count"] >= 1
    assert 0.0 <= data["running_agreement_rate"] <= 1.0


def test_suggest_response_rag():
    payload = {
        "ticket_text": "I was billed twice for my plan yesterday. Can I get a refund?",
        "intent": "Billing",
        "customer_name": "Jane Doe"
    }
    response = client.post("/api/v1/suggest-response", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "refund" in data["suggested_response"].lower()
    assert len(data["action_items"]) > 0
    assert len(data["matched_knowledge"]) > 0

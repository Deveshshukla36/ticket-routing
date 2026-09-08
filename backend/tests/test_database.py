import pytest
from database.connection import init_db, check_db_health, SessionLocal
from database.models import PredictionModel, FeedbackModel
from services.ticket_service import ticket_service
from schemas.ticket import FeedbackIn, ClassificationResult, IntentScore
from datetime import datetime


def test_database_health():
    init_db()
    assert check_db_health() is True


def test_ticket_service_persistence():
    init_db()
    result = ClassificationResult(
        ticket_id="db-test-999",
        text="Can I get an invoice for accounting?",
        predicted_intent="Billing",
        confidence=0.98,
        top_k=[IntentScore(label="Billing", confidence=0.98)],
        routed_team="Billing & Payments",
        priority="Medium",
        model_version="v1.0.0",
        latency_ms=2.5,
        sentiment="Neutral",
        sla_hours=4.0,
        requires_human_review=False,
    )
    ticket_service.log_classification(result, variant="A")

    # Verify query
    history = ticket_service.get_persisted_history(limit=10)
    ticket_ids = [h["ticket_id"] for h in history]
    assert "db-test-999" in ticket_ids


def test_feedback_persistence():
    init_db()
    fb = FeedbackIn(
        ticket_id="db-fb-100",
        text="The screen goes blank",
        predicted_intent="Feature Request",
        correct_intent="Bug Report",
        notes="Corrected by supervisor",
    )
    res = ticket_service.record_feedback(fb)
    assert res.status == "recorded"

    records = ticket_service.get_feedback_records(limit=10)
    fb_ids = [r["ticket_id"] for r in records]
    assert "db-fb-100" in fb_ids

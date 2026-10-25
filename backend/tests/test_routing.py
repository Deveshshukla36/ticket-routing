import pytest

from ml.sentiment import sentiment_analyzer
from schemas.ticket import RouteRequest
from services.routing_service import smart_routing_engine


def test_sentiment_analysis():
    urgent = sentiment_analyzer.analyze("Production is down immediately, critical emergency!")
    assert urgent["sentiment"] == "Urgent"
    assert urgent["is_urgent"] is True

    negative = sentiment_analyzer.analyze("This app is horrible, useless, and keeps crashing.")
    assert negative["sentiment"] in ("Negative", "Urgent")
    assert negative["score"] < 0

    positive = sentiment_analyzer.analyze("Thank you for the great, wonderful, and fast support!")
    assert positive["sentiment"] == "Positive"
    assert positive["score"] > 0

    neutral = sentiment_analyzer.analyze("Where can I find the documentation for user settings?")
    assert neutral["sentiment"] == "Neutral"


def test_low_confidence_escalation():
    # Ambiguous or short gibberish text with high threshold
    request = RouteRequest(
        text="xyz abc 1234 hello something weird",
        confidence_threshold=0.95
    )
    result = smart_routing_engine.route_ticket(request)
    assert result.requires_human_review is True
    assert result.routed_team == "Human Review Queue"
    assert result.priority == "Needs Manual Triage"
    assert result.sla_hours == 1.0


def test_high_confidence_billing_routing():
    request = RouteRequest(
        text="I need an updated invoice copy for my annual subscription payment last week",
        confidence_threshold=0.50
    )
    result = smart_routing_engine.route_ticket(request)
    assert result.intent == "Billing"
    assert result.routed_team == "Billing & Payments"
    assert result.requires_human_review is False
    assert result.top_k is not None
    assert len(result.top_k) >= 3
    assert result.sentiment_score is not None


def test_sentiment_negation():
    negated = sentiment_analyzer.analyze("This service is not good at all and never helpful")
    assert negated["sentiment"] == "Negative"
    assert negated["score"] < 0

    polite_urgent = sentiment_analyzer.analyze("I am locked out of my account, please help thanks")
    assert polite_urgent["sentiment"] == "Urgent"
    assert polite_urgent["is_urgent"] is True


def test_edge_case_empty_and_symbols():
    with pytest.raises(ValueError):
        RouteRequest(text="   ")

    # Non-alphabetic input handled gracefully without crashing
    request = RouteRequest(text="??? !!! ...")
    result = smart_routing_engine.route_ticket(request)
    assert result.requires_human_review is True
    assert result.routed_team == "Human Review Queue"
    assert result.priority == "Needs Manual Triage"


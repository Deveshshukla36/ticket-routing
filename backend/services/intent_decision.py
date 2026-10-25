"""Turns a backend-agnostic IntentPrediction into the base routing decision.

This is the team / priority / SLA / human-review logic that previously lived inside
IntentClassifier.predict(); it is shared here so RoBERTa predictions route identically.
"""
from typing import List, Optional

from pydantic import BaseModel

from config import settings
from ml.classifier import ROUTING_TABLE, Route
from schemas.prediction import IntentPrediction
from schemas.ticket import IntentScore

DEFAULT_ROUTE: Route = {"team": "General Queue", "priority": "Low", "sla_hours": 8.0}
HUMAN_REVIEW_TEAM = "Human Review Queue"
MANUAL_TRIAGE = "Needs Manual Triage"


class IntentDecision(BaseModel):
    routed_team: str
    base_priority: str
    priority: str
    sla_hours: float
    requires_human_review: bool
    top_k: List[IntentScore]


def top_k_scores(pred: IntentPrediction, k: int = 3) -> List[IntentScore]:
    # Stable sort: ties keep the backend's own ranking order.
    ranked = sorted(pred.all_scores.items(), key=lambda kv: kv[1], reverse=True)
    return [IntentScore(label=label, confidence=score) for label, score in ranked[:k]]


def decide(pred: IntentPrediction, threshold: Optional[float] = None, k: int = 3) -> IntentDecision:
    top = top_k_scores(pred, k)
    if pred.is_ambiguous_input:
        return IntentDecision(
            routed_team=HUMAN_REVIEW_TEAM, base_priority="Low", priority=MANUAL_TRIAGE,
            sla_hours=1.0, requires_human_review=True, top_k=top,
        )

    effective = threshold if threshold is not None else settings.CONFIDENCE_THRESHOLD
    route = ROUTING_TABLE.get(pred.intent, DEFAULT_ROUTE)
    needs_review = pred.confidence < effective
    return IntentDecision(
        routed_team=route["team"],
        base_priority=route["priority"],
        priority=MANUAL_TRIAGE if needs_review else route["priority"],
        sla_hours=route.get("sla_hours", 4.0),
        requires_human_review=needs_review,
        top_k=top,
    )

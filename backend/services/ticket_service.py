import logging
from collections import deque, Counter
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from database.connection import SessionLocal
from database.models import (
    TicketModel,
    PredictionModel,
    FeedbackModel,
    RoutingHistoryModel,
)
from schemas.ticket import (
    ClassificationResult,
    FeedbackIn,
    FeedbackResponse,
    RouteResult,
)

logger = logging.getLogger("intent-routing.ticket-service")

# In-memory rolling logs preserved for sub-millisecond real-time monitoring dashboard
PREDICTION_LOG = deque(maxlen=500)
FEEDBACK_LOG = deque(maxlen=500)


class TicketService:
    """
    Handles logging, persistence, feedback collection, and history retrieval.
    Dual-writes to in-memory deque (for instant dashboard speed) and SQLite/PostgreSQL (for persistence).
    """

    def log_classification(self, result: ClassificationResult, variant: str = "A") -> None:
        # In-memory append
        entry = result.model_dump(mode="json")
        entry["variant"] = variant
        PREDICTION_LOG.append(entry)

        # Database persistence
        try:
            with SessionLocal() as db:
                pred_db = PredictionModel(
                    ticket_id=result.ticket_id or "UNKNOWN",
                    text=result.text,
                    predicted_intent=result.predicted_intent,
                    confidence=result.confidence,
                    top_k_json=[item.model_dump() for item in result.top_k],
                    routed_team=result.routed_team,
                    priority=result.priority,
                    sentiment=result.sentiment or "Neutral",
                    sla_hours=result.sla_hours or 4.0,
                    requires_human_review=result.requires_human_review or False,
                    model_version=result.model_version,
                    latency_ms=result.latency_ms,
                    variant=variant,
                    timestamp=result.timestamp,
                )
                db.add(pred_db)

                # Track in routing history
                route_history = RoutingHistoryModel(
                    ticket_id=result.ticket_id or "UNKNOWN",
                    routed_team=result.routed_team,
                    priority=result.priority,
                    status="Manual Review" if result.requires_human_review else "Routed",
                    updated_at=datetime.now(timezone.utc),
                )
                db.add(route_history)
                db.commit()
        except Exception as e:
            logger.warning(f"Failed to persist prediction to DB: {e}")

    def log_route_result(self, result: RouteResult, variant: str = "A") -> None:
        entry = result.model_dump(mode="json")
        entry["variant"] = variant
        PREDICTION_LOG.append(entry)

        try:
            with SessionLocal() as db:
                pred_db = PredictionModel(
                    ticket_id=result.ticket_id,
                    text=result.text,
                    predicted_intent=result.intent,
                    confidence=result.confidence,
                    top_k_json=[item.model_dump() for item in result.top_k] if result.top_k else [],
                    routed_team=result.routed_team,
                    priority=result.priority,
                    sentiment=result.sentiment,
                    sla_hours=result.sla_hours,
                    requires_human_review=result.requires_human_review,
                    model_version=result.model_version,
                    latency_ms=result.latency_ms,
                    variant=variant,
                    timestamp=result.timestamp,
                )
                db.add(pred_db)

                route_history = RoutingHistoryModel(
                    ticket_id=result.ticket_id,
                    routed_team=result.routed_team,
                    priority=result.priority,
                    status="Manual Review" if result.requires_human_review else "Routed",
                    notes=result.routing_reason,
                    updated_at=datetime.now(timezone.utc),
                )
                db.add(route_history)
                db.commit()
        except Exception as e:
            logger.warning(f"Failed to persist route to DB: {e}")

    def record_feedback(self, feedback: FeedbackIn) -> FeedbackResponse:
        f_entry = {**feedback.model_dump(), "timestamp": datetime.now(timezone.utc).isoformat()}
        FEEDBACK_LOG.append(f_entry)

        try:
            with SessionLocal() as db:
                fb_db = FeedbackModel(
                    ticket_id=feedback.ticket_id,
                    text=feedback.text,
                    predicted_intent=feedback.predicted_intent,
                    correct_intent=feedback.correct_intent,
                    notes=feedback.notes,
                    reviewer=feedback.reviewer or "Human Agent",
                    timestamp=datetime.now(timezone.utc),
                )
                db.add(fb_db)
                db.commit()
        except Exception as e:
            logger.warning(f"Failed to persist feedback to DB: {e}")

        correct = sum(1 for f in FEEDBACK_LOG if f["predicted_intent"] == f["correct_intent"])
        agreement_rate = round(correct / len(FEEDBACK_LOG), 4) if FEEDBACK_LOG else 1.0

        return FeedbackResponse(
            status="recorded",
            feedback_count=len(FEEDBACK_LOG),
            running_agreement_rate=agreement_rate,
            message=f"Feedback captured. Agreement rate: {agreement_rate*100:.1f}%",
        )

    def get_recent_monitoring(self, limit: int = 50) -> Dict[str, Any]:
        items = list(PREDICTION_LOG)[-limit:]
        intent_counts = Counter(
            i.get("predicted_intent") or i.get("intent") for i in PREDICTION_LOG
        )
        confidences = [
            i.get("confidence", 0.0) for i in PREDICTION_LOG if "confidence" in i
        ]
        avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

        return {
            "recent": items,
            "total_logged": len(PREDICTION_LOG),
            "intent_distribution": dict(intent_counts),
            "avg_confidence": round(avg_conf, 4),
        }

    def get_persisted_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        try:
            with SessionLocal() as db:
                records = (
                    db.query(PredictionModel)
                    .order_by(PredictionModel.id.desc())
                    .limit(limit)
                    .all()
                )
                return [
                    {
                        "ticket_id": r.ticket_id,
                        "text": r.text,
                        "predicted_intent": r.predicted_intent,
                        "confidence": r.confidence,
                        "routed_team": r.routed_team,
                        "priority": r.priority,
                        "sentiment": r.sentiment,
                        "sla_hours": r.sla_hours,
                        "requires_human_review": r.requires_human_review,
                        "model_version": r.model_version,
                        "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                    }
                    for r in records
                ]
        except Exception as e:
            logger.error(f"Error fetching persisted history: {e}")
            return list(PREDICTION_LOG)[-limit:]

    def get_feedback_records(self, limit: int = 100) -> List[Dict[str, Any]]:
        try:
            with SessionLocal() as db:
                records = (
                    db.query(FeedbackModel)
                    .order_by(FeedbackModel.id.desc())
                    .limit(limit)
                    .all()
                )
                return [
                    {
                        "ticket_id": r.ticket_id,
                        "text": r.text,
                        "predicted_intent": r.predicted_intent,
                        "correct_intent": r.correct_intent,
                        "notes": r.notes,
                        "reviewer": r.reviewer,
                        "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                    }
                    for r in records
                ]
        except Exception as e:
            logger.error(f"Error fetching feedback records: {e}")
            return list(FEEDBACK_LOG)[-limit:]


ticket_service = TicketService()

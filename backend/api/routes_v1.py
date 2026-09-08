import time
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query, Depends

from schemas.ticket import (
    TicketIn,
    BatchTicketIn,
    ClassificationResult,
    BatchClassificationResult,
    RouteRequest,
    RouteResult,
    FeedbackIn,
    FeedbackResponse,
)
from schemas.model import (
    HealthStatus,
    ModelInfo,
    ModelComparisonResponse,
    ModelRegistryItem,
)
from schemas.ai import (
    AIResponseRequest,
    AIResponseResult,
)
from ml.classifier import get_classifier
from ml.registry import model_registry
from ml.sentiment import sentiment_analyzer
from services.routing_service import smart_routing_engine
from services.rag_service import rag_service
from services.ticket_service import ticket_service
from database.connection import check_db_health
from config import settings

router = APIRouter()
START_TIME = time.time()


def _classify_one(ticket: TicketIn, variant: str = "A") -> ClassificationResult:
    clf = get_classifier(variant)
    result = clf.predict(ticket.text)
    
    # Enrich with sentiment
    s_res = sentiment_analyzer.analyze(ticket.text)
    
    record = ClassificationResult(
        ticket_id=ticket.ticket_id,
        text=ticket.text,
        predicted_intent=result["predicted_intent"],
        confidence=result["confidence"],
        top_k=result["top_k"],
        routed_team=result["routed_team"],
        priority=result["priority"],
        model_version=result["model_version"],
        latency_ms=result["latency_ms"],
        timestamp=datetime.now(timezone.utc),
        sentiment=s_res["sentiment"],
        sla_hours=result.get("sla_hours", 4.0),
        requires_human_review=result.get("requires_human_review", False),
    )
    ticket_service.log_classification(record, variant=variant)
    return record


# ---------------------------------------------------------------------------
# Health & Model Metadata (Preserved)
# ---------------------------------------------------------------------------
@router.get("/health", response_model=HealthStatus, tags=["Monitoring"])
def health():
    try:
        clf = get_classifier("A")
        loaded = True
        version = clf.version
    except Exception:
        loaded = False
        version = "unknown"
    
    db_ok = check_db_health()
    status_str = "healthy" if (loaded and db_ok) else ("degraded" if loaded else "unhealthy")

    return HealthStatus(
        status=status_str,
        model_loaded=loaded,
        model_version=version,
        uptime_seconds=round(time.time() - START_TIME, 2),
        database_connected=db_ok,
        environment=settings.ENVIRONMENT,
    )


@router.get("/model/info", response_model=ModelInfo, tags=["Monitoring"])
def model_info(variant: str = "A"):
    clf = get_classifier(variant)
    m = clf.metrics
    return ModelInfo(
        model_version=m["model_version"],
        architecture=m["architecture"],
        accuracy=m["accuracy"],
        f1_weighted=m["f1_weighted"],
        train_samples=m["train_samples"],
        test_samples=m["test_samples"],
        labels=m["labels"],
    )


@router.get("/model/metrics", tags=["Monitoring"])
def model_metrics(variant: str = "A"):
    """Full metrics blob incl. per-class precision/recall and confusion matrix."""
    return model_registry.get_metrics(variant)


@router.get("/model/compare", response_model=ModelComparisonResponse, tags=["A/B Testing"])
def model_compare():
    """Side-by-side metrics for production, challenger, and RoBERTa 94% benchmark."""
    return model_registry.get_comparison()


@router.get("/models", response_model=List[ModelRegistryItem], tags=["Model Registry"])
def list_models():
    """Returns all registered models, variants, and benchmarks."""
    return model_registry.get_all_models()


# ---------------------------------------------------------------------------
# Classification & Prediction (Preserved & Enhanced)
# ---------------------------------------------------------------------------
@router.post("/classify", response_model=ClassificationResult, tags=["Classification"])
def classify(ticket: TicketIn, variant: str = "A"):
    try:
        return _classify_one(ticket, variant)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict", response_model=ClassificationResult, tags=["Classification"])
def predict(ticket: TicketIn, variant: str = "A"):
    """Standardized /predict endpoint for real-time ticket inference."""
    return classify(ticket, variant)


@router.post("/classify/batch", response_model=BatchClassificationResult, tags=["Classification"])
def classify_batch(batch: BatchTicketIn, variant: str = "A"):
    try:
        results = [_classify_one(t, variant) for t in batch.tickets]
        avg_latency = sum(r.latency_ms for r in results) / len(results)
        return BatchClassificationResult(
            results=results, count=len(results), avg_latency_ms=round(avg_latency, 3)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Smart Routing Engine
# ---------------------------------------------------------------------------
@router.post("/route", response_model=RouteResult, tags=["Routing"])
def smart_route(request: RouteRequest):
    """
    Enterprise smart ticket routing:
    Calculates Intent + Confidence + Sentiment + Priority -> Team + SLA + Human Review Escalation.
    """
    try:
        result = smart_routing_engine.route_ticket(request)
        ticket_service.log_route_result(result, variant=request.variant or "A")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Monitoring, History & Feedback
# ---------------------------------------------------------------------------
@router.get("/monitoring/recent", tags=["Monitoring"])
def recent_predictions(limit: int = 50):
    """Rolling log of recent predictions + drift stats."""
    return ticket_service.get_recent_monitoring(limit=limit)


@router.get("/history", tags=["Persistence"])
def ticket_history(limit: int = 50):
    """Fetches persistent history from SQLite/PostgreSQL."""
    return ticket_service.get_persisted_history(limit=limit)


@router.post("/feedback", response_model=FeedbackResponse, tags=["Feedback"])
def submit_feedback(feedback: FeedbackIn):
    """Human-in-the-loop correction, stored in database for continuous retraining."""
    return ticket_service.record_feedback(feedback)


@router.get("/feedback/list", tags=["Feedback"])
def list_feedback(limit: int = 50):
    """Returns stored feedback records for review and retraining datasets."""
    return ticket_service.get_feedback_records(limit=limit)


# ---------------------------------------------------------------------------
# AI / RAG Response Assistance & Knowledge Base
# ---------------------------------------------------------------------------
@router.get("/knowledge-base", tags=["AI Assistance"])
def list_knowledge_base():
    """Returns curated resolution playbooks and SOPs for all intent categories."""
    from services.rag_service import KNOWLEDGE_BASE
    return KNOWLEDGE_BASE


@router.post("/suggest-response", response_model=AIResponseResult, tags=["AI Assistance"])
def suggest_response(request: AIResponseRequest):
    """
    Retrieval-Augmented response and resolution recommendation.
    Functions 100% offline without API keys.
    """
    try:
        return rag_service.suggest_response(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

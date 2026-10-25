import logging
import time
from datetime import datetime, timezone
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException, Response

from config import settings
from database.connection import check_db_health
from ml.model_router import ModelRouter, get_model_router
from ml.registry import model_registry
from ml.sentiment import sentiment_analyzer
from schemas.ai import (
    AIResponseRequest,
    AIResponseResult,
)
from schemas.model import (
    CircuitBreakerStatus,
    HealthStatus,
    ModelComparisonResponse,
    ModelInfo,
    ModelRegistryItem,
    ServiceMetrics,
)
from schemas.ticket import (
    BatchClassificationResult,
    BatchTicketIn,
    ClassificationResult,
    FeedbackIn,
    FeedbackResponse,
    RouteRequest,
    RouteResult,
    TicketIn,
)
from services.intent_decision import decide
from services.rag_service import rag_service
from services.request_metrics import request_metrics
from services.routing_service import smart_routing_engine
from services.ticket_service import ticket_service

router = APIRouter()
logger = logging.getLogger("intentroute.api")
START_TIME = time.time()


def _classify_one(ticket: TicketIn, model_router: ModelRouter, variant: str = "A") -> ClassificationResult:
    pred = model_router.classify_ab(ticket.text, variant)
    decision = decide(pred)

    # Enrich with sentiment
    s_res = sentiment_analyzer.analyze(ticket.text)
    
    record = ClassificationResult(
        ticket_id=ticket.ticket_id,
        text=ticket.text,
        predicted_intent=pred.intent,
        confidence=pred.confidence,
        top_k=decision.top_k,
        routed_team=decision.routed_team,
        priority=decision.priority,
        model_version=pred.model_version,
        latency_ms=pred.latency_ms,
        timestamp=datetime.now(timezone.utc),
        sentiment=s_res["sentiment"],
        sla_hours=decision.sla_hours,
        requires_human_review=decision.requires_human_review,
    )
    ticket_service.log_classification(record, variant=variant)
    return record


# ---------------------------------------------------------------------------
# Health & Model Metadata (Preserved)
# ---------------------------------------------------------------------------
@router.get("/health", response_model=HealthStatus, tags=["Monitoring"])
def health(response: Response, model_router: ModelRouter = Depends(get_model_router)) -> HealthStatus:
    """Liveness/readiness. 200 for ok/degraded (still serving), 503 when no model can load."""
    try:
        versions = model_router.model_versions()
        loaded = True
    except Exception:
        logger.exception("Health check: sklearn models failed to load")
        versions, loaded = {}, False

    db_ok = check_db_health()  # SELECT 1
    status: Literal["ok", "degraded", "error"] = "ok" if (loaded and db_ok) else ("degraded" if loaded else "error")
    if status == "error":
        response.status_code = 503

    return HealthStatus(
        status=status,
        backend=model_router.backend,
        model_versions=versions,
        db="ok" if db_ok else "error",
        model_loaded=loaded,
        model_version=versions.get("sklearn_a", "unknown"),
        uptime_seconds=round(time.time() - START_TIME, 2),
        database_connected=db_ok,
        environment=settings.ENVIRONMENT,
    )


@router.get("/metrics", response_model=ServiceMetrics, tags=["Monitoring"])
def service_metrics(model_router: ModelRouter = Depends(get_model_router)) -> ServiceMetrics:
    """Request count, p50/p95 latency, prediction backends/fallbacks, circuit-breaker state.

    Not to be confused with /api/v1/model/metrics (stored model evaluation metrics).
    """
    breaker = model_router.circuit_breaker()
    breaker_status = None
    if breaker is not None:
        breaker_status = CircuitBreakerStatus(
            state=breaker.state,
            consecutive_failures=breaker.consecutive_failures,
            failure_threshold=breaker.failure_threshold,
            reset_timeout_s=breaker.reset_timeout_s,
        )
    return ServiceMetrics.model_validate(
        {"model_backend": model_router.backend, "circuit_breaker": breaker_status, **request_metrics.snapshot()}
    )


@router.get("/model/info", response_model=ModelInfo, tags=["Monitoring"])
def model_info(variant: str = "A", model_router: ModelRouter = Depends(get_model_router)):
    clf = model_router.sklearn_model(variant)
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
def classify(ticket: TicketIn, variant: str = "A", model_router: ModelRouter = Depends(get_model_router)):
    try:
        return _classify_one(ticket, model_router, variant)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict", response_model=ClassificationResult, tags=["Classification"])
def predict(ticket: TicketIn, variant: str = "A", model_router: ModelRouter = Depends(get_model_router)):
    """Standardized /predict endpoint for real-time ticket inference."""
    return classify(ticket, variant, model_router)


@router.post("/classify/batch", response_model=BatchClassificationResult, tags=["Classification"])
def classify_batch(batch: BatchTicketIn, variant: str = "A", model_router: ModelRouter = Depends(get_model_router)):
    try:
        results = [_classify_one(t, model_router, variant) for t in batch.tickets]
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
def smart_route(request: RouteRequest, model_router: ModelRouter = Depends(get_model_router)):
    """
    Enterprise smart ticket routing:
    Calculates Intent + Confidence + Sentiment + Priority -> Team + SLA + Human Review Escalation.
    """
    try:
        result = smart_routing_engine.route_ticket(request, model_router)
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

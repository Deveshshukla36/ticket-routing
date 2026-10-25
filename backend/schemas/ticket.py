from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class TicketIn(BaseModel):
    text: str = Field(..., min_length=3, max_length=4000, description="Raw customer ticket text")
    ticket_id: Optional[str] = Field(None, description="Optional external ticket identifier")

    @field_validator("text")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text must not be blank")
        return v.strip()


class BatchTicketIn(BaseModel):
    tickets: List[TicketIn] = Field(..., min_length=1, max_length=500)


class IntentScore(BaseModel):
    label: str
    confidence: float


class ClassificationResult(BaseModel):
    ticket_id: Optional[str] = None
    text: str
    predicted_intent: str
    confidence: float
    top_k: List[IntentScore]
    routed_team: str
    priority: str
    model_version: str
    latency_ms: float
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Augmented enterprise fields
    sentiment: Optional[str] = "Neutral"
    sla_hours: Optional[float] = 4.0
    requires_human_review: Optional[bool] = False


class BatchClassificationResult(BaseModel):
    results: List[ClassificationResult]
    count: int
    avg_latency_ms: float


class RouteRequest(BaseModel):
    text: str = Field(..., min_length=3, max_length=4000)
    ticket_id: Optional[str] = None
    confidence_threshold: Optional[float] = None
    variant: Optional[str] = "A"

    @field_validator("text")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text must not be blank")
        return v.strip()


class RouteResult(BaseModel):
    ticket_id: str
    text: str
    intent: str
    confidence: float
    sentiment: str
    priority: str
    routed_team: str
    sla_hours: float
    sla_label: str
    requires_human_review: bool
    routing_reason: str
    model_version: str
    latency_ms: float
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    top_k: Optional[List[IntentScore]] = None
    sentiment_score: Optional[float] = 0.0


class FeedbackIn(BaseModel):
    ticket_id: Optional[str] = None
    text: str
    predicted_intent: str
    correct_intent: str
    notes: Optional[str] = None
    reviewer: Optional[str] = "Human Agent"


class FeedbackResponse(BaseModel):
    status: str
    feedback_count: int
    running_agreement_rate: float
    message: Optional[str] = None

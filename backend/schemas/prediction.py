from typing import Dict, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

ModelBackend = Literal["sklearn", "roberta"]


class IntentPrediction(BaseModel):
    """Backend-agnostic intent prediction shared by the sklearn and RoBERTa paths."""

    model_config = ConfigDict(frozen=True, protected_namespaces=())

    intent: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    all_scores: Dict[str, float] = Field(default_factory=dict)
    model_version: str = "roberta-v1"
    latency_ms: float = Field(..., ge=0.0)
    # Which backend actually produced this prediction, and why it is not the requested one.
    backend: ModelBackend = "roberta"
    fallback_reason: Optional[str] = None
    # Input had no real words (e.g. "?!?!"); routing sends these straight to human review.
    is_ambiguous_input: bool = False

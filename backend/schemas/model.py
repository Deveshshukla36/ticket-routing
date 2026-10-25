from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class HealthStatus(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    # "ok": model + DB fine; "degraded": serving, DB unreachable; "error": no model (HTTP 503).
    status: Literal["ok", "degraded", "error"]
    backend: str = "sklearn"
    model_versions: Dict[str, str] = Field(default_factory=dict)
    db: Literal["ok", "error"] = "ok"
    # Pre-v2 fields, kept for existing clients.
    model_loaded: bool
    model_version: str
    uptime_seconds: float
    database_connected: Optional[bool] = True
    environment: Optional[str] = "production"


class CircuitBreakerStatus(BaseModel):
    state: Literal["closed", "open", "half_open"]
    consecutive_failures: int
    failure_threshold: int
    reset_timeout_s: float


class ServiceMetrics(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_backend: str
    uptime_seconds: float
    requests_total: int
    requests_by_status: Dict[str, int]
    latency_ms: Dict[str, Any]
    routes: Dict[str, Dict[str, Any]]
    predictions: Dict[str, Dict[str, int]]
    circuit_breaker: Optional[CircuitBreakerStatus] = None
    note: str = (
        "In-memory, per-process, reset on restart. A multi-instance deployment would "
        "export these as Prometheus metrics instead."
    )


class ModelInfo(BaseModel):
    model_version: str
    architecture: str
    accuracy: float
    f1_weighted: float
    train_samples: int
    test_samples: int
    labels: List[str]


class ClassMetric(BaseModel):
    precision: float
    recall: float
    f1_score: float
    support: float


class ModelMetricsDetailed(BaseModel):
    model_version: str
    architecture: str
    accuracy: float
    f1_weighted: float
    train_samples: int
    test_samples: int
    labels: List[str]
    per_class: Dict[str, Any]
    confusion_matrix: Optional[List[List[int]]] = None


class ModelComparisonResponse(BaseModel):
    model_a: Dict[str, Any]
    model_b: Dict[str, Any]
    transformer_benchmark: Optional[Dict[str, Any]] = None


class ModelRegistryItem(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    version: str
    name: str
    variant: str
    architecture: str
    # None until a model has a reproducible evaluation (e.g. RoBERTa before training).
    accuracy: Optional[float] = None
    f1_score: Optional[float] = None
    evaluated_on: Optional[str] = None
    status: str
    benchmark: bool = False
    description: str

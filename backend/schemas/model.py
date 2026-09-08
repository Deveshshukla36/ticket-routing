from typing import List, Dict, Any, Optional
from pydantic import BaseModel


class HealthStatus(BaseModel):
    status: str
    model_loaded: bool
    model_version: str
    uptime_seconds: float
    database_connected: Optional[bool] = True
    environment: Optional[str] = "production"


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
    version: str
    architecture: str
    accuracy: float
    f1_score: float
    status: str
    benchmark: bool = False
    description: str

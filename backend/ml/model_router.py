"""Selects which intent model serves a request (strategy pattern).

MODEL_BACKEND=sklearn (default) -> sklearn Variant A, exactly as before.
MODEL_BACKEND=roberta           -> RoBERTa via Hugging Face, falling back to sklearn A.

A/B semantics for `variant`: "B" always means the sklearn challenger; any other value
means the primary model for the configured backend. With the default sklearn backend
this is identical to the pre-router behaviour (unknown variants already served A).
"""
from functools import lru_cache
from typing import Callable, Dict, Optional, Protocol, get_args

from config import settings
from ml.circuit_breaker import CircuitBreaker
from ml.classifier import IntentClassifier, get_classifier
from schemas.prediction import IntentPrediction, ModelBackend


class IntentModel(Protocol):
    def predict(self, text: str) -> IntentPrediction: ...


SklearnProvider = Callable[[str], IntentClassifier]
PredictionHook = Callable[[IntentPrediction], None]


class ModelRouter:
    def __init__(
        self,
        backend: ModelBackend = "sklearn",
        sklearn_provider: SklearnProvider = get_classifier,
        roberta: Optional[IntentModel] = None,
        on_prediction: Optional[PredictionHook] = None,
    ) -> None:
        if backend not in get_args(ModelBackend):
            raise ValueError(f"MODEL_BACKEND must be one of {get_args(ModelBackend)}, got {backend!r}")
        if backend == "roberta" and roberta is None:
            raise ValueError("backend='roberta' requires a RoBERTa classifier instance")
        self.backend: ModelBackend = backend
        self._sklearn = sklearn_provider
        self._roberta = roberta
        self._on_prediction = on_prediction

    def classify(self, text: str) -> IntentPrediction:
        """Classify with the primary model for the configured backend."""
        if self.backend == "roberta" and self._roberta is not None:
            return self._observe(self._roberta.predict(text))
        return self._observe(self._sklearn("A").predict_intent(text))

    def classify_ab(self, text: str, version: str) -> IntentPrediction:
        """A/B entry point: "B" -> sklearn challenger, anything else -> primary model."""
        if version.upper() == "B":
            return self._observe(self._sklearn("B").predict_intent(text))
        return self.classify(text)

    def sklearn_model(self, variant: str = "A") -> IntentClassifier:
        """Underlying sklearn model, for metadata (version, metrics) rather than inference."""
        return self._sklearn(variant)

    def model_versions(self) -> Dict[str, str]:
        """Versions of every model this router can serve (loads sklearn models if needed)."""
        versions = {"sklearn_a": self._sklearn("A").version, "sklearn_b": self._sklearn("B").version}
        if self.backend == "roberta" and self._roberta is not None:
            versions["roberta"] = str(getattr(self._roberta, "model_version", "unknown"))
            model_id = getattr(self._roberta, "model_id", None)
            if model_id:
                versions["roberta_model_id"] = str(model_id)
        return versions

    def circuit_breaker(self) -> Optional[CircuitBreaker]:
        """The RoBERTa client's breaker, or None when RoBERTa is not the active backend."""
        breaker = getattr(self._roberta, "breaker", None) if self.backend == "roberta" else None
        return breaker if isinstance(breaker, CircuitBreaker) else None

    def _observe(self, pred: IntentPrediction) -> IntentPrediction:
        if self._on_prediction is not None:
            self._on_prediction(pred)
        return pred


def build_model_router(backend: Optional[str] = None, on_prediction: Optional[PredictionHook] = None) -> ModelRouter:
    selected = (backend or settings.MODEL_BACKEND).strip().lower()
    if selected == "roberta":
        from ml.roberta_client import RoBERTaClassifier

        return ModelRouter(backend="roberta", roberta=RoBERTaClassifier.from_settings(), on_prediction=on_prediction)
    return ModelRouter(backend=selected, on_prediction=on_prediction)  # type: ignore[arg-type]  # validated in __init__


@lru_cache(maxsize=1)
def get_model_router() -> ModelRouter:
    """FastAPI dependency: one router per process; override in tests via dependency_overrides."""
    from services.request_metrics import request_metrics

    return build_model_router(on_prediction=request_metrics.record_prediction)

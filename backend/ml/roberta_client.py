"""RoBERTa intent classifier served over HTTP by Hugging Face.

Works with both the Inference Providers router (serverless, `HF_MODEL_ID`) and a
dedicated Inference Endpoint (`HF_ENDPOINT_URL`). Deliberately imports no torch or
transformers, so the deployed API stays small (no model weights in the Render process). Any failure degrades
to the sklearn Variant A classifier; see docs/adr/001-roberta-serving.md.
"""
import hashlib
import logging
import re
import time
from typing import Any, Callable, Dict, List, Optional, Sequence

import requests
from tenacity import Retrying, retry_if_exception, stop_after_attempt, wait_exponential

from config import settings
from ml.circuit_breaker import CircuitBreaker
from ml.classifier import ROUTING_TABLE, get_classifier
from schemas.prediction import IntentPrediction

logger = logging.getLogger("intentroute.roberta")

ROUTER_BASE_URL = "https://router.huggingface.co/hf-inference/models"
# Label order used by train_transformer.py (sorted), so LABEL_<n> maps to INTENT_LABELS[n].
INTENT_LABELS: List[str] = sorted(ROUTING_TABLE)
_GENERIC_LABEL = re.compile(r"^LABEL_(\d+)$")
_HAS_WORDS = re.compile(r"[a-zA-Z]{2,}")

FallbackFn = Callable[[str, str], IntentPrediction]


class RoBERTaResponseError(RuntimeError):
    """The HF response could not be mapped onto the 8 intent labels."""


def text_fingerprint(text: str) -> str:
    """Short, non-reversible id for logs: raw ticket text is never logged."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def sklearn_fallback(text: str, reason: str) -> IntentPrediction:
    """Classify with sklearn Variant A and mark the prediction as a fallback."""
    return get_classifier("A").predict_intent(text).model_copy(update={"fallback_reason": reason})


def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, (requests.Timeout, requests.ConnectionError)):
        return True
    if isinstance(exc, requests.HTTPError) and exc.response is not None:
        # 429 rate limit, 503 model loading / cold start, other 5xx transient.
        return exc.response.status_code == 429 or exc.response.status_code >= 500
    return False


class RoBERTaClassifier:
    def __init__(
        self,
        api_token: Optional[str],
        model_id: Optional[str] = None,
        endpoint_url: Optional[str] = None,
        *,
        model_version: str = "roberta-v1",
        timeout_s: float = 10.0,
        max_attempts: int = 3,
        backoff_base_s: float = 0.5,
        batch_size: int = 32,
        breaker: Optional[CircuitBreaker] = None,
        session: Optional[requests.Session] = None,
        fallback: FallbackFn = sklearn_fallback,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.model_id = model_id
        self.model_version = model_version
        self.timeout_s = timeout_s
        self.max_attempts = max_attempts
        self.backoff_base_s = backoff_base_s
        self.batch_size = batch_size
        self.breaker = breaker or CircuitBreaker(failure_threshold=5, reset_timeout_s=60.0)
        self._token = api_token
        self._url = endpoint_url or (f"{ROUTER_BASE_URL}/{model_id}" if model_id else None)
        self._session = session or requests.Session()
        self._fallback = fallback
        self._sleep = sleep

        if not self._token:
            logger.warning("HF_API_TOKEN is not set; RoBERTa disabled, using sklearn fallback")
        elif not self._url:
            logger.warning("Neither HF_MODEL_ID nor HF_ENDPOINT_URL is set; using sklearn fallback")

    @classmethod
    def from_settings(cls, **overrides: Any) -> "RoBERTaClassifier":
        return cls(
            api_token=settings.HF_API_TOKEN,
            model_id=settings.HF_MODEL_ID,
            endpoint_url=settings.HF_ENDPOINT_URL,
            **overrides,
        )

    @property
    def is_configured(self) -> bool:
        return bool(self._token and self._url)

    def predict(self, text: str) -> IntentPrediction:
        return self.predict_batch([text])[0]

    def predict_batch(self, texts: Sequence[str]) -> List[IntentPrediction]:
        results: List[Optional[IntentPrediction]] = [None] * len(texts)
        remote_idx: List[int] = []
        for i, text in enumerate(texts):
            if not self.is_configured:
                results[i] = self._fallback(text, "not_configured")
            elif not _HAS_WORDS.search(text or ""):
                results[i] = self._fallback(text, "ambiguous_input")
            else:
                remote_idx.append(i)

        for start in range(0, len(remote_idx), self.batch_size):
            chunk = remote_idx[start:start + self.batch_size]
            for i, pred in zip(chunk, self._predict_chunk([texts[i] for i in chunk])):
                results[i] = pred

        return [r for r in results if r is not None]

    def _predict_chunk(self, texts: List[str]) -> List[IntentPrediction]:
        if not self.breaker.allow_request():
            logger.warning("Circuit open; %d request(s) routed to sklearn fallback", len(texts))
            return [self._fallback(t, "circuit_open") for t in texts]

        t0 = time.perf_counter()
        try:
            payload = self._post_with_retries(texts)
            score_lists = self._normalize_response(payload, expected=len(texts))
        except (requests.RequestException, RoBERTaResponseError) as exc:
            self.breaker.record_failure()
            logger.warning(
                "RoBERTa call failed (model=%s, n=%d, consecutive_failures=%d, breaker=%s): %r",
                self.model_id, len(texts), self.breaker.consecutive_failures, self.breaker.state, exc,
            )
            return [self._fallback(t, "remote_error") for t in texts]

        self.breaker.record_success()
        latency_ms = round((time.perf_counter() - t0) * 1000 / len(texts), 3)
        predictions = []
        for text, scores in zip(texts, score_lists):
            intent = max(scores, key=scores.__getitem__)
            pred = IntentPrediction(
                intent=intent,
                confidence=scores[intent],
                all_scores=scores,
                model_version=self.model_version,
                latency_ms=latency_ms,
            )
            logger.info(
                "roberta prediction model=%s intent=%s confidence=%.4f latency_ms=%.1f text_id=%s",
                self.model_id, pred.intent, pred.confidence, latency_ms, text_fingerprint(text),
            )
            predictions.append(pred)
        return predictions

    def _post_with_retries(self, texts: List[str]) -> Any:
        body = {
            "inputs": texts[0] if len(texts) == 1 else texts,
            "parameters": {"top_k": len(INTENT_LABELS)},
        }
        headers = {"Authorization": f"Bearer {self._token}"}
        assert self._url is not None  # guarded by is_configured
        retrying = Retrying(
            stop=stop_after_attempt(self.max_attempts),
            wait=wait_exponential(multiplier=self.backoff_base_s, min=self.backoff_base_s, max=4.0),
            retry=retry_if_exception(_is_retryable),
            sleep=self._sleep,
            reraise=True,
        )
        for attempt in retrying:
            with attempt:
                resp = self._session.post(self._url, json=body, headers=headers, timeout=self.timeout_s)
                resp.raise_for_status()
                return resp.json()
        raise AssertionError("unreachable")  # Retrying with reraise=True always returns or raises

    @staticmethod
    def _normalize_response(payload: Any, expected: int) -> List[Dict[str, float]]:
        """Map HF output (flat list for one input, nested lists for many) to label->score dicts."""
        if not isinstance(payload, list) or not payload:
            raise RoBERTaResponseError(f"unexpected payload type: {type(payload).__name__}")
        rows = [payload] if isinstance(payload[0], dict) else payload
        if len(rows) != expected:
            raise RoBERTaResponseError(f"expected {expected} results, got {len(rows)}")
        return [RoBERTaClassifier._row_to_scores(row) for row in rows]

    @staticmethod
    def _row_to_scores(row: Any) -> Dict[str, float]:
        if not isinstance(row, list) or not row:
            raise RoBERTaResponseError("empty or malformed score list")
        scores: Dict[str, float] = {}
        for item in row:
            try:
                label, score = str(item["label"]), float(item["score"])
            except (KeyError, TypeError, ValueError) as exc:
                raise RoBERTaResponseError(f"malformed score entry: {item!r}") from exc
            generic = _GENERIC_LABEL.match(label)
            if generic and int(generic.group(1)) < len(INTENT_LABELS):
                label = INTENT_LABELS[int(generic.group(1))]
            if label not in ROUTING_TABLE:
                raise RoBERTaResponseError(f"model returned unknown label {label!r}")
            scores[label] = round(min(max(score, 0.0), 1.0), 4)
        # Highest first, matching the sklearn path, so top-k is simply the first k entries.
        return dict(sorted(scores.items(), key=lambda kv: kv[1], reverse=True))

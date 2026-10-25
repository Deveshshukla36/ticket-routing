"""In-memory request and prediction metrics for GET /api/v1/metrics.

Per-process and reset on restart. That is enough for a single Render instance; a real
multi-instance deployment would export these as Prometheus counters/histograms instead.
"""
import math
import threading
import time
from collections import Counter, deque
from typing import Any, Deque, Dict, Iterable, List, Optional

from schemas.prediction import IntentPrediction

# Probes would dominate latency percentiles (Render polls health every few seconds).
PROBE_PATHS = frozenset({"/api/v1/health", "/health", "/api/v1/metrics"})


def percentile(values: Iterable[float], pct: float) -> Optional[float]:
    """Nearest-rank percentile; None when there is no data."""
    ordered: List[float] = sorted(values)
    if not ordered:
        return None
    rank = max(1, math.ceil(pct / 100 * len(ordered)))
    return round(ordered[rank - 1], 3)


class RequestMetrics:
    def __init__(self, window: int = 1000) -> None:
        self.window = window
        self.started_at = time.time()
        self._lock = threading.Lock()
        self._requests_total = 0
        self._by_status: Counter[str] = Counter()
        self._latencies: Deque[float] = deque(maxlen=window)
        self._route_latencies: Dict[str, Deque[float]] = {}
        self._route_counts: Counter[str] = Counter()
        self._by_backend: Counter[str] = Counter()
        self._fallbacks: Counter[str] = Counter()

    def record_request(self, method: str, route_path: str, status: int, latency_ms: float) -> None:
        key = f"{method} {route_path}"
        with self._lock:
            self._requests_total += 1
            self._by_status[f"{status // 100}xx"] += 1
            self._route_counts[key] += 1
            self._route_latencies.setdefault(key, deque(maxlen=self.window)).append(latency_ms)
            if route_path not in PROBE_PATHS:
                self._latencies.append(latency_ms)

    def record_prediction(self, pred: IntentPrediction) -> None:
        with self._lock:
            self._by_backend[pred.backend] += 1
            if pred.fallback_reason:
                self._fallbacks[pred.fallback_reason] += 1

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            latencies = list(self._latencies)
            routes = {
                key: {
                    "count": self._route_counts[key],
                    "p50_ms": percentile(window, 50),
                    "p95_ms": percentile(window, 95),
                }
                for key, window in sorted(self._route_latencies.items())
            }
            return {
                "uptime_seconds": round(time.time() - self.started_at, 2),
                "requests_total": self._requests_total,
                "requests_by_status": dict(self._by_status),
                "latency_ms": {
                    "p50": percentile(latencies, 50),
                    "p95": percentile(latencies, 95),
                    "samples": len(latencies),
                    "window": self.window,
                    "excludes": sorted(PROBE_PATHS),
                },
                "routes": routes,
                "predictions": {
                    "by_backend": dict(self._by_backend),
                    "fallbacks_by_reason": dict(self._fallbacks),
                },
            }


request_metrics = RequestMetrics()

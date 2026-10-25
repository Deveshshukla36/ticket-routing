import threading
import time
from typing import Callable, Literal

BreakerState = Literal["closed", "open", "half_open"]


class CircuitBreaker:
    """Consecutive-failure circuit breaker.

    closed    -> calls allowed; `failure_threshold` consecutive failures opens it.
    open      -> calls refused until `reset_timeout_s` has elapsed.
    half_open -> one trial call allowed; success closes, failure re-opens.
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        reset_timeout_s: float = 60.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.failure_threshold = failure_threshold
        self.reset_timeout_s = reset_timeout_s
        self._clock = clock
        self._lock = threading.Lock()
        self._consecutive_failures = 0
        self._opened_at: float | None = None
        self._trial_in_flight = False

    @property
    def state(self) -> BreakerState:
        with self._lock:
            return self._state_unlocked()

    @property
    def consecutive_failures(self) -> int:
        return self._consecutive_failures

    def allow_request(self) -> bool:
        with self._lock:
            state = self._state_unlocked()
            if state == "closed":
                return True
            if state == "half_open" and not self._trial_in_flight:
                self._trial_in_flight = True
                return True
            return False

    def record_success(self) -> None:
        with self._lock:
            self._consecutive_failures = 0
            self._opened_at = None
            self._trial_in_flight = False

    def record_failure(self) -> None:
        with self._lock:
            self._consecutive_failures += 1
            if self._trial_in_flight or self._consecutive_failures >= self.failure_threshold:
                self._opened_at = self._clock()
            self._trial_in_flight = False

    def _state_unlocked(self) -> BreakerState:
        if self._opened_at is None:
            return "closed"
        if self._clock() - self._opened_at >= self.reset_timeout_s:
            return "half_open"
        return "open"

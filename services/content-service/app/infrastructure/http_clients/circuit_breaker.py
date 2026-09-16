# Simple in-process circuit breaker.
#
# Opens after failure_threshold consecutive failures and stays open for
# recovery_seconds before allowing a new probe attempt, half-open. No need for
# an external library for this.

from __future__ import annotations

import time
from typing import Callable


class CircuitBreaker:
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_seconds: float = 30.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._failure_threshold = failure_threshold
        self._recovery_seconds = recovery_seconds
        self._clock = clock
        self._consecutive_failures = 0
        self._open_until: float | None = None

    def allow(self) -> bool:
        # False if the circuit is open and it's not time to retry yet.
        if self._open_until is None:
            return True
        if self._clock() >= self._open_until:
            return True  # half-open, one probe attempt is allowed
        return False

    def record_success(self) -> None:
        self._consecutive_failures = 0
        self._open_until = None

    def record_failure(self) -> None:
        self._consecutive_failures += 1
        if self._consecutive_failures >= self._failure_threshold:
            self._open_until = self._clock() + self._recovery_seconds

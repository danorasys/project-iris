"""Simple in-process circuit breaker.

Counts consecutive failures. Past failure_threshold it goes "open" and fails
fast without hitting the network for recovery_seconds seconds, then
"half-open": the next attempt decides whether it closes again or reopens."""

from __future__ import annotations

import time
from typing import Awaitable, Callable, TypeVar

T = TypeVar("T")


class CircuitBreakerOpen(Exception):
    """Raised when the circuit is open and the call fails fast without the network."""


class CircuitBreaker:
    def __init__(self, failure_threshold: int, recovery_seconds: float) -> None:
        self._failure_threshold = failure_threshold
        self._recovery_seconds = recovery_seconds
        self._consecutive_failures = 0
        self._open_since: float | None = None

    def _is_open(self) -> bool:
        if self._open_since is None:
            return False
        if time.monotonic() - self._open_since >= self._recovery_seconds:
            # Recovery window elapsed, moves to half-open and lets one attempt through.
            return False
        return True

    def _record_success(self) -> None:
        self._consecutive_failures = 0
        self._open_since = None

    def _record_failure(self) -> None:
        self._consecutive_failures += 1
        if self._consecutive_failures >= self._failure_threshold:
            self._open_since = time.monotonic()

    async def execute(self, operation: Callable[[], Awaitable[T]]) -> T:
        if self._is_open():
            raise CircuitBreakerOpen("El circuito está abierto: se omite la llamada de red.")
        try:
            result = await operation()
        except Exception:
            self._record_failure()
            raise
        else:
            self._record_success()
            return result

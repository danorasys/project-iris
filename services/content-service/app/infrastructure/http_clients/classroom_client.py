"""Client for classroom-service's /internal/classrooms/{classroom_id}/access.

Unlike identity_client, this is an AUTHORIZATION check, not authentication.
If classroom-service doesn't respond, this fails closed to "denied" and
never raises an availability exception upward. Never fail open on an
authorization check.

The URL path, its query params ("subject_id", "role") and the JSON response
key ("authorized") are classroom-service's own wire contract."""

from __future__ import annotations

from uuid import UUID

import httpx
from cachetools import TTLCache

from app.infrastructure.http_clients.circuit_breaker import CircuitBreaker


class HttpClassroomClient:
    def __init__(
        self,
        http_client: httpx.AsyncClient,
        base_url: str,
        internal_key: str,
        breaker: CircuitBreaker | None = None,
        cache_ttl_seconds: int = 30,
    ) -> None:
        self._http = http_client
        self._base_url = base_url.rstrip("/")
        self._internal_key = internal_key
        self._breaker = breaker or CircuitBreaker()
        self._cache: TTLCache[tuple[UUID, UUID, str], bool] = TTLCache(maxsize=2000, ttl=cache_ttl_seconds)

    async def verify_access(self, classroom_id: UUID, subject_id: UUID, role: str, correlation_id: str | None) -> bool:
        cache_key = (classroom_id, subject_id, role)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        if not self._breaker.allow():
            return False  # fail-closed, open circuit means deny without hitting the network

        headers = {"X-Internal-Key": self._internal_key}
        if correlation_id:
            headers["X-Correlation-Id"] = correlation_id

        try:
            response = await self._http.get(
                f"{self._base_url}/internal/classrooms/{classroom_id}/access",
                params={"subject_id": str(subject_id), "role": role},
                headers=headers,
                timeout=httpx.Timeout(2.0),
            )
        except httpx.HTTPError:
            self._breaker.record_failure()
            return False

        if response.status_code != 200:
            self._breaker.record_failure()
            return False

        self._breaker.record_success()
        authorized = bool(response.json().get("authorized", False))
        self._cache[cache_key] = authorized
        return authorized

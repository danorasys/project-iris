"""Client for identity-service's /internal/tokens/validate.

content-service never sees JWT_SECRET, it always validates the token
remotely. Fail-closed to IdentityServiceUnavailable (503) if identity-service
doesn't respond. A missing response is never treated as "authenticated".

The URL path and the JSON response keys ("sub", "role", "extra") are
identity-service's own wire contract."""

from __future__ import annotations

from uuid import UUID

import httpx
from cachetools import TTLCache

from app.domain.entities import ValidatedUser
from app.domain.exceptions import IdentityServiceUnavailable, InvalidToken
from app.infrastructure.http_clients.circuit_breaker import CircuitBreaker


class HttpIdentityClient:
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
        self._cache: TTLCache[str, ValidatedUser] = TTLCache(maxsize=1000, ttl=cache_ttl_seconds)

    async def validate_token(self, access_token: str, correlation_id: str | None) -> ValidatedUser:
        cached = self._cache.get(access_token)
        if cached is not None:
            return cached

        if not self._breaker.allow():
            raise IdentityServiceUnavailable()

        headers = {
            "Authorization": f"Bearer {access_token}",
            "X-Internal-Key": self._internal_key,
        }
        if correlation_id:
            headers["X-Correlation-Id"] = correlation_id

        try:
            response = await self._http.get(
                f"{self._base_url}/internal/tokens/validate",
                headers=headers,
                timeout=httpx.Timeout(2.0),
            )
        except httpx.HTTPError as exc:
            self._breaker.record_failure()
            raise IdentityServiceUnavailable() from exc

        if response.status_code == 401:
            # identity-service responded, the circuit is healthy, the token is just invalid.
            self._breaker.record_success()
            raise InvalidToken()
        if response.status_code != 200:
            self._breaker.record_failure()
            raise IdentityServiceUnavailable()

        self._breaker.record_success()
        data = response.json()
        user = ValidatedUser(
            subject_id=UUID(str(data["sub"])),
            role=str(data["role"]),
            extra=dict(data.get("extra") or {}),
        )
        self._cache[access_token] = user
        return user

"""Client for identity-service, validates the access token on every
request to this service's own REST routes. The role itself (must be
"teacher") is checked separately, in app/api/deps.py.

Explicit 2s timeout plus a circuit breaker, and a short TTL cache so the
notification tray, polled every ~20s per teacher, doesn't revalidate the same
token against identity-service on every poll.

A network failure (timeout, connection refused, identity-service returning
an error status) maps to InvalidToken and counts against the circuit
breaker. A clean 401 from identity-service, meaning the token itself is
invalid or expired, also maps to InvalidToken but does NOT count against the
breaker: identity-service answered fine, so there's nothing wrong with its
availability. Counting it would let a batch of ordinary expired tokens (they
last only 15 minutes, and every teacher's browser is polling) trip the
breaker and briefly reject even valid tokens for everyone."""

from __future__ import annotations

import dataclasses
import logging

import httpx
from cachetools import TTLCache

from app.correlation import CORRELATION_HEADER
from app.domain.exceptions import InvalidToken
from app.infrastructure.http_clients.circuit_breaker import CircuitBreaker, CircuitBreakerOpen

logger = logging.getLogger(__name__)


@dataclasses.dataclass(frozen=True)
class TokenClaims:
    sub: str
    role: str
    extra: dict[str, str]


class IdentityClient:
    def __init__(
        self,
        http_client: httpx.AsyncClient,
        base_url: str,
        internal_service_key: str,
        timeout_sec: float,
        circuit_breaker: CircuitBreaker,
        cache_ttl_seconds: int = 30,
    ) -> None:
        self._http = http_client
        self._base_url = base_url.rstrip("/")
        self._internal_service_key = internal_service_key
        self._timeout_sec = timeout_sec
        self._circuit_breaker = circuit_breaker
        self._cache: TTLCache[str, TokenClaims] = TTLCache(maxsize=1000, ttl=cache_ttl_seconds)

    async def validate_token(self, token: str, correlation_id: str | None = None) -> TokenClaims:
        cached = self._cache.get(token)
        if cached is not None:
            return cached

        async def _call() -> TokenClaims | None:
            headers = {
                "Authorization": f"Bearer {token}",
                "X-Internal-Key": self._internal_service_key,
            }
            if correlation_id:
                headers[CORRELATION_HEADER] = correlation_id
            response = await self._http.get(
                f"{self._base_url}/internal/tokens/validate",
                headers=headers,
                timeout=httpx.Timeout(self._timeout_sec),
            )
            if response.status_code == 401:
                # identity-service responded, the circuit is healthy, the token is just invalid.
                return None
            response.raise_for_status()
            data = response.json()
            return TokenClaims(
                sub=str(data["sub"]),
                role=str(data["role"]),
                extra={str(k): str(v) for k, v in (data.get("extra") or {}).items()},
            )

        try:
            result = await self._circuit_breaker.execute(_call)
        except CircuitBreakerOpen:
            logger.warning("Circuito abierto hacia identity-service: se rechaza el token sin llamar a la red.")
            raise InvalidToken("No fue posible validar el token en este momento.") from None
        except httpx.HTTPError as exc:
            logger.warning("Fallo de red al validar el token contra identity-service: %s", exc)
            raise InvalidToken("No fue posible validar el token en este momento.") from exc

        if result is None:
            raise InvalidToken()

        self._cache[token] = result
        return result

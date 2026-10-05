# Client for identity-service, validates the access token on every
# request to this service's own REST routes, and for a guardian checks that
# their session has the parents' portal open. The role itself is checked
# separately, in app/api/deps.py.
#
# Explicit 2s timeout plus a circuit breaker, and a short TTL cache so the
# notification tray, polled every ~20s per teacher, doesn't revalidate the same
# token against identity-service on every poll.
#
# A network failure (timeout, connection refused, identity-service returning
# an error status) maps to InvalidToken and counts against the circuit
# breaker. A clean 401 from identity-service, meaning the token itself is
# invalid or expired, also maps to InvalidToken but does NOT count against the
# breaker: identity-service answered fine, so there's nothing wrong with its
# availability. Counting it would let a batch of ordinary expired tokens (they
# last only 15 minutes, and every teacher's browser is polling) trip the
# breaker and briefly reject even valid tokens for everyone.

from __future__ import annotations

import dataclasses
import logging

import httpx
from cachetools import TTLCache

from app.correlation import CORRELATION_HEADER
from app.domain.exceptions import IdentityServiceUnavailable, InvalidToken, PortalAccessRequired
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
        # Kept apart by renew, so a request of the page by itself never
        # hides the activity of a real one.
        self._cache: TTLCache[tuple[str, bool], TokenClaims] = TTLCache(maxsize=1000, ttl=cache_ttl_seconds)

    async def validate_token(
        self, token: str, correlation_id: str | None = None, renew: bool = True
    ) -> TokenClaims:
        cached = self._cache.get((token, renew))
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
                params=None if renew else {"renew": "false"},
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

        self._cache[(token, renew)] = result
        return result

    # No cache here: the portal closes after a while without use, and a
    # cached "open" would keep it open longer than identity-service says.
    async def check_portal_access(
        self, person_id: str, session_id: str, renew: bool, correlation_id: str | None = None
    ) -> None:
        async def _call() -> int:
            headers = {"X-Internal-Key": self._internal_service_key}
            if correlation_id:
                headers[CORRELATION_HEADER] = correlation_id
            response = await self._http.post(
                f"{self._base_url}/internal/portal-access/check",
                json={"person_id": person_id, "session_id": session_id, "renew": renew},
                headers=headers,
                timeout=httpx.Timeout(self._timeout_sec),
            )
            # A clean "closed" is an answer, not a failure of identity-service.
            if response.status_code != 403:
                response.raise_for_status()
            return response.status_code

        try:
            status_code = await self._circuit_breaker.execute(_call)
        except (CircuitBreakerOpen, httpx.HTTPError) as exc:
            logger.warning("No fue posible confirmar el acceso al portal contra identity-service: %s", exc)
            raise IdentityServiceUnavailable() from exc
        if status_code == 403:
            raise PortalAccessRequired()

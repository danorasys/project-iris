"""HTTP client for identity-service. classroom-service never sees JWT_SECRET,
it validates who the user is by calling /internal/tokens/validate, always
with a 2s timeout and an in-process circuit breaker.

Fail-closed: if identity-service doesn't respond (timeout, open circuit or
5xx), this raises IdentityServiceUnavailable (503). A missing response is never
treated as authenticated.
"""

from __future__ import annotations

from uuid import UUID

import httpx
from cachetools import TTLCache

from app.correlation import get_correlation_id
from app.domain.entities import StudentInfo, UserClaims
from app.domain.exceptions import IdentityServiceUnavailable, ResourceNotFound, InvalidToken
from app.infrastructure.http_clients.circuit_breaker import CircuitAbiertoError, CircuitBreaker


class IdentityHttpClient:
    def __init__(
        self,
        base_url: str,
        internal_key: str,
        timeout_seg: float = 2.0,
        umbral_fallos: int = 5,
        segundos_apertura: int = 30,
        cache_ttl_seg: int = 30,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._internal_key = internal_key
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(timeout_seg))
        self._breaker = CircuitBreaker(umbral_fallos=umbral_fallos, segundos_apertura=segundos_apertura)
        self._cache_tokens: TTLCache[str, UserClaims] = TTLCache(maxsize=1000, ttl=cache_ttl_seg)

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        headers = {"X-Internal-Key": self._internal_key}
        correlation_id = get_correlation_id()
        if correlation_id:
            headers["X-Correlation-Id"] = correlation_id
        if extra:
            headers.update(extra)
        return headers

    async def _get(self, path: str, headers: dict[str, str]) -> httpx.Response:
        """Only a network error or a 5xx counts as a circuit breaker failure.
        A 401/404 is a valid response from identity-service, not a failure."""
        response = await self._client.get(f"{self._base_url}{path}", headers=headers)
        if response.status_code >= 500:
            response.raise_for_status()
        return response

    async def validar_token(self, access_token: str) -> UserClaims:
        cacheado = self._cache_tokens.get(access_token)
        if cacheado is not None:
            return cacheado

        headers = self._headers({"Authorization": f"Bearer {access_token}"})
        try:
            response = await self._breaker.llamar(lambda: self._get("/internal/tokens/validate", headers))
        except (httpx.HTTPError, CircuitAbiertoError) as exc:
            raise IdentityServiceUnavailable() from exc

        if response.status_code == 401:
            raise InvalidToken()
        if response.status_code != 200:
            raise IdentityServiceUnavailable()

        body = response.json()
        claims = UserClaims(sub=UUID(str(body["sub"])), role=str(body["role"]), extra=dict(body.get("extra") or {}))
        self._cache_tokens[access_token] = claims
        return claims

    async def obtener_estudiante(self, student_id: UUID) -> StudentInfo:
        """No cache here. Used to enrich lists (requests, a classroom's
        enrolled students), not for per-request verification."""
        headers = self._headers()
        try:
            response = await self._breaker.llamar(
                lambda: self._get(f"/internal/students/{student_id}", headers)
            )
        except (httpx.HTTPError, CircuitAbiertoError) as exc:
            raise IdentityServiceUnavailable() from exc

        if response.status_code == 404:
            raise ResourceNotFound("Estudiante no encontrado en identity-service.")
        if response.status_code != 200:
            raise IdentityServiceUnavailable()

        body = response.json()
        return StudentInfo(
            student_id=UUID(str(body["student_id"])),
            first_name=str(body["student_first_name"]),
            avatar=str(body["student_avatar"]),
            guardian_first_name=str(body["guardian_first_name"]),
            guardian_last_name=str(body["guardian_last_name"]),
            guardian_email=str(body["guardian_email"]),
            guardian_phone=str(body["guardian_phone"]),
        )

    async def aclose(self) -> None:
        await self._client.aclose()

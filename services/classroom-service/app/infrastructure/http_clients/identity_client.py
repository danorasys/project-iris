# HTTP client for identity-service. classroom-service never sees JWT_SECRET,
# it validates who the user is by calling /internal/tokens/validate, always
# with a 2s timeout and an in-process circuit breaker.
#
# Fail-closed: if identity-service doesn't respond (timeout, open circuit or
# 5xx), this raises IdentityServiceUnavailable (503). A missing response is
# never treated as authenticated.

from __future__ import annotations

from uuid import UUID

import httpx
from cachetools import TTLCache

from app.correlation import get_correlation_id
from app.domain.entities import GuardianStudent, StudentInfo, UserClaims
from app.domain.exceptions import IdentityServiceUnavailable, InvalidToken, PortalAccessRequired, ResourceNotFound
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
        # Kept apart by renew, so a request of the page by itself never
        # hides the activity of a real one.
        self._cache_tokens: TTLCache[tuple[str, bool], UserClaims] = TTLCache(maxsize=1000, ttl=cache_ttl_seg)

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        headers = {"X-Internal-Key": self._internal_key}
        correlation_id = get_correlation_id()
        if correlation_id:
            headers["X-Correlation-Id"] = correlation_id
        if extra:
            headers.update(extra)
        return headers

    # Only a network error or a 5xx counts as a circuit breaker failure.
    # A 401/404 is a valid response from identity-service, not a failure.
    async def _get(self, path: str, headers: dict[str, str]) -> httpx.Response:
        response = await self._client.get(f"{self._base_url}{path}", headers=headers)
        if response.status_code >= 500:
            response.raise_for_status()
        return response

    async def validar_token(self, access_token: str, renew: bool = True) -> UserClaims:
        cacheado = self._cache_tokens.get((access_token, renew))
        if cacheado is not None:
            return cacheado

        headers = self._headers({"Authorization": f"Bearer {access_token}"})
        path = "/internal/tokens/validate" if renew else "/internal/tokens/validate?renew=false"
        try:
            response = await self._breaker.llamar(lambda: self._get(path, headers))
        except (httpx.HTTPError, CircuitAbiertoError) as exc:
            raise IdentityServiceUnavailable() from exc

        if response.status_code == 401:
            raise InvalidToken()
        if response.status_code != 200:
            raise IdentityServiceUnavailable()

        body = response.json()
        claims = UserClaims(sub=UUID(str(body["sub"])), role=str(body["role"]), extra=dict(body.get("extra") or {}))
        self._cache_tokens[(access_token, renew)] = claims
        return claims

    # No cache here. Used to enrich lists (requests, a classroom's enrolled
    # students), not for per-request verification.
    async def obtener_estudiante(self, student_id: UUID) -> StudentInfo:
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
            avatar_id=int(body["student_avatar_id"]),
            guardian_first_name=str(body["guardian_first_name"]),
            guardian_last_name=str(body["guardian_last_name"]),
            guardian_email=str(body["guardian_email"]),
            guardian_phone=str(body["guardian_phone"]),
            guardian_person_id=UUID(str(body["guardian_person_id"])),
        )

    async def obtener_nombre_docente(self, teacher_id: UUID) -> str:
        headers = self._headers()
        try:
            response = await self._breaker.llamar(lambda: self._get(f"/internal/teachers/{teacher_id}", headers))
        except (httpx.HTTPError, CircuitAbiertoError) as exc:
            raise IdentityServiceUnavailable() from exc

        if response.status_code == 404:
            raise ResourceNotFound("Docente no encontrado en identity-service.")
        if response.status_code != 200:
            raise IdentityServiceUnavailable()

        body = response.json()
        return f"{body['first_name']} {body['last_name']}"

    async def list_guardian_students(self, guardian_id: UUID) -> list[GuardianStudent]:
        headers = self._headers()
        try:
            response = await self._breaker.llamar(
                lambda: self._get(f"/internal/guardians/{guardian_id}/students", headers)
            )
        except (httpx.HTTPError, CircuitAbiertoError) as exc:
            raise IdentityServiceUnavailable() from exc

        # Not a guardian (or gone): no kids to show.
        if response.status_code == 404:
            return []
        if response.status_code != 200:
            raise IdentityServiceUnavailable()
        return [
            GuardianStudent(
                student_id=UUID(str(item["student_id"])),
                first_name=str(item["first_name"]),
                avatar_id=int(item["avatar_id"]),
            )
            for item in response.json()
        ]

    # No cache here: the portal closes after a while without use, and a
    # cached "open" would keep it open longer than identity-service says.
    async def check_portal_access(self, person_id: UUID, session_id: str, renew: bool) -> None:
        async def _post() -> httpx.Response:
            response = await self._client.post(
                f"{self._base_url}/internal/portal-access/check",
                json={"person_id": str(person_id), "session_id": session_id, "renew": renew},
                headers=self._headers(),
            )
            if response.status_code >= 500:
                response.raise_for_status()
            return response

        try:
            response = await self._breaker.llamar(_post)
        except (httpx.HTTPError, CircuitAbiertoError) as exc:
            raise IdentityServiceUnavailable() from exc

        # A clean "closed" is an answer, not a failure of identity-service.
        if response.status_code == 403:
            raise PortalAccessRequired()
        if response.status_code != 204:
            raise IdentityServiceUnavailable()

    async def aclose(self) -> None:
        await self._client.aclose()

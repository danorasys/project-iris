# Client for classroom-service's internal routes: /access, and the notices
# about new lessons (/announcements) and what a kid finished (/reports).
#
# Unlike identity_client, this is an AUTHORIZATION check, not authentication.
# If classroom-service doesn't respond, this fails closed to "denied" and
# never raises an availability exception upward. Never fail open on an
# authorization check.
#
# The URL path, its query params ("subject_id", "role") and the JSON response
# key ("authorized") are classroom-service's own wire contract.

from __future__ import annotations

import logging
from uuid import UUID

import httpx
from cachetools import TTLCache

from app.infrastructure.http_clients.circuit_breaker import CircuitBreaker

logger = logging.getLogger(__name__)


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

    async def announce(
        self,
        classroom_id: UUID,
        kind: str,
        lesson_id: UUID,
        lesson_title: str,
        extra_title: str | None,
        student_ids: list[UUID] | None,
        correlation_id: str | None,
    ) -> None:
        body: dict[str, object] = {"kind": kind, "lesson_id": str(lesson_id), "lesson_title": lesson_title}
        if extra_title:
            body["extra_title"] = extra_title
        if student_ids is not None:
            body["student_ids"] = [str(s) for s in student_ids]
        await self._notify(f"/internal/classrooms/{classroom_id}/announcements", body, correlation_id)

    async def report_student(
        self,
        classroom_id: UUID,
        student_id: UUID,
        kind: str,
        lesson_id: UUID,
        lesson_title: str,
        score: tuple[int, int] | None,
        correlation_id: str | None,
    ) -> None:
        body: dict[str, object] = {"kind": kind, "lesson_id": str(lesson_id), "lesson_title": lesson_title}
        if score is not None:
            body["correct"], body["total"] = score
        await self._notify(f"/internal/classrooms/{classroom_id}/students/{student_id}/reports", body, correlation_id)

    # A notice is a side effect: if classroom-service doesn't take it, the
    # lesson is still published and the try still kept. Only logged.
    async def _notify(self, path: str, body: dict[str, object], correlation_id: str | None) -> None:
        if not self._breaker.allow():
            logger.warning("Aviso sin enviar a classroom-service (circuito abierto): %s", path)
            return
        headers = {"X-Internal-Key": self._internal_key}
        if correlation_id:
            headers["X-Correlation-Id"] = correlation_id
        try:
            response = await self._http.post(
                f"{self._base_url}{path}", json=body, headers=headers, timeout=httpx.Timeout(2.0)
            )
        except httpx.HTTPError:
            self._breaker.record_failure()
            logger.warning("Aviso sin enviar a classroom-service: %s", path)
            return
        if response.status_code >= 500:
            self._breaker.record_failure()
            logger.warning("classroom-service no tomó el aviso (%s): %s", response.status_code, path)
            return
        self._breaker.record_success()
        if response.status_code != 204:
            logger.warning("classroom-service rechazó el aviso (%s): %s", response.status_code, path)

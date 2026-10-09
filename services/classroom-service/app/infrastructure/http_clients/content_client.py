# Client for content-service's internal routes: delete a classroom's
# lessons before the classroom (HU-85) and count the published lessons of
# the kids' classrooms (parents' portal). Circuit breaker and fail-closed:
# if it can't, the classroom isn't deleted and the counts aren't made up.

from __future__ import annotations

from uuid import UUID

import httpx

from app.correlation import get_correlation_id
from app.domain.entities import PublishedContent
from app.domain.exceptions import ContentServiceUnavailable, ProgressUnavailable, StatisticsUnavailable
from app.infrastructure.http_clients.circuit_breaker import CircuitAbiertoError, CircuitBreaker


class ContentHttpClient:
    def __init__(
        self,
        base_url: str,
        internal_key: str,
        timeout_seg: float = 10.0,
        umbral_fallos: int = 5,
        segundos_apertura: int = 30,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._internal_key = internal_key
        # Longer than identity's 2 s: it may delete many images in storage.
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(timeout_seg))
        self._breaker = CircuitBreaker(umbral_fallos=umbral_fallos, segundos_apertura=segundos_apertura)

    def _headers(self) -> dict[str, str]:
        headers = {"X-Internal-Key": self._internal_key}
        correlation_id = get_correlation_id()
        if correlation_id:
            headers["X-Correlation-Id"] = correlation_id
        return headers

    async def _delete(self, path: str) -> httpx.Response:
        response = await self._client.delete(f"{self._base_url}{path}", headers=self._headers())
        if response.status_code >= 500:
            response.raise_for_status()
        return response

    async def delete_classroom_lessons(self, classroom_id: UUID) -> None:
        try:
            response = await self._breaker.llamar(lambda: self._delete(f"/internal/classrooms/{classroom_id}/lessons"))
        except (httpx.HTTPError, CircuitAbiertoError) as exc:
            raise ContentServiceUnavailable() from exc
        if response.status_code != 204:
            raise ContentServiceUnavailable()

    # Short timeout: it only reads a count, and the portal shows the
    # classes without it if content-service is slow.
    async def published_content(self, classroom_ids: list[UUID]) -> dict[UUID, PublishedContent]:
        async def _get() -> httpx.Response:
            response = await self._client.get(
                f"{self._base_url}/internal/classrooms/published-lessons",
                params=[("classroom_id", str(c)) for c in classroom_ids],
                headers=self._headers(),
                timeout=httpx.Timeout(2.0),
            )
            if response.status_code >= 500:
                response.raise_for_status()
            return response

        try:
            response = await self._breaker.llamar(_get)
        except (httpx.HTTPError, CircuitAbiertoError) as exc:
            raise ContentServiceUnavailable() from exc
        if response.status_code != 200:
            raise ContentServiceUnavailable()
        return {
            UUID(str(item["classroom_id"])): PublishedContent(
                lessons=int(item["published_lessons"]), units=int(item.get("published_units", 0))
            )
            for item in response.json()
        }

    async def student_progress(self, classroom_id: UUID, student_id: UUID) -> list[dict[str, object]]:
        async def _get() -> httpx.Response:
            response = await self._client.get(
                f"{self._base_url}/internal/classrooms/{classroom_id}/students/{student_id}/progress",
                headers=self._headers(),
                timeout=httpx.Timeout(5.0),
            )
            if response.status_code >= 500:
                response.raise_for_status()
            return response

        try:
            response = await self._breaker.llamar(_get)
        except (httpx.HTTPError, CircuitAbiertoError) as exc:
            raise ProgressUnavailable() from exc
        if response.status_code != 200:
            raise ProgressUnavailable()
        lessons: list[dict[str, object]] = response.json()
        return lessons

    async def classroom_statistics(self, classroom_id: UUID, student_ids: list[UUID]) -> dict[str, object]:
        async def _get() -> httpx.Response:
            response = await self._client.get(
                f"{self._base_url}/internal/classrooms/{classroom_id}/statistics",
                params=[("student_id", str(s)) for s in student_ids],
                headers=self._headers(),
                timeout=httpx.Timeout(5.0),
            )
            if response.status_code >= 500:
                response.raise_for_status()
            return response

        try:
            response = await self._breaker.llamar(_get)
        except (httpx.HTTPError, CircuitAbiertoError) as exc:
            raise StatisticsUnavailable() from exc
        if response.status_code != 200:
            raise StatisticsUnavailable()
        statistics: dict[str, object] = response.json()
        return statistics

    async def aclose(self) -> None:
        await self._client.aclose()

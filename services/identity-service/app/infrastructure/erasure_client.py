# The calls to the other services when an account is deleted (HU-91,
# HU-92). Each one goes to an internal route with X-Internal-Key and only
# deletes what's still there, so repeating them is safe. Any failure means
# "not erased yet": the account isn't deleted and the person can try again.

from __future__ import annotations

from uuid import UUID

import httpx

from app.domain.exceptions import ErasureUnavailable

_TIMEOUT = httpx.Timeout(5.0)


class HttpAccountErasure:
    def __init__(
        self,
        http_client: httpx.AsyncClient,
        internal_key: str,
        classroom_url: str,
        content_url: str,
        notification_url: str,
    ) -> None:
        self._http = http_client
        self._headers = {"X-Internal-Key": internal_key}
        self._classroom = classroom_url.rstrip("/")
        self._content = content_url.rstrip("/")
        self._notification = notification_url.rstrip("/")

    async def _post(self, url: str, body: dict[str, object] | None = None) -> None:
        try:
            response = await self._http.post(url, json=body, headers=self._headers, timeout=_TIMEOUT)
        except httpx.HTTPError as exc:
            raise ErasureUnavailable() from exc
        if response.status_code not in (200, 204):
            raise ErasureUnavailable()

    async def erase_students(self, student_ids: list[UUID]) -> None:
        if not student_ids:
            return
        body: dict[str, object] = {"student_ids": [str(s) for s in student_ids]}
        await self._post(f"{self._classroom}/internal/erasures/students", body)
        await self._post(f"{self._content}/internal/erasures/students", body)

    async def erase_notifications(self, person_ids: list[UUID], student_ids: list[UUID]) -> None:
        body: dict[str, object] = {
            "person_ids": [str(p) for p in person_ids],
            "student_ids": [str(s) for s in student_ids],
        }
        await self._post(f"{self._notification}/internal/erasures", body)

    async def teacher_left(self, teacher_id: UUID) -> None:
        await self._post(f"{self._classroom}/internal/erasures/teachers/{teacher_id}")

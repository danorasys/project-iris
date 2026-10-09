# Test double for the storage port, so tests never need a real Garage.

from __future__ import annotations

from uuid import UUID

from app.domain.entities import SignedDownload


class FakeObjectStorage:
    def sign_download(self, key: str) -> SignedDownload:
        return SignedDownload(
            path=f"/test-bucket/{key}", authorization="AWS4-HMAC-SHA256 test", amz_date="20260101T000000Z",
            content_sha256="UNSIGNED-PAYLOAD",
        )


class FakeAccountErasure:
    # Implements the AccountErasure port in memory: records what the other
    # services would have been asked, or fails like one that didn't answer.
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []
        self.available = True

    def _check(self) -> None:
        if not self.available:
            from app.domain.exceptions import ErasureUnavailable

            raise ErasureUnavailable()

    async def erase_students(self, student_ids: list[UUID]) -> None:
        self._check()
        self.calls.append(("students", sorted(str(s) for s in student_ids)))

    async def erase_notifications(self, person_ids: list[UUID], student_ids: list[UUID]) -> None:
        self._check()
        self.calls.append(("notifications", (sorted(str(p) for p in person_ids), sorted(str(s) for s in student_ids))))

    async def teacher_left(self, teacher_id: UUID) -> None:
        self._check()
        self.calls.append(("teacher_left", str(teacher_id)))

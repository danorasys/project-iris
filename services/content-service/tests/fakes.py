# Test doubles for content-service's external dependencies. Never hit the
# real network in a test.

from __future__ import annotations

from uuid import UUID

from app.domain.entities import SignedDownload, ValidatedUser
from app.domain.exceptions import IdentityServiceUnavailable, InvalidToken, StorageFull


class FakeIdentityClient:
    # Implements the IdentityClient port without any network calls.

    def __init__(self) -> None:
        self._users: dict[str, ValidatedUser] = {}
        self.available = True
        # renew of each token validation, in order.
        self.renews: list[bool] = []

    # A teacher comes from a session that already passed the 2FA code,
    # unless mfa_verified=False.
    def register(
        self,
        token: str,
        subject_id: UUID,
        role: str,
        extra: dict[str, object] | None = None,
        mfa_verified: bool = True,
    ) -> None:
        claims = dict(extra or {})
        if role == "teacher" and mfa_verified:
            claims["mfa"] = "1"
        self._users[token] = ValidatedUser(subject_id=subject_id, role=role, extra=claims)

    async def validate_token(
        self, access_token: str, correlation_id: str | None, renew: bool = True
    ) -> ValidatedUser:
        self.renews.append(renew)
        if not self.available:
            raise IdentityServiceUnavailable()
        user = self._users.get(access_token)
        if user is None:
            raise InvalidToken()
        return user


class FakeClassroomClient:
    # Implements the ClassroomClient port. Never raises, fails closed to False
    # when available is False, same as the real HttpClassroomClient.

    def __init__(self) -> None:
        self._authorizations: dict[tuple[UUID, UUID, str], bool] = {}
        self.available = True
        # What would have gone to classroom-service, in order.
        self.announcements: list[dict[str, object]] = []
        self.reports: list[dict[str, object]] = []

    def authorize(self, classroom_id: UUID, subject_id: UUID, role: str, authorized: bool = True) -> None:
        self._authorizations[(classroom_id, subject_id, role)] = authorized

    async def verify_access(self, classroom_id: UUID, subject_id: UUID, role: str, correlation_id: str | None) -> bool:
        if not self.available:
            return False
        return self._authorizations.get((classroom_id, subject_id, role), False)

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
        self.announcements.append(
            {
                "classroom_id": classroom_id,
                "kind": kind,
                "lesson_id": lesson_id,
                "lesson_title": lesson_title,
                "extra_title": extra_title,
                "student_ids": student_ids,
            }
        )

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
        self.reports.append(
            {"classroom_id": classroom_id, "student_id": student_id, "kind": kind, "lesson_id": lesson_id, "score": score}
        )


class FakeObjectStorage:
    # Implements the ObjectStorage port in memory. No real storage in tests.

    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}
        self.full = False

    async def upload(self, key: str, content: bytes, content_type: str) -> None:
        if self.full:
            raise StorageFull()
        self.files[key] = content

    def sign_download(self, key: str) -> SignedDownload:
        return SignedDownload(
            path=f"/test-bucket/{key}", authorization="AWS4-HMAC-SHA256 test", amz_date="20260101T000000Z",
            content_sha256="UNSIGNED-PAYLOAD",
        )

    async def delete(self, key: str) -> None:
        self.files.pop(key, None)

    async def delete_prefix(self, prefix: str) -> None:
        for key in [k for k in self.files if k.startswith(prefix)]:
            del self.files[key]

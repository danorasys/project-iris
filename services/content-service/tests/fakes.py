"""Test doubles for content-service's external dependencies. Never hit the
real network in a test."""

from __future__ import annotations

from uuid import UUID, uuid4

from app.domain.entities import ValidatedUser
from app.domain.exceptions import IdentityServiceUnavailable, InvalidToken


class FakeIdentityClient:
    """Implements the IdentityClient port without any network calls."""

    def __init__(self) -> None:
        self._users: dict[str, ValidatedUser] = {}
        self.available = True

    def register(self, token: str, subject_id: UUID, role: str, extra: dict[str, object] | None = None) -> None:
        self._users[token] = ValidatedUser(subject_id=subject_id, role=role, extra=extra or {})

    async def validate_token(self, access_token: str, correlation_id: str | None) -> ValidatedUser:
        if not self.available:
            raise IdentityServiceUnavailable()
        user = self._users.get(access_token)
        if user is None:
            raise InvalidToken()
        return user


class FakeClassroomClient:
    """Implements the ClassroomClient port. Never raises, fails closed to False
    when available is False, same as the real HttpClassroomClient."""

    def __init__(self) -> None:
        self._authorizations: dict[tuple[UUID, UUID, str], bool] = {}
        self.available = True

    def authorize(self, classroom_id: UUID, subject_id: UUID, role: str, authorized: bool = True) -> None:
        self._authorizations[(classroom_id, subject_id, role)] = authorized

    async def verify_access(self, classroom_id: UUID, subject_id: UUID, role: str, correlation_id: str | None) -> bool:
        if not self.available:
            return False
        return self._authorizations.get((classroom_id, subject_id, role), False)


class FakeObjectStorage:
    """Implements the ObjectStorage port in memory. There's no MinIO in this setup."""

    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}

    async def upload_image(self, lesson_id: UUID, file_name: str, content_type: str, content: bytes) -> str:
        extension = file_name.rsplit(".", 1)[-1] if "." in file_name else "bin"
        key = f"lessons/{lesson_id}/images/{uuid4().hex}.{extension}"
        self.files[key] = content
        return f"http://fake-s3.local/iris-media/{key}"

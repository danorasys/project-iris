# Protocols the application layer uses to talk to the outside world,
# implemented in infrastructure/. This is what keeps application/ free of
# direct SQLAlchemy, httpx or boto3 imports.

from __future__ import annotations

from types import TracebackType
from typing import Protocol
from uuid import UUID

from app.domain.entities import Lesson, ValidatedUser


class LessonRepository(Protocol):
    async def get_by_id(self, lesson_id: UUID) -> Lesson | None: ...

    async def list_by_classroom(self, classroom_id: UUID, published_only: bool) -> list[Lesson]: ...

    # If at least one lesson by this teacher already exists in the classroom,
    # ownership is assumed without calling classroom-service again.
    async def has_lesson_by_teacher_in_classroom(self, teacher_id: UUID, classroom_id: UUID) -> bool: ...

    async def count_by_classroom(self, classroom_id: UUID) -> int: ...

    async def add(self, lesson: Lesson) -> None: ...

    # If replace_blocks is True, replaces the lesson's full set of blocks
    # with lesson.blocks. That's the PATCH endpoint's contract.
    async def update(self, lesson: Lesson, replace_blocks: bool) -> None: ...


class UnitOfWork(Protocol):
    @property
    def lessons(self) -> LessonRepository: ...

    async def __aenter__(self) -> "UnitOfWork": ...
    async def __aexit__(
        self, exc_type: type[BaseException] | None, exc: BaseException | None, tb: TracebackType | None
    ) -> None: ...
    async def commit(self) -> None: ...
    async def rollback(self) -> None: ...


class ObjectStorage(Protocol):
    # Uploads the file and returns the public URL.
    async def upload_image(
        self, lesson_id: UUID, file_name: str, content_type: str, content: bytes
    ) -> str: ...


class IdentityClient(Protocol):
    # Raises InvalidToken (401) if the token is invalid or expired, or
    # IdentityServiceUnavailable (503) if identity-service doesn't respond.
    async def validate_token(self, access_token: str, correlation_id: str | None) -> ValidatedUser: ...


class ClassroomClient(Protocol):
    # Never raises. If classroom-service doesn't respond, returns False.
    # Fail-closed.
    async def verify_access(
        self, classroom_id: UUID, subject_id: UUID, role: str, correlation_id: str | None
    ) -> bool: ...

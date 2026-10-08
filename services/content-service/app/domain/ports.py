# Protocols the application layer uses to talk to the outside world,
# implemented in infrastructure/. This is what keeps application/ free of
# direct SQLAlchemy, httpx or boto3 imports.

from __future__ import annotations

from types import TracebackType
from typing import Protocol
from uuid import UUID

from app.domain.entities import Activity, ContentBlock, Extra, Lesson, SignedDownload, Unit, ValidatedUser


class UnitRepository(Protocol):
    async def get_by_id(self, unit_id: UUID) -> Unit | None: ...

    # In their order.
    async def list_by_classroom(self, classroom_id: UUID) -> list[Unit]: ...

    async def count_by_classroom(self, classroom_id: UUID) -> int: ...

    # Units of each classroom of the teacher, in one query.
    async def count_by_teacher(self, teacher_id: UUID) -> dict[UUID, int]: ...

    async def add(self, unit: Unit) -> None: ...

    async def update(self, unit: Unit) -> None: ...

    async def delete(self, unit_id: UUID) -> None: ...

    async def delete_by_classroom(self, classroom_id: UUID) -> None: ...


class LessonRepository(Protocol):
    # The whole lesson: pages, activity and extras.
    async def get_by_id(self, lesson_id: UUID) -> Lesson | None: ...

    # Only the lessons' own fields, ordered by unit and then by their order.
    async def list_by_classroom(self, classroom_id: UUID, published_only: bool) -> list[Lesson]: ...

    # If at least one lesson by this teacher already exists in the classroom,
    # ownership is assumed without calling classroom-service again.
    async def has_lesson_by_teacher_in_classroom(self, teacher_id: UUID, classroom_id: UUID) -> bool: ...

    async def count_by_unit(self, unit_id: UUID) -> int: ...

    # Lessons of each classroom of the teacher by status, in one query:
    # {classroom_id: {"publicada": 2, "borrador": 1}}.
    async def count_by_teacher(self, teacher_id: UUID) -> dict[UUID, dict[str, int]]: ...

    # Published lessons of each of these classrooms, in one query. A
    # classroom with none isn't in the result.
    async def count_published_by_classrooms(self, classroom_ids: list[UUID]) -> dict[UUID, int]: ...

    async def list_ids_by_classroom(self, classroom_id: UUID) -> list[UUID]: ...

    async def add(self, lesson: Lesson) -> None: ...

    # The lesson's own fields only (unit, title, purpose, goal, order, status).
    async def update_details(self, lesson: Lesson) -> None: ...

    # The pages of the lesson (extra_id None) or of one of its extras.
    async def replace_blocks(self, lesson_id: UUID, blocks: list[ContentBlock], extra_id: UUID | None) -> None: ...

    # The activity of the lesson (extra_id None) or of one of its extras.
    async def replace_activity(self, lesson_id: UUID, activity: Activity, extra_id: UUID | None) -> None: ...

    async def add_extra(self, extra: Extra) -> None: ...

    # Title, order and who it's for.
    async def update_extra(self, extra: Extra) -> None: ...

    async def delete_extra(self, extra_id: UUID) -> None: ...

    # Its pages, activity and extras go with it.
    async def delete(self, lesson_id: UUID) -> None: ...

    async def delete_by_classroom(self, classroom_id: UUID) -> None: ...


class UnitOfWork(Protocol):
    @property
    def lessons(self) -> LessonRepository: ...

    @property
    def units(self) -> UnitRepository: ...

    async def __aenter__(self) -> "UnitOfWork": ...
    async def __aexit__(
        self, exc_type: type[BaseException] | None, exc: BaseException | None, tb: TracebackType | None
    ) -> None: ...
    async def commit(self) -> None: ...
    async def rollback(self) -> None: ...


# The bucket is private: nothing in it has a public URL. Images only reach
# the browser through GET /lessons/{id}/images/{file}, after an access check.
class ObjectStorage(Protocol):
    async def upload(self, key: str, content: bytes, content_type: str) -> None: ...

    # Signs a GET of the key for Caddy (see app/api/media.py). No network
    # call: if the file is missing, Garage answers 404 when Caddy asks.
    def sign_download(self, key: str) -> SignedDownload: ...

    # Does nothing if the key is already gone.
    async def delete(self, key: str) -> None: ...

    # Every file whose key starts with prefix, like a lesson's folder.
    async def delete_prefix(self, prefix: str) -> None: ...


class IdentityClient(Protocol):
    # Raises InvalidToken (401) if the token is invalid or expired, or
    # IdentityServiceUnavailable (503) if identity-service doesn't respond.
    async def validate_token(
        self, access_token: str, correlation_id: str | None, renew: bool = True
    ) -> ValidatedUser: ...


class ClassroomClient(Protocol):
    # Never raises. If classroom-service doesn't respond, returns False.
    # Fail-closed.
    async def verify_access(
        self, classroom_id: UUID, subject_id: UUID, role: str, correlation_id: str | None
    ) -> bool: ...

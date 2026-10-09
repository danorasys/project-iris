# Protocol the application layer uses to talk to the outside world,
# implemented in infrastructure/. This is what keeps application/ free of a
# direct SQLAlchemy import, same convention as the other services.

from __future__ import annotations

from types import TracebackType
from typing import Protocol
from uuid import UUID

from app.domain.entities import Notification, NotificationPage


class NotificationRepository(Protocol):
    async def get_by_id(self, notification_id: UUID) -> Notification | None: ...
    # Newest first, a slice of the tray plus how many there are in total
    # and how many are still unread. Optionally only one class and one kid.
    # One conversation inside one person's tray, oldest first (HU-51).
    async def list_thread(self, recipient_id: UUID, recipient_role: str, thread_id: UUID) -> list[Notification]: ...

    # Whether this person has a message of this thread about this enrollment.
    async def thread_has(self, thread_id: UUID, person_id: UUID, enrollment_id: UUID) -> bool: ...

    # Of these people (any role), or about these kids. Says how many.
    async def erase(self, person_ids: list[UUID], student_ids: list[UUID]) -> int: ...

    async def list_page(
        self,
        recipient_id: UUID,
        recipient_role: str,
        offset: int,
        limit: int,
        classroom_id: UUID | None = None,
        student_id: UUID | None = None,
        events: list[str] | None = None,
    ) -> NotificationPage: ...
    async def add(self, notification: Notification) -> None: ...
    async def mark_read(self, notification: Notification) -> None: ...
    async def delete(self, notification_id: UUID) -> None: ...
    # Deletes the ones of that list that belong to that person, in one
    # statement, and says how many there were.
    async def delete_owned(self, notification_ids: list[UUID], recipient_id: UUID, recipient_role: str) -> int: ...


class UnitOfWork(Protocol):
    @property
    def notifications(self) -> NotificationRepository: ...

    async def __aenter__(self) -> "UnitOfWork": ...
    async def __aexit__(
        self, exc_type: type[BaseException] | None, exc: BaseException | None, tb: TracebackType | None
    ) -> None: ...
    async def commit(self) -> None: ...
    async def rollback(self) -> None: ...

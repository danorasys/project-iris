"""Protocol the application layer uses to talk to the outside world,
implemented in infrastructure/. This is what keeps application/ free of a
direct SQLAlchemy import, same convention as the other services."""

from __future__ import annotations

from types import TracebackType
from typing import Protocol
from uuid import UUID

from app.domain.entities import Notification


class NotificationRepository(Protocol):
    async def get_by_id(self, notification_id: UUID) -> Notification | None: ...
    async def list_by_teacher(self, teacher_id: UUID) -> list[Notification]: ...
    async def add(self, notification: Notification) -> None: ...
    async def mark_read(self, notification: Notification) -> None: ...


class UnitOfWork(Protocol):
    @property
    def notifications(self) -> NotificationRepository: ...

    async def __aenter__(self) -> "UnitOfWork": ...
    async def __aexit__(
        self, exc_type: type[BaseException] | None, exc: BaseException | None, tb: TracebackType | None
    ) -> None: ...
    async def commit(self) -> None: ...
    async def rollback(self) -> None: ...

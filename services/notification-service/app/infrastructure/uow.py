from __future__ import annotations

from types import TracebackType

from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db import SessionLocal
from app.infrastructure.repositories import SqlAlchemyNotificationRepository


# Implements the UnitOfWork port. One transaction per use case.
class SqlAlchemyUnitOfWork:
    session: AsyncSession

    async def __aenter__(self) -> "SqlAlchemyUnitOfWork":
        self.session = SessionLocal()
        self.notifications = SqlAlchemyNotificationRepository(self.session)
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        if exc_type is not None:
            await self.session.rollback()
        await self.session.close()

    async def commit(self) -> None:
        await self.session.commit()

    async def rollback(self) -> None:
        await self.session.rollback()

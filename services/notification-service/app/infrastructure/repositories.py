from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities import Notification
from app.infrastructure.models import NotificationModel

_LIST_LIMIT = 50


def _to_entity(m: NotificationModel) -> Notification:
    return Notification(
        id=m.id,
        teacher_id=m.teacher_id,
        event=m.event,
        classroom_id=m.classroom_id,
        enrollment_id=m.enrollment_id,
        student_name=m.student_name,
        decision=m.decision,
        read=m.read,
        created_at=m.created_at,
    )


class SqlAlchemyNotificationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, notification_id: UUID) -> Notification | None:
        m = await self._session.get(NotificationModel, notification_id)
        return _to_entity(m) if m else None

    async def list_by_teacher(self, teacher_id: UUID) -> list[Notification]:
        result = await self._session.execute(
            select(NotificationModel)
            .where(NotificationModel.teacher_id == teacher_id)
            .order_by(NotificationModel.created_at.desc())
            .limit(_LIST_LIMIT)
        )
        return [_to_entity(m) for m in result.scalars().all()]

    async def add(self, notification: Notification) -> None:
        self._session.add(
            NotificationModel(
                id=notification.id,
                teacher_id=notification.teacher_id,
                event=notification.event,
                classroom_id=notification.classroom_id,
                enrollment_id=notification.enrollment_id,
                student_name=notification.student_name,
                decision=notification.decision,
                read=notification.read,
                created_at=notification.created_at,
            )
        )

    async def mark_read(self, notification: Notification) -> None:
        m = await self._session.get(NotificationModel, notification.id)
        if m is None:
            return
        m.read = True

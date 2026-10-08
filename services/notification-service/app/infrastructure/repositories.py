from __future__ import annotations

from uuid import UUID

from sqlalchemy import case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities import Notification, NotificationPage
from app.infrastructure.models import NotificationModel


def _to_entity(m: NotificationModel) -> Notification:
    return Notification(
        id=m.id,
        recipient_id=m.recipient_id,
        recipient_role=m.recipient_role,
        event=m.event,
        classroom_id=m.classroom_id,
        enrollment_id=m.enrollment_id,
        student_name=m.student_name,
        decision=m.decision,
        read=m.read,
        created_at=m.created_at,
        student_id=m.student_id,
        classroom_name=m.classroom_name,
        sender_name=m.sender_name,
    )


class SqlAlchemyNotificationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, notification_id: UUID) -> Notification | None:
        m = await self._session.get(NotificationModel, notification_id)
        return _to_entity(m) if m else None

    async def list_page(self, recipient_id: UUID, recipient_role: str, offset: int, limit: int) -> NotificationPage:
        mine = (NotificationModel.recipient_id == recipient_id) & (NotificationModel.recipient_role == recipient_role)
        # Both counts in one query.
        counts = await self._session.execute(
            select(func.count(), func.coalesce(func.sum(case((NotificationModel.read.is_(False), 1), else_=0)), 0)).where(
                mine
            )
        )
        total, unread = counts.one()
        rows = await self._session.execute(
            select(NotificationModel)
            .where(mine)
            # The id breaks ties, so a page never repeats or skips one.
            .order_by(NotificationModel.created_at.desc(), NotificationModel.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return NotificationPage(
            items=[_to_entity(m) for m in rows.scalars().all()], total=int(total), unread=int(unread)
        )

    async def add(self, notification: Notification) -> None:
        self._session.add(
            NotificationModel(
                id=notification.id,
                recipient_id=notification.recipient_id,
                recipient_role=notification.recipient_role,
                event=notification.event,
                classroom_id=notification.classroom_id,
                enrollment_id=notification.enrollment_id,
                student_id=notification.student_id,
                student_name=notification.student_name,
                classroom_name=notification.classroom_name,
                sender_name=notification.sender_name,
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

    async def delete(self, notification_id: UUID) -> None:
        await self._session.execute(delete(NotificationModel).where(NotificationModel.id == notification_id))

    async def delete_owned(self, notification_ids: list[UUID], recipient_id: UUID, recipient_role: str) -> int:
        result = await self._session.execute(
            delete(NotificationModel).where(
                NotificationModel.id.in_(notification_ids),
                NotificationModel.recipient_id == recipient_id,
                NotificationModel.recipient_role == recipient_role,
            )
        )
        return int(getattr(result, "rowcount", 0) or 0)

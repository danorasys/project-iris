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
        subject=m.subject,
        body=m.body,
        lesson_id=m.lesson_id,
        lesson_title=m.lesson_title,
        extra_title=m.extra_title,
        score_correct=m.score_correct,
        score_total=m.score_total,
        addressee=m.addressee,
        thread_id=m.thread_id,
    )


class SqlAlchemyNotificationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, notification_id: UUID) -> Notification | None:
        m = await self._session.get(NotificationModel, notification_id)
        return _to_entity(m) if m else None

    async def list_page(
        self,
        recipient_id: UUID,
        recipient_role: str,
        offset: int,
        limit: int,
        classroom_id: UUID | None = None,
        student_id: UUID | None = None,
        events: list[str] | None = None,
    ) -> NotificationPage:
        mine = (NotificationModel.recipient_id == recipient_id) & (NotificationModel.recipient_role == recipient_role)
        # The space of one class shows only its own (HU-42).
        if classroom_id is not None:
            mine &= NotificationModel.classroom_id == classroom_id
        if student_id is not None:
            mine &= NotificationModel.student_id == student_id
        # Only some kinds, like the messages of a class (HU-77).
        if events:
            mine &= NotificationModel.event.in_(events)
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
                subject=notification.subject,
                body=notification.body,
                lesson_id=notification.lesson_id,
                lesson_title=notification.lesson_title,
                extra_title=notification.extra_title,
                score_correct=notification.score_correct,
                score_total=notification.score_total,
                addressee=notification.addressee,
                thread_id=notification.thread_id,
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

    async def list_thread(self, recipient_id: UUID, recipient_role: str, thread_id: UUID) -> list[Notification]:
        rows = await self._session.execute(
            select(NotificationModel)
            .where(
                NotificationModel.recipient_id == recipient_id,
                NotificationModel.recipient_role == recipient_role,
                NotificationModel.thread_id == thread_id,
            )
            .order_by(NotificationModel.created_at, NotificationModel.id)
        )
        return [_to_entity(m) for m in rows.scalars().all()]

    async def thread_has(self, thread_id: UUID, person_id: UUID, enrollment_id: UUID) -> bool:
        found = await self._session.execute(
            select(NotificationModel.id)
            .where(
                NotificationModel.thread_id == thread_id,
                NotificationModel.recipient_id == person_id,
                NotificationModel.enrollment_id == enrollment_id,
            )
            .limit(1)
        )
        return found.first() is not None

    async def erase(self, person_ids: list[UUID], student_ids: list[UUID]) -> int:
        if not person_ids and not student_ids:
            return 0
        result = await self._session.execute(
            delete(NotificationModel).where(
                NotificationModel.recipient_id.in_(person_ids + student_ids)
                | NotificationModel.student_id.in_(student_ids)
            )
        )
        return int(getattr(result, "rowcount", 0) or 0)

    async def delete_owned(self, notification_ids: list[UUID], recipient_id: UUID, recipient_role: str) -> int:
        result = await self._session.execute(
            delete(NotificationModel).where(
                NotificationModel.id.in_(notification_ids),
                NotificationModel.recipient_id == recipient_id,
                NotificationModel.recipient_role == recipient_role,
            )
        )
        return int(getattr(result, "rowcount", 0) or 0)

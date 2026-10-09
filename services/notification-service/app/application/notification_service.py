# Use case: turn the events coming from Redis into notifications, and let
# each person (a teacher, a guardian or a kid) see, read and delete their own.

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Callable
from uuid import UUID

from app.domain.entities import (
    ACTIVITY_COMPLETED,
    BODY_MAX_LENGTH,
    CONTENT_COMPLETED,
    ENROLLMENT_REMOVED,
    ENROLLMENT_WITHDRAWN,
    EXTRA_PUBLISHED,
    LESSON_PUBLISHED,
    MESSAGE_SENT,
    REQUEST_CANCELLED,
    REQUEST_CLOSED,
    REQUEST_CREATED,
    REQUEST_RESOLVED,
    ROLE_GUARDIAN,
    ROLE_STUDENT,
    ROLE_TEACHER,
    SUBJECT_MAX_LENGTH,
    TEACHER_MESSAGE,
    Notification,
    NotificationPage,
)
from app.domain.exceptions import NotificationNotFound
from app.domain.ports import UnitOfWork

UowFactory = Callable[[], UnitOfWork]


def _uuid_or_none(value: object) -> UUID | None:
    try:
        return UUID(str(value)) if value else None
    except ValueError:
        return None


# Texts that come in the event, cut to the size of their columns.
def _text_or_none(value: object, max_length: int) -> str | None:
    return str(value)[:max_length] if value else None


def _int_or_none(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


_KNOWN_EVENTS = (
    REQUEST_CREATED,
    REQUEST_RESOLVED,
    ENROLLMENT_REMOVED,
    REQUEST_CANCELLED,
    ENROLLMENT_WITHDRAWN,
    MESSAGE_SENT,
    TEACHER_MESSAGE,
    REQUEST_CLOSED,
    CONTENT_COMPLETED,
    ACTIVITY_COMPLETED,
)
# A new lesson or extra comes as one event with every kid it's for.
_ANNOUNCEMENTS = (LESSON_PUBLISHED, EXTRA_PUBLISHED)
# The most kids one notice goes to, way more than a class has.
_MEMBERS_MAX = 500
# Who hears about each event. The teacher, about everything a family does
# and the requests they answered; the guardian, about what the teacher did.
# What someone did themselves from the portal isn't told back to them.
_FOR_TEACHER = (
    REQUEST_CREATED,
    REQUEST_RESOLVED,
    REQUEST_CANCELLED,
    ENROLLMENT_WITHDRAWN,
    MESSAGE_SENT,
    CONTENT_COMPLETED,
    ACTIVITY_COMPLETED,
)
# Events that carry the words someone wrote.
_MESSAGES = (MESSAGE_SENT, TEACHER_MESSAGE)
_FOR_GUARDIAN = (REQUEST_RESOLVED, ENROLLMENT_REMOVED, REQUEST_CLOSED)


class NotificationService:
    def __init__(self, uow_factory: UowFactory) -> None:
        self._uow_factory = uow_factory

    # Turns a raw event from the classroom.requests Redis channel into
    # stored notifications, one for each person who hears about it (see
    # _FOR_TEACHER and _FOR_GUARDIAN). The guardian's needs the event to say
    # who they are. Unknown event types are ignored.
    async def record_event(self, payload: dict[str, object]) -> None:
        event = payload.get("event")
        if event in _ANNOUNCEMENTS:
            await self._save(self._announcement(payload))
            return
        teacher_id = _uuid_or_none(payload.get("teacher_id"))
        classroom_id = _uuid_or_none(payload.get("classroom_id"))
        enrollment_id = _uuid_or_none(payload.get("enrollment_id"))
        if event not in _KNOWN_EVENTS or not teacher_id or not classroom_id or not enrollment_id:
            return

        now = datetime.now(timezone.utc)
        student_name = _text_or_none(payload.get("student_name"), 120)
        decision = _text_or_none(payload.get("decision"), 20) if event == REQUEST_RESOLVED else None
        is_message = event in _MESSAGES
        thread_id = await self._thread_of(str(event), payload, teacher_id, enrollment_id) if is_message else None
        addressee = _text_or_none(payload.get("recipient"), 20) if event == TEACHER_MESSAGE else None

        def notification_for(
            recipient_id: UUID, role: str, sender_name: str | None, read: bool = False, to: str | None = None
        ) -> Notification:
            correct = _int_or_none(payload.get("correct"))
            total = _int_or_none(payload.get("total"))
            return Notification(
                id=uuid.uuid4(),
                recipient_id=recipient_id,
                recipient_role=role,
                event=str(event),
                classroom_id=classroom_id,
                enrollment_id=enrollment_id,
                student_name=student_name,
                decision=decision,
                read=read,
                created_at=now,
                student_id=_uuid_or_none(payload.get("student_id")),
                classroom_name=_text_or_none(payload.get("classroom_name"), 120),
                sender_name=sender_name,
                subject=_text_or_none(payload.get("subject"), SUBJECT_MAX_LENGTH) if is_message else None,
                body=_text_or_none(payload.get("body"), BODY_MAX_LENGTH) if is_message else None,
                lesson_id=_uuid_or_none(payload.get("lesson_id")),
                lesson_title=_text_or_none(payload.get("lesson_title"), 200),
                score_correct=correct if event == ACTIVITY_COMPLETED else None,
                score_total=total if event == ACTIVITY_COMPLETED else None,
                addressee=to or (addressee if addressee in (ROLE_STUDENT, ROLE_GUARDIAN) else None),
                thread_id=thread_id,
            )

        notifications: list[Notification] = []
        if event == TEACHER_MESSAGE:
            # To the kid or to their guardian, from the teacher, and a copy
            # already read for the teacher: what they sent themselves.
            to = _uuid_or_none(payload.get("guardian_id" if addressee == ROLE_GUARDIAN else "student_id"))
            if addressee not in (ROLE_STUDENT, ROLE_GUARDIAN) or to is None:
                return
            teacher_name = _text_or_none(payload.get("teacher_name"), 255)
            notifications.append(notification_for(to, str(addressee), teacher_name))
            notifications.append(notification_for(teacher_id, ROLE_TEACHER, None, read=True))
        elif event in _FOR_TEACHER:
            # From the guardian, or from the kid in a report, except an
            # answered request: that's a record of what the teacher did
            # themselves, so it arrives already read.
            answered = event == REQUEST_RESOLVED
            from_kid = event in (CONTENT_COMPLETED, ACTIVITY_COMPLETED)
            sender_key = "student_name" if from_kid else "guardian_name"
            teacher_sender = None if answered else _text_or_none(payload.get(sender_key), 255)
            notifications.append(notification_for(teacher_id, ROLE_TEACHER, teacher_sender, read=answered))
        guardian_id = _uuid_or_none(payload.get("guardian_id"))
        if event == MESSAGE_SENT and guardian_id is not None:
            # The guardian keeps a copy of what they wrote, already read, so
            # the conversation reads whole from their side too (HU-51).
            notifications.append(notification_for(guardian_id, ROLE_GUARDIAN, None, read=True, to=ROLE_TEACHER))
        if event in _FOR_GUARDIAN and guardian_id is not None:
            # From the teacher who answered or took the kid out.
            sender = _text_or_none(payload.get("teacher_name"), 255)
            notifications.append(notification_for(guardian_id, ROLE_GUARDIAN, sender))
        await self._save(notifications)

    # The thread of a message (HU-51). A new one comes with a fresh id from
    # classroom-service. An answer keeps its thread only if whoever answers
    # already has a message of it about the same kid; if not, it starts a
    # thread of its own, so nobody can slip into somebody else's conversation.
    async def _thread_of(
        self, event: str, payload: dict[str, object], teacher_id: UUID, enrollment_id: UUID
    ) -> UUID:
        given = _uuid_or_none(payload.get("thread_id"))
        if given is None:
            return uuid.uuid4()
        if payload.get("reply") is not True:
            return given
        sender = _uuid_or_none(payload.get("guardian_id")) if event == MESSAGE_SENT else teacher_id
        if sender is None:
            return uuid.uuid4()
        async with self._uow_factory() as uow:
            joins = await uow.notifications.thread_has(given, sender, enrollment_id)
        return given if joins else uuid.uuid4()

    # One conversation as this person sees it, oldest first (HU-51). A
    # thread they have nothing of is the same as one that doesn't exist.
    async def thread(self, recipient_id: UUID, role: str, thread_id: UUID) -> list[Notification]:
        async with self._uow_factory() as uow:
            messages = await uow.notifications.list_thread(recipient_id, role, thread_id)
        if not messages:
            raise NotificationNotFound()
        return messages

    # A new lesson or a new extra (HU-83): one for each kid it's for and
    # one for their guardian, from the teacher. A member without a valid
    # enrollment or kid is skipped; without a guardian, only the kid's.
    def _announcement(self, payload: dict[str, object]) -> list[Notification]:
        classroom_id = _uuid_or_none(payload.get("classroom_id"))
        members = payload.get("members")
        if classroom_id is None or not isinstance(members, list):
            return []
        now = datetime.now(timezone.utc)
        event = str(payload.get("event"))
        common = {
            "event": event,
            "classroom_id": classroom_id,
            "classroom_name": _text_or_none(payload.get("classroom_name"), 120),
            "sender_name": _text_or_none(payload.get("teacher_name"), 255),
            "lesson_id": _uuid_or_none(payload.get("lesson_id")),
            "lesson_title": _text_or_none(payload.get("lesson_title"), 200),
            "extra_title": _text_or_none(payload.get("extra_title"), 200) if event == EXTRA_PUBLISHED else None,
        }
        notifications: list[Notification] = []
        for member in members[:_MEMBERS_MAX]:
            if not isinstance(member, dict):
                continue
            enrollment_id = _uuid_or_none(member.get("enrollment_id"))
            student_id = _uuid_or_none(member.get("student_id"))
            if enrollment_id is None or student_id is None:
                continue
            student_name = _text_or_none(member.get("student_name"), 120)
            guardian_id = _uuid_or_none(member.get("guardian_id"))
            recipients = [(student_id, ROLE_STUDENT)] + ([(guardian_id, ROLE_GUARDIAN)] if guardian_id else [])
            for recipient_id, role in recipients:
                notifications.append(
                    Notification(
                        id=uuid.uuid4(),
                        recipient_id=recipient_id,
                        recipient_role=role,
                        enrollment_id=enrollment_id,
                        student_id=student_id,
                        student_name=student_name,
                        decision=None,
                        read=False,
                        created_at=now,
                        **common,  # type: ignore[arg-type]
                    )
                )
        return notifications

    async def _save(self, notifications: list[Notification]) -> None:
        if not notifications:
            return
        async with self._uow_factory() as uow:
            for notification in notifications:
                await uow.notifications.add(notification)
            await uow.commit()

    async def list_page(
        self,
        recipient_id: UUID,
        role: str,
        page: int,
        page_size: int,
        classroom_id: UUID | None = None,
        student_id: UUID | None = None,
        events: list[str] | None = None,
    ) -> NotificationPage:
        async with self._uow_factory() as uow:
            return await uow.notifications.list_page(
                recipient_id, role, (page - 1) * page_size, page_size, classroom_id, student_id, events
            )

    async def mark_as_read(self, notification_id: UUID, recipient_id: UUID, role: str) -> Notification:
        async with self._uow_factory() as uow:
            notification = await _own_notification(uow, notification_id, recipient_id, role)
            notification.read = True
            await uow.notifications.mark_read(notification)
            await uow.commit()
            return notification

    async def delete(self, notification_id: UUID, recipient_id: UUID, role: str) -> None:
        async with self._uow_factory() as uow:
            await _own_notification(uow, notification_id, recipient_id, role)
            await uow.notifications.delete(notification_id)
            await uow.commit()

    # For identity-service, before deleting an account (HU-91, HU-92): every
    # notification of these people, and every one about these kids in
    # anybody's tray (a teacher's keeps the kid's name). Says how many went.
    async def erase(self, person_ids: list[UUID], student_ids: list[UUID]) -> int:
        async with self._uow_factory() as uow:
            deleted = await uow.notifications.erase(person_ids, student_ids)
            await uow.commit()
            return deleted

    # Several at once, all or none. Only the person's own are deleted: an id
    # of someone else (or that doesn't exist) is just left out, so ids can't
    # be probed from outside. Says how many were deleted.
    async def delete_many(self, notification_ids: list[UUID], recipient_id: UUID, role: str) -> int:
        async with self._uow_factory() as uow:
            deleted = await uow.notifications.delete_owned(notification_ids, recipient_id, role)
            await uow.commit()
            return deleted


# Someone else's notification answers the same as one that doesn't exist,
# so ids can't be probed from outside.
async def _own_notification(uow: UnitOfWork, notification_id: UUID, recipient_id: UUID, role: str) -> Notification:
    notification = await uow.notifications.get_by_id(notification_id)
    if notification is None or notification.recipient_id != recipient_id or notification.recipient_role != role:
        raise NotificationNotFound()
    return notification

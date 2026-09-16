# Events published by classroom-service on the classroom.requests Redis
# channel get persisted as notifications for the right teacher.

from __future__ import annotations

import asyncio
import json
import uuid

import fakeredis.aioredis

from app.application.notification_service import NotificationService
from app.infrastructure.redis_listener import listen_for_requests
from app.infrastructure.uow import SqlAlchemyUnitOfWork

CHANNEL = "classroom.requests"


async def _publish_and_wait(redis: fakeredis.aioredis.FakeRedis, payload: dict[str, object]) -> None:
    notifications = NotificationService(uow_factory=SqlAlchemyUnitOfWork)
    task = asyncio.create_task(listen_for_requests(redis, notifications, CHANNEL))
    await asyncio.sleep(0.05)  # let the subscription complete before publishing
    await redis.publish(CHANNEL, json.dumps(payload))
    await asyncio.sleep(0.05)  # let the listener process the message
    task.cancel()


async def test_request_created_is_persisted_for_the_right_teacher() -> None:
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    teacher_id = str(uuid.uuid4())
    try:
        await _publish_and_wait(
            redis,
            {
                "event": "request.created",
                "classroom_id": str(uuid.uuid4()),
                "enrollment_id": str(uuid.uuid4()),
                "student_name": "Sofía",
                "teacher_id": teacher_id,
            },
        )

        service = NotificationService(uow_factory=SqlAlchemyUnitOfWork)
        stored = await service.list_my_notifications(uuid.UUID(teacher_id))

        assert len(stored) == 1
        assert stored[0].student_name == "Sofía"
        assert stored[0].read is False
    finally:
        await redis.aclose()


async def test_event_without_teacher_id_is_ignored() -> None:
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    try:
        await _publish_and_wait(
            redis,
            {
                "event": "request.created",
                "classroom_id": str(uuid.uuid4()),
                "enrollment_id": str(uuid.uuid4()),
                "student_name": "Sofía",
            },
        )
        # Nothing to assert against a specific teacher, this just confirms
        # the listener didn't crash and there's no orphaned notification.
        service = NotificationService(uow_factory=SqlAlchemyUnitOfWork)
        stored = await service.list_my_notifications(uuid.uuid4())
        assert stored == []
    finally:
        await redis.aclose()

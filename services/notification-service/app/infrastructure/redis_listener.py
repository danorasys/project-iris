# Subscriber for the classroom.requests Redis channel.
#
# classroom-service publishes request.created and request.resolved events
# there. This listener runs as a background task for the app's whole
# lifespan (started in app/main.py) and persists each recognized event as a
# notification for its teacher, who reads it back later over
# GET /notifications/me.

from __future__ import annotations

import asyncio
import contextlib
import json
import logging

from redis.asyncio import Redis

from app.application.notification_service import NotificationService

logger = logging.getLogger(__name__)


# Infinite loop, cancelled from the lifespan when the app shuts down.
async def listen_for_requests(redis: Redis, notifications: NotificationService, channel: str) -> None:
    pubsub = redis.pubsub()
    await pubsub.subscribe(channel)
    logger.info("Suscrito al canal Redis '%s'.", channel)
    try:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            await _process_message(message.get("data"), notifications)
    except asyncio.CancelledError:
        raise
    finally:
        with contextlib.suppress(Exception):
            await pubsub.unsubscribe(channel)
        with contextlib.suppress(Exception):
            await pubsub.aclose()


async def _process_message(data: object, notifications: NotificationService) -> None:
    if not isinstance(data, (str, bytes)):
        return
    try:
        event = json.loads(data)
    except (TypeError, ValueError):
        logger.warning("Mensaje no-JSON recibido en el canal de solicitudes; se descarta.")
        return

    if not isinstance(event, dict):
        logger.warning("Mensaje con forma inesperada recibido en el canal de solicitudes; se descarta.")
        return

    try:
        await notifications.record_event(event)
    except Exception:
        logger.exception("No fue posible persistir la notificación para el evento %s.", event.get("event"))

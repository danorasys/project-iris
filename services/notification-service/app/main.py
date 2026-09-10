from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

from app.api import deps
from app.api.routes_health import router as health_router
from app.api.routes_notifications import router as notifications_router
from app.config import get_settings
from app.correlation import CorrelationIdMiddleware
from app.errors import register_exception_handlers
from app.infrastructure.redis_listener import listen_for_requests
from app.logging_config import configure_logging

settings = get_settings()
configure_logging(settings.service_name)
logger = logging.getLogger(__name__)


def _resolve_redis(app: FastAPI) -> Redis:
    """Resolves the Redis client honoring app.dependency_overrides, the same
    way FastAPI would for a route with Depends(get_redis). Needed because the
    lifespan background task doesn't go through per-request dependency
    injection, and tests inject fakeredis there to avoid the real network."""
    factory = app.dependency_overrides.get(deps.get_redis, deps.get_redis)
    return factory()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    redis = _resolve_redis(app)
    notifications = deps.get_notification_service()
    task = asyncio.create_task(listen_for_requests(redis, notifications, settings.redis_requests_channel))
    logger.info("notification-service iniciado", extra={"extra_fields": {"environment": settings.environment}})
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="IRIS — notification-service", version="1.0.0", lifespan=lifespan)

app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(health_router)
app.include_router(notifications_router)

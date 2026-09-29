from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis, from_url

from app.api import deps
from app.api.routes_health import router as health_router
from app.api.routes_proxy import router as proxy_router
from app.config import get_settings
from app.correlation import CorrelationIdMiddleware
from app.errors import register_exception_handlers
from app.infrastructure.redis_rate_limiter import RedisRequestCounter
from app.logging_config import configure_logging
from app.rate_limit import RateLimitMiddleware

settings = get_settings()
configure_logging(settings.service_name)
logger = logging.getLogger(__name__)


# Connects on first use, so importing this module never needs Redis up.
redis: Redis = from_url(settings.redis_url, decode_responses=True)


# Honors app.dependency_overrides the same way FastAPI would for a route
# with Depends(get_http_client), so tests can close or swap the client
# without the lifespan trying to close one it didn't create.
def _resolve_http_client(app: FastAPI) -> httpx.AsyncClient:
    factory = app.dependency_overrides.get(deps.get_http_client, deps.get_http_client)
    return factory()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    client = _resolve_http_client(app)
    logger.info("api-gateway iniciado", extra={"extra_fields": {"environment": settings.environment}})
    try:
        yield
    finally:
        await client.aclose()
        await redis.aclose()


app = FastAPI(title="IRIS — api-gateway", version="1.0.0", lifespan=lifespan)
# The rate limit middleware reads the counter from here, so tests can swap it.
app.state.request_counter = RedisRequestCounter(redis)

app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(
    RateLimitMiddleware,
    general_max=settings.rate_limit_general_max,
    auth_max=settings.rate_limit_auth_max,
    window_sec=settings.rate_limit_window_sec,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(health_router)
app.include_router(proxy_router)

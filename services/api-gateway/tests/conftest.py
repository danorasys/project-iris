from __future__ import annotations

import os

os.environ.setdefault("IDENTITY_SERVICE_URL", "http://identity-service.test")
os.environ.setdefault("CLASSROOM_SERVICE_URL", "http://classroom-service.test")
os.environ.setdefault("CONTENT_SERVICE_URL", "http://content-service.test")
os.environ.setdefault("NOTIFICATION_SERVICE_URL", "http://notification-service.test")
os.environ.setdefault("WEB_ORIGIN", "http://localhost:5173")

from collections.abc import AsyncIterator  # noqa: E402

import fakeredis.aioredis  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.infrastructure.redis_rate_limiter import RedisRequestCounter  # noqa: E402
from app.main import app  # noqa: E402

IDENTITY_SERVICE_URL = os.environ["IDENTITY_SERVICE_URL"]
CLASSROOM_SERVICE_URL = os.environ["CLASSROOM_SERVICE_URL"]
CONTENT_SERVICE_URL = os.environ["CONTENT_SERVICE_URL"]
NOTIFICATION_SERVICE_URL = os.environ["NOTIFICATION_SERVICE_URL"]


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    # ASGITransport points straight at our app, no real network. The OUTGOING
    # calls the app makes to domain services use a different httpx.AsyncClient
    # (app/api/deps.py::get_http_client) with the default HTTP transport.
    # That's the one respx intercepts in each test, without touching this one.
    #
    # The rate limit counter is a fake Redis, so tests never try to reach a real
    # one and start with empty counters.
    fake_redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    original_counter = app.state.request_counter
    app.state.request_counter = RedisRequestCounter(fake_redis)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
            yield ac
    finally:
        app.state.request_counter = original_counter
        await fake_redis.aclose()

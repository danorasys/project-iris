from __future__ import annotations

from collections.abc import AsyncIterator

import fakeredis.aioredis
import httpx
import pytest
import pytest_asyncio
import respx
from httpx import AsyncClient
from redis.exceptions import ConnectionError as RedisConnectionError

from app.infrastructure.redis_rate_limiter import RedisRequestCounter
from app.main import app, settings
from tests.conftest import IDENTITY_SERVICE_URL

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def redis_client(client: AsyncClient) -> AsyncIterator[fakeredis.aioredis.FakeRedis]:
    # Each test gets an empty fake Redis behind the gateway's counter.
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    original = app.state.request_counter
    app.state.request_counter = RedisRequestCounter(fake)
    yield fake
    app.state.request_counter = original
    await fake.aclose()


@respx.mock
async def test_auth_paths_get_the_tight_budget_and_a_retry_after(
    client: AsyncClient, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    respx.post(f"{IDENTITY_SERVICE_URL}/auth/login").mock(return_value=httpx.Response(200, json={}))

    for _ in range(settings.rate_limit_auth_max):
        assert (await client.post("/api/identity/auth/login", json={})).status_code == 200
    blocked = await client.post("/api/identity/auth/login", json={})

    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "demasiadas_solicitudes"
    assert int(blocked.headers["Retry-After"]) == blocked.json()["error"]["details"]["retry_after_seconds"]
    assert 1 <= int(blocked.headers["Retry-After"]) <= settings.rate_limit_window_sec


@respx.mock
async def test_other_paths_have_their_own_larger_budget(
    client: AsyncClient, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    respx.post(f"{IDENTITY_SERVICE_URL}/auth/login").mock(return_value=httpx.Response(200, json={}))
    respx.get(f"{IDENTITY_SERVICE_URL}/users/me").mock(return_value=httpx.Response(200, json={}))
    for _ in range(settings.rate_limit_auth_max + 1):
        await client.post("/api/identity/auth/login", json={})

    assert (await client.get("/api/identity/users/me")).status_code == 200


async def test_health_checks_are_never_limited(client: AsyncClient, redis_client: fakeredis.aioredis.FakeRedis) -> None:
    for _ in range(settings.rate_limit_general_max + 5):
        assert (await client.get("/health/live")).status_code == 200


@respx.mock
async def test_keys_hold_a_hash_of_the_ip_and_expire(
    client: AsyncClient, redis_client: fakeredis.aioredis.FakeRedis
) -> None:
    respx.get(f"{IDENTITY_SERVICE_URL}/users/me").mock(return_value=httpx.Response(200, json={}))
    await client.get("/api/identity/users/me")

    keys = [key async for key in redis_client.scan_iter("*")]

    assert len(keys) == 1
    assert "127.0.0.1" not in keys[0]
    assert 0 < await redis_client.ttl(keys[0]) <= settings.rate_limit_window_sec


async def test_a_key_left_without_expiry_gets_one_on_the_next_hit(redis_client: fakeredis.aioredis.FakeRedis) -> None:
    counter = RedisRequestCounter(redis_client)
    await redis_client.set("gateway-ratelimit:k", 5)

    assert await counter.hit("k", 10, 60) == 0

    assert 0 < await redis_client.ttl("gateway-ratelimit:k") <= 60


@respx.mock
async def test_the_gateway_keeps_serving_if_redis_is_down(client: AsyncClient) -> None:
    class BrokenRedis:
        def pipeline(self) -> None:
            raise RedisConnectionError("down")

    respx.get(f"{IDENTITY_SERVICE_URL}/users/me").mock(return_value=httpx.Response(200, json={}))
    original = app.state.request_counter
    app.state.request_counter = RedisRequestCounter(BrokenRedis())  # type: ignore[arg-type]
    try:
        response = await client.get("/api/identity/users/me")
    finally:
        app.state.request_counter = original

    assert response.status_code == 200

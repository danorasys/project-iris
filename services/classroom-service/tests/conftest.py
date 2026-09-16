from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{Path(__file__).parent}/test_{uuid.uuid4().hex}.db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")
os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")
os.environ.setdefault("WEB_ORIGIN", "http://localhost:5173")
os.environ.setdefault("IDENTITY_SERVICE_URL", "http://identity-service.test")
os.environ.setdefault("S3_SECRET_KEY", "test-s3-secret")

import fakeredis.aioredis
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.api import deps
from app.infrastructure.db import Base, engine
from app.main import app
from tests.fakes import FakeIdentityGateway, FakeObjectStorage

_TEST_DB_FILE = os.environ["DATABASE_URL"].removeprefix("sqlite+aiosqlite:///")


@pytest_asyncio.fixture(autouse=True)
async def _prepare_database() -> AsyncIterator[None]:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def redis_client() -> AsyncIterator[fakeredis.aioredis.FakeRedis]:
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    app.dependency_overrides[deps.get_redis] = lambda: fake
    yield fake
    app.dependency_overrides.pop(deps.get_redis, None)
    await fake.aclose()


@pytest.fixture
def identity_gateway() -> Iterator[FakeIdentityGateway]:
    fake = FakeIdentityGateway()
    app.dependency_overrides[deps.get_identity_gateway] = lambda: fake
    yield fake
    app.dependency_overrides.pop(deps.get_identity_gateway, None)


@pytest.fixture
def object_storage() -> Iterator[FakeObjectStorage]:
    fake = FakeObjectStorage()
    app.dependency_overrides[deps.get_object_storage] = lambda: fake
    yield fake
    app.dependency_overrides.pop(deps.get_object_storage, None)


@pytest_asyncio.fixture
async def client(
    redis_client: fakeredis.aioredis.FakeRedis,
    identity_gateway: FakeIdentityGateway,
    object_storage: FakeObjectStorage,
) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture(scope="session", autouse=True)
def _cleanup_db_file() -> Iterator[None]:
    yield
    db_path = Path(_TEST_DB_FILE)
    if db_path.exists():
        db_path.unlink()

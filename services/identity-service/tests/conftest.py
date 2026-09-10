from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{Path(__file__).parent}/test_{uuid.uuid4().hex}.db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")
os.environ.setdefault("WEB_ORIGIN", "http://localhost:5173")

import fakeredis.aioredis
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.api import deps
from app.infrastructure.db import Base, engine
from app.infrastructure.models import DocumentTypeModel, RelationshipTypeModel
from app.main import app

_TEST_DB_FILE = os.environ["DATABASE_URL"].removeprefix("sqlite+aiosqlite:///")

# Matches the seed order in alembic/versions/0006_document_relationship_catalogs.py,
# so tests can rely on the same ids (1=Cédula de ciudadanía, 1=Madre, etc).
DOCUMENT_TYPE_ID_CEDULA = 1
RELATIONSHIP_TYPE_ID_MADRE = 1


@pytest_asyncio.fixture(autouse=True)
async def _prepare_database() -> AsyncIterator[None]:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with engine.begin() as conn:
        await conn.execute(
            DocumentTypeModel.__table__.insert(),
            [{"name": "Cédula de ciudadanía"}, {"name": "Cédula de extranjería"}, {"name": "Pasaporte"}],
        )
        await conn.execute(
            RelationshipTypeModel.__table__.insert(),
            [{"name": "Madre"}, {"name": "Padre"}, {"name": "Acudiente legal"}, {"name": "Otro"}],
        )
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


@pytest_asyncio.fixture
async def client(redis_client: fakeredis.aioredis.FakeRedis) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture(scope="session", autouse=True)
def _cleanup_db_file() -> Iterator[None]:
    yield
    db_path = Path(_TEST_DB_FILE)
    if db_path.exists():
        db_path.unlink()

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{Path(__file__).parent}/test_{uuid.uuid4().hex}.db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")
os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")
os.environ.setdefault("WEB_ORIGIN", "http://localhost:5173")
os.environ.setdefault("IDENTITY_SERVICE_URL", "http://identity-service.invalid")

import fakeredis.aioredis  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.api import deps  # noqa: E402
from app.domain.exceptions import InvalidToken  # noqa: E402
from app.infrastructure.db import Base, engine  # noqa: E402
from app.infrastructure.http_clients.identity_client import TokenClaims  # noqa: E402
from app.main import app  # noqa: E402

_TEST_DB_FILE = os.environ["DATABASE_URL"].removeprefix("sqlite+aiosqlite:///")


# Replaces IdentityClient in tests via dependency injection. Never hits
# the real network.
class FakeIdentityClient:
    def __init__(self) -> None:
        self.tokens: dict[str, TokenClaims] = {}

    def register(self, token: str, *, sub: str, role: str = "teacher") -> None:
        self.tokens[token] = TokenClaims(sub=sub, role=role, extra={})

    async def validate_token(self, token: str | None, correlation_id: str | None = None) -> TokenClaims:
        if token is None or token not in self.tokens:
            raise InvalidToken("Token de prueba desconocido.")
        return self.tokens[token]


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
def fake_identity_client() -> FakeIdentityClient:
    return FakeIdentityClient()


@pytest_asyncio.fixture
async def client(
    redis_client: fakeredis.aioredis.FakeRedis,
    fake_identity_client: FakeIdentityClient,
) -> AsyncIterator[AsyncClient]:
    app.dependency_overrides[deps.get_identity_client] = lambda: fake_identity_client
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(deps.get_identity_client, None)


@pytest.fixture(scope="session", autouse=True)
def _cleanup_db_file() -> Iterator[None]:
    yield
    db_path = Path(_TEST_DB_FILE)
    if db_path.exists():
        db_path.unlink()

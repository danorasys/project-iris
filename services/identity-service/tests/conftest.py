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
# A real Fernet key is required here (unlike the plain strings above) because
# FernetTotpEncryptor actually encrypts/decrypts with it in tests. It's a
# throwaway key that only ever protects data in the ephemeral test database.
os.environ.setdefault("TOTP_ENCRYPTION_KEY", "Co9JKiKl3sQwBsQc_tOwxRxRsmQlgfjqdtWeX7_Z6-Y=")

import fakeredis.aioredis
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.api import deps
from app.infrastructure.db import Base, engine
from app.infrastructure.models import AvatarModel, DocumentTypeModel, RelationshipTypeModel, SupportConditionModel
from app.main import app

_TEST_DB_FILE = os.environ["DATABASE_URL"].removeprefix("sqlite+aiosqlite:///")

# Matches the seed order in alembic/versions/0004_support_conditions_catalog.py,
# so tests can rely on the same ids (1=Cédula de ciudadanía, 1=Madre, etc).
DOCUMENT_TYPE_ID_CEDULA = 1
DOCUMENT_TYPE_ID_PASAPORTE = 3
RELATIONSHIP_TYPE_ID_MADRE = 1
SUPPORT_CONDITION_ID_PARALISIS_CEREBRAL = 1
SUPPORT_CONDITION_ID_OTRA = 14
SUPPORT_CONDITION_ID_PREFIERO_NO_ESPECIFICAR = 15
AVATAR_ID_VIOLETA = 1
AVATAR_ID_CORAL = 2


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
        await conn.execute(
            SupportConditionModel.__table__.insert(),
            [
                {"name": "Parálisis cerebral"},
                {"name": "Lesión medular"},
                {"name": "Mielomeningocele"},
                {"name": "Enfermedad de Arnold Chiari"},
                {"name": "Distrofias musculares / miopatías"},
                {"name": "Agenesia del cuerpo calloso u otra malformación congénita"},
                {"name": "Luxación congénita de cadera"},
                {"name": "Artrogriposis"},
                {"name": "Parálisis de Guillain-Barré"},
                {"name": "Poliomielitis anterior aguda"},
                {"name": "Traumatismo craneoencefálico"},
                {"name": "Reumatismos infantiles"},
                {"name": "Mutilaciones o amputaciones"},
                {"name": "Otra condición (especificar)"},
                {"name": "Prefiero no especificar"},
            ],
        )
        await conn.execute(
            AvatarModel.__table__.insert(),
            [
                {"name": "Violeta", "image_path": "http://localhost:9000/iris-media/avatars/avatar-1.png"},
                {"name": "Coral", "image_path": "http://localhost:9000/iris-media/avatars/avatar-2.png"},
                {"name": "Bosque", "image_path": "http://localhost:9000/iris-media/avatars/avatar-3.png"},
                {"name": "Cielo", "image_path": "http://localhost:9000/iris-media/avatars/avatar-4.png"},
            ],
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

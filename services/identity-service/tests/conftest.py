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
import pyotp
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


async def activar_2fa_y_abrir_portal(client: AsyncClient, token: str) -> str:
    """Turns on 2FA for the guardian behind token and returns the secret.
    Finishing the setup also opens the parents' portal for a while."""
    headers = {"Authorization": f"Bearer {token}"}
    setup = await client.post("/guardians/me/2fa/setup", headers=headers)
    secret: str = setup.json()["manual_entry_key"]
    verificado = await client.post("/guardians/me/2fa/verify", json={"code": pyotp.TOTP(secret).now()}, headers=headers)
    assert verificado.status_code == 204
    return secret


def payload_registro_tutor(correo: str, document_number: str) -> dict:
    return {
        "guardian": {
            "first_name": "Ana",
            "last_name": "Pérez",
            "document_type_id": 1,
            "document_number": document_number,
            "document_issued_at": "2015-06-01",
            "date_of_birth": "1990-04-12",
            "email": correo,
            "password": "Clave-Segura-123",
            "password_confirmation": "Clave-Segura-123",
            "phone_country_code": "57",
            "phone_number": "3001234567",
            "relationship_type_id": 1,
        },
        "student": {
            "first_name": "Sofía",
            "last_name": "Pérez",
            "date_of_birth": "2018-05-10",
            "avatar_id": AVATAR_ID_VIOLETA,
            "pin": "1234",
            "pin_confirmation": "1234",
            "support_condition_id": SUPPORT_CONDITION_ID_PREFIERO_NO_ESPECIFICAR,
        },
        "consent": {
            "policy_version": "v1",
            "accepts_data_processing": True,
            "authorizes_support_condition": True,
        },
    }


async def registrar_tutor(client: AsyncClient, correo: str, document_number: str) -> str:
    respuesta = await client.post("/auth/guardians", json=payload_registro_tutor(correo, document_number))
    assert respuesta.status_code == 201
    token: str = respuesta.json()["access_token"]
    return token


async def registrar_tutor_con_2fa(client: AsyncClient, correo: str, document_number: str) -> tuple[str, str]:
    token = await registrar_tutor(client, correo, document_number)
    secret = await activar_2fa_y_abrir_portal(client, token)
    return token, secret


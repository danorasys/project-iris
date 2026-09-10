"""Unit tests for the real HTTP client to identity-service, not the business
routes, which use FakeIdentityGateway via DI (see tests/fakes.py). Uses
httpx.MockTransport to avoid hitting the real network."""

from __future__ import annotations

import uuid

import httpx
import pytest

from app.domain.exceptions import IdentityServiceUnavailable, ResourceNotFound, InvalidToken
from app.infrastructure.http_clients.identity_client import IdentityHttpClient

pytestmark = pytest.mark.asyncio


def _client_con_transporte(handler) -> IdentityHttpClient:  # type: ignore[no-untyped-def]
    cliente = IdentityHttpClient(base_url="http://identity.test", internal_key="clave-interna")
    cliente._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return cliente


async def test_validar_token_200_devuelve_claims_y_cachea() -> None:
    llamadas = {"n": 0}
    sub = str(uuid.uuid4())

    def handler(request: httpx.Request) -> httpx.Response:
        llamadas["n"] += 1
        assert request.headers["X-Internal-Key"] == "clave-interna"
        assert request.headers["Authorization"] == "Bearer token-abc"
        return httpx.Response(200, json={"sub": sub, "role": "teacher", "extra": {}})

    cliente = _client_con_transporte(handler)

    claims1 = await cliente.validar_token("token-abc")
    claims2 = await cliente.validar_token("token-abc")

    assert str(claims1.sub) == sub
    assert claims1.role == "teacher"
    assert claims2.sub == claims1.sub
    assert llamadas["n"] == 1  # second call was served from cache (TTLCache)


async def test_validar_token_401_levanta_token_invalido() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": {"code": "token_invalido", "message": "x"}})

    cliente = _client_con_transporte(handler)

    with pytest.raises(InvalidToken):
        await cliente.validar_token("token-malo")


async def test_validar_token_5xx_abre_circuito_tras_cinco_fallos() -> None:
    llamadas = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        llamadas["n"] += 1
        return httpx.Response(500)

    cliente = _client_con_transporte(handler)

    for _ in range(5):
        with pytest.raises(IdentityServiceUnavailable):
            await cliente.validar_token(f"token-{llamadas['n']}")

    assert llamadas["n"] == 5

    # The sixth attempt shouldn't even hit the transport, the circuit is open.
    with pytest.raises(IdentityServiceUnavailable):
        await cliente.validar_token("token-que-no-deberia-llamar")

    assert llamadas["n"] == 5


async def test_obtener_estudiante_no_usa_cache() -> None:
    llamadas = {"n": 0}
    student_id = uuid.uuid4()

    def handler(request: httpx.Request) -> httpx.Response:
        llamadas["n"] += 1
        return httpx.Response(
            200,
            json={
                "student_id": str(student_id),
                "student_first_name": "Sofía",
                "student_avatar": "zorro",
                "guardian_first_name": "Ana",
                "guardian_last_name": "Pérez",
                "guardian_email": "ana@example.com",
                "guardian_phone": "3001234567",
            },
        )

    cliente = _client_con_transporte(handler)

    await cliente.obtener_estudiante(student_id)
    await cliente.obtener_estudiante(student_id)

    assert llamadas["n"] == 2


async def test_obtener_estudiante_404_levanta_recurso_no_encontrado() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": {"code": "recurso_no_encontrado", "message": "x"}})

    cliente = _client_con_transporte(handler)

    with pytest.raises(ResourceNotFound):
        await cliente.obtener_estudiante(uuid.uuid4())

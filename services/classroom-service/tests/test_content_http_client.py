# Unit tests for the real HTTP client to content-service, with
# httpx.MockTransport instead of the network. It must fail closed: anything
# but a 204 means the lessons weren't deleted.

from __future__ import annotations

import uuid

import httpx
import pytest

from app.domain.exceptions import ContentServiceUnavailable
from app.infrastructure.http_clients.content_client import ContentHttpClient

pytestmark = pytest.mark.asyncio


def _client(handler) -> ContentHttpClient:  # type: ignore[no-untyped-def]
    client = ContentHttpClient(base_url="http://content.test", internal_key="clave-interna")
    client._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return client


async def test_borra_las_lecciones_con_la_llave_interna() -> None:
    classroom_id = uuid.uuid4()
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(204)

    await _client(handler).delete_classroom_lessons(classroom_id)

    [request] = seen
    assert request.method == "DELETE"
    assert request.url.path == f"/internal/classrooms/{classroom_id}/lessons"
    assert request.headers["X-Internal-Key"] == "clave-interna"


@pytest.mark.parametrize("status_code", [401, 404, 500, 503])
async def test_cualquier_otra_respuesta_cuenta_como_no_disponible(status_code: int) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code)

    with pytest.raises(ContentServiceUnavailable):
        await _client(handler).delete_classroom_lessons(uuid.uuid4())


async def test_sin_red_tambien_cuenta_como_no_disponible() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("sin red", request=request)

    with pytest.raises(ContentServiceUnavailable):
        await _client(handler).delete_classroom_lessons(uuid.uuid4())


async def test_cuenta_las_lecciones_publicadas_de_varias_clases() -> None:
    first, second = uuid.uuid4(), uuid.uuid4()
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200,
            json=[
                {"classroom_id": str(first), "published_lessons": 4},
                {"classroom_id": str(second), "published_lessons": 0},
            ],
        )

    counts = await _client(handler).published_lessons([first, second])

    assert counts == {first: 4, second: 0}
    [request] = seen
    assert request.url.path == "/internal/classrooms/published-lessons"
    assert request.url.params.get_list("classroom_id") == [str(first), str(second)]
    assert request.headers["X-Internal-Key"] == "clave-interna"


@pytest.mark.parametrize("status_code", [401, 500])
async def test_sin_conteo_claro_las_lecciones_no_estan_disponibles(status_code: int) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json={})

    with pytest.raises(ContentServiceUnavailable):
        await _client(handler).published_lessons([uuid.uuid4()])

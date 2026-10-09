# Unit tests for the real HTTP client to content-service, with
# httpx.MockTransport instead of the network. It must fail closed: anything
# but a 204 means the lessons weren't deleted.

from __future__ import annotations

import uuid

import httpx
import pytest

from app.domain.entities import PublishedContent
from app.domain.exceptions import ContentServiceUnavailable, ProgressUnavailable
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


async def test_cuenta_las_lecciones_y_unidades_publicadas_de_varias_clases() -> None:
    first, second = uuid.uuid4(), uuid.uuid4()
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200,
            json=[
                {"classroom_id": str(first), "published_lessons": 4, "published_units": 2},
                {"classroom_id": str(second), "published_lessons": 0, "published_units": 0},
            ],
        )

    counts = await _client(handler).published_content([first, second])

    assert counts == {first: PublishedContent(lessons=4, units=2), second: PublishedContent()}
    [request] = seen
    assert request.url.path == "/internal/classrooms/published-lessons"
    assert request.url.params.get_list("classroom_id") == [str(first), str(second)]
    assert request.headers["X-Internal-Key"] == "clave-interna"


@pytest.mark.parametrize("status_code", [401, 500])
async def test_sin_conteo_claro_las_lecciones_no_estan_disponibles(status_code: int) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json={})

    with pytest.raises(ContentServiceUnavailable):
        await _client(handler).published_content([uuid.uuid4()])


async def test_pide_el_progreso_de_un_peque_con_la_llave_interna() -> None:
    classroom_id, student_id = uuid.uuid4(), uuid.uuid4()
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=[{"lesson_id": "x"}])

    lessons = await _client(handler).student_progress(classroom_id, student_id)

    assert lessons == [{"lesson_id": "x"}]
    [request] = seen
    assert request.url.path == f"/internal/classrooms/{classroom_id}/students/{student_id}/progress"
    assert request.headers["X-Internal-Key"] == "clave-interna"


@pytest.mark.parametrize("status_code", [401, 404, 500])
async def test_sin_respuesta_clara_el_progreso_no_esta_disponible(status_code: int) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json={})

    with pytest.raises(ProgressUnavailable):
        await _client(handler).student_progress(uuid.uuid4(), uuid.uuid4())

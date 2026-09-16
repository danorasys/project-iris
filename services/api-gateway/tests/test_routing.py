# Routing table tests.

from __future__ import annotations

import json

import httpx
import pytest
import respx
from httpx import AsyncClient

from tests.conftest import (
    CLASSROOM_SERVICE_URL,
    CONTENT_SERVICE_URL,
    IDENTITY_SERVICE_URL,
    NOTIFICATION_SERVICE_URL,
)

pytestmark = pytest.mark.asyncio


@respx.mock
async def test_routes_identity_stripping_the_full_prefix(client: AsyncClient) -> None:
    route = respx.get(f"{IDENTITY_SERVICE_URL}/users/me").mock(
        return_value=httpx.Response(200, json={"id": "abc"})
    )

    response = await client.get("/api/identity/users/me")

    assert route.called
    assert response.status_code == 200
    assert response.json() == {"id": "abc"}


@respx.mock
async def test_routes_classrooms_keeping_the_classrooms_segment(client: AsyncClient) -> None:
    route = respx.get(f"{CLASSROOM_SERVICE_URL}/classrooms/123/requests").mock(
        return_value=httpx.Response(200, json=[])
    )

    response = await client.get("/api/classrooms/123/requests")

    assert route.called
    assert response.status_code == 200


@respx.mock
async def test_routes_classrooms_prefix_without_rest(client: AsyncClient) -> None:
    route = respx.get(f"{CLASSROOM_SERVICE_URL}/classrooms").mock(return_value=httpx.Response(200, json=[]))

    response = await client.get("/api/classrooms")

    assert route.called
    assert response.status_code == 200


@respx.mock
async def test_routes_content_stripping_the_full_prefix(client: AsyncClient) -> None:
    route = respx.get(f"{CONTENT_SERVICE_URL}/aulas/1/lecciones").mock(return_value=httpx.Response(200, json=[]))

    response = await client.get("/api/content/aulas/1/lecciones")

    assert route.called
    assert response.status_code == 200


@respx.mock
async def test_routes_a_single_content_lesson(client: AsyncClient) -> None:
    route = respx.get(f"{CONTENT_SERVICE_URL}/lecciones/99").mock(return_value=httpx.Response(200, json={}))

    response = await client.get("/api/content/lecciones/99")

    assert route.called
    assert response.status_code == 200


@respx.mock
async def test_routes_notifications_keeping_the_notifications_segment(client: AsyncClient) -> None:
    route = respx.get(f"{NOTIFICATION_SERVICE_URL}/notifications/me").mock(return_value=httpx.Response(200, json=[]))

    response = await client.get("/api/notifications/me")

    assert route.called
    assert response.status_code == 200


@respx.mock
async def test_method_query_and_body_are_forwarded_as_is(client: AsyncClient) -> None:
    route = respx.post(f"{CLASSROOM_SERVICE_URL}/classrooms").mock(return_value=httpx.Response(201, json={"id": "aula-1"}))

    response = await client.post(
        "/api/classrooms",
        json={"name": "Aula 1"},
        params={"origen": "wizard"},
        headers={"Authorization": "Bearer token-docente"},
    )

    assert route.called
    sent = route.calls.last.request
    assert sent.method == "POST"
    assert json.loads(sent.content) == {"name": "Aula 1"}
    assert sent.url.params["origen"] == "wizard"
    assert sent.headers["authorization"] == "Bearer token-docente"
    assert response.status_code == 201
    assert response.json() == {"id": "aula-1"}


@respx.mock
async def test_upstream_error_response_is_returned_as_is(client: AsyncClient) -> None:
    respx.post(f"{IDENTITY_SERVICE_URL}/auth/login").mock(
        return_value=httpx.Response(
            401, json={"error": {"code": "credenciales_invalidas", "message": "Correo o contraseña incorrectos."}}
        )
    )

    response = await client.post("/api/identity/auth/login", json={"email": "a@a.com", "password": "x"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "credenciales_invalidas"


@respx.mock
# Host is hop-by-hop. The client talks to testserver, but the gateway
# must talk to identity-service with its OWN host, never the one the
# original client used. host is excluded explicitly in ProxyService.
async def test_client_host_header_is_not_forwarded_as_is(client: AsyncClient) -> None:
    route = respx.get(f"{IDENTITY_SERVICE_URL}/users/me").mock(return_value=httpx.Response(200, json={}))

    await client.get("/api/identity/users/me")

    sent = route.calls.last.request
    assert sent.headers["host"] == "identity-service.test"


@respx.mock
# Without this, every request identity-service sees comes from the
# gateway's own address, and its per-IP login rate limit collapses into a
# single shared bucket for every user.
async def test_client_ip_is_forwarded_so_downstream_rate_limits_see_the_real_caller(client: AsyncClient) -> None:
    route = respx.post(f"{IDENTITY_SERVICE_URL}/auth/login").mock(return_value=httpx.Response(200, json={}))

    await client.post("/api/identity/auth/login", json={"email": "a@a.com", "password": "x"})

    sent = route.calls.last.request
    assert sent.headers["x-forwarded-for"] == "127.0.0.1"


@respx.mock
# A caller could send its own X-Forwarded-For to dodge the per-IP rate
# limit downstream. The gateway must always overwrite it with the address
# it actually observed the connection from.
async def test_incoming_x_forwarded_for_is_ignored_not_trusted(client: AsyncClient) -> None:
    route = respx.post(f"{IDENTITY_SERVICE_URL}/auth/login").mock(return_value=httpx.Response(200, json={}))

    await client.post(
        "/api/identity/auth/login",
        json={"email": "a@a.com", "password": "x"},
        headers={"X-Forwarded-For": "1.2.3.4"},
    )

    sent = route.calls.last.request
    assert sent.headers["x-forwarded-for"] == "127.0.0.1"

"""502/504 behavior when the target service doesn't respond: connection
refused or connect timeout maps to 502, connects but doesn't respond in time
maps to 504."""

from __future__ import annotations

import httpx
import pytest
import respx
from httpx import AsyncClient

from tests.conftest import IDENTITY_SERVICE_URL

pytestmark = pytest.mark.asyncio


@respx.mock
async def test_connection_refused_gives_502(client: AsyncClient) -> None:
    respx.get(f"{IDENTITY_SERVICE_URL}/users/me").mock(side_effect=httpx.ConnectError("connection refused"))

    response = await client.get("/api/identity/users/me")

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "servicio_no_disponible"


@respx.mock
async def test_connect_timeout_gives_502(client: AsyncClient) -> None:
    respx.get(f"{IDENTITY_SERVICE_URL}/users/me").mock(side_effect=httpx.ConnectTimeout("connect timeout"))

    response = await client.get("/api/identity/users/me")

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "servicio_no_disponible"


@respx.mock
async def test_read_timeout_after_connecting_gives_504(client: AsyncClient) -> None:
    respx.get(f"{IDENTITY_SERVICE_URL}/users/me").mock(side_effect=httpx.ReadTimeout("read timeout"))

    response = await client.get("/api/identity/users/me")

    assert response.status_code == 504
    assert response.json()["error"]["code"] == "servicio_no_responde"

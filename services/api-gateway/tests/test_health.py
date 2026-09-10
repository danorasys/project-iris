from __future__ import annotations

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


async def test_live_always_ok(client: AsyncClient) -> None:
    response = await client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@respx.mock
async def test_ready_ok_if_all_four_services_respond(client: AsyncClient) -> None:
    respx.get(f"{IDENTITY_SERVICE_URL}/health/live").mock(return_value=httpx.Response(200))
    respx.get(f"{CLASSROOM_SERVICE_URL}/health/live").mock(return_value=httpx.Response(200))
    respx.get(f"{CONTENT_SERVICE_URL}/health/live").mock(return_value=httpx.Response(200))
    respx.get(f"{NOTIFICATION_SERVICE_URL}/health/live").mock(return_value=httpx.Response(200))

    response = await client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@respx.mock
async def test_ready_503_if_a_service_does_not_respond(client: AsyncClient) -> None:
    respx.get(f"{IDENTITY_SERVICE_URL}/health/live").mock(return_value=httpx.Response(200))
    respx.get(f"{CLASSROOM_SERVICE_URL}/health/live").mock(side_effect=httpx.ConnectError("down"))
    respx.get(f"{CONTENT_SERVICE_URL}/health/live").mock(return_value=httpx.Response(200))
    respx.get(f"{NOTIFICATION_SERVICE_URL}/health/live").mock(return_value=httpx.Response(200))

    response = await client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}

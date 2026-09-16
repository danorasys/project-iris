# X-Correlation-Id. Generated if the client didn't send one, and propagated
# explicitly on every request forwarded to domain services.

from __future__ import annotations

import httpx
import pytest
import respx
from httpx import AsyncClient

from tests.conftest import IDENTITY_SERVICE_URL

pytestmark = pytest.mark.asyncio


@respx.mock
async def test_correlation_id_generated_if_missing_and_propagated_to_upstream(client: AsyncClient) -> None:
    route = respx.get(f"{IDENTITY_SERVICE_URL}/users/me").mock(return_value=httpx.Response(200, json={}))

    response = await client.get("/api/identity/users/me")

    response_correlation_id = response.headers["x-correlation-id"]
    assert response_correlation_id
    sent = route.calls.last.request
    assert sent.headers["x-correlation-id"] == response_correlation_id


@respx.mock
async def test_client_correlation_id_is_respected_and_propagated(client: AsyncClient) -> None:
    route = respx.get(f"{IDENTITY_SERVICE_URL}/users/me").mock(return_value=httpx.Response(200, json={}))

    response = await client.get("/api/identity/users/me", headers={"X-Correlation-Id": "fixed-correlation-123"})

    assert response.headers["x-correlation-id"] == "fixed-correlation-123"
    assert route.calls.last.request.headers["x-correlation-id"] == "fixed-correlation-123"

"""Explicit security block. Any forwarded route containing the internal
segment responds 404 without forwarding, across all four prefixes."""

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


@respx.mock
async def test_identity_internal_route_blocked(client: AsyncClient) -> None:
    route = respx.get(f"{IDENTITY_SERVICE_URL}/internal/tokens/validate")

    response = await client.get("/api/identity/internal/tokens/validate", headers={"Authorization": "Bearer x"})

    assert response.status_code == 404
    assert not route.called


@respx.mock
async def test_classrooms_internal_route_blocked(client: AsyncClient) -> None:
    route = respx.get(f"{CLASSROOM_SERVICE_URL}/classrooms/internal/algo")

    response = await client.get("/api/classrooms/internal/algo")

    assert response.status_code == 404
    assert not route.called


@respx.mock
async def test_content_internal_route_blocked(client: AsyncClient) -> None:
    route = respx.get(f"{CONTENT_SERVICE_URL}/internal/algo")

    response = await client.get("/api/content/internal/algo")

    assert response.status_code == 404
    assert not route.called


@respx.mock
async def test_notifications_internal_route_blocked(client: AsyncClient) -> None:
    route = respx.get(f"{NOTIFICATION_SERVICE_URL}/notifications/internal/algo")

    response = await client.get("/api/notifications/internal/algo")

    assert response.status_code == 404
    assert not route.called


@respx.mock
async def test_segment_that_only_contains_internal_as_a_substring_is_not_blocked(
    client: AsyncClient,
) -> None:
    """internal must match as a full path segment, not a substring.
    /classrooms/internal-2024/x is a legitimate business route."""
    route = respx.get(f"{CLASSROOM_SERVICE_URL}/classrooms/internal-2024/x").mock(return_value=httpx.Response(200, json={}))

    response = await client.get("/api/classrooms/internal-2024/x")

    assert route.called
    assert response.status_code == 200

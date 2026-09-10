"""Unit tests for the outgoing HTTP clients (identity/classroom) against respx,
without hitting the real network."""

from __future__ import annotations

from uuid import uuid4

import httpx
import pytest
import respx

from app.domain.exceptions import IdentityServiceUnavailable, InvalidToken
from app.infrastructure.http_clients.circuit_breaker import CircuitBreaker
from app.infrastructure.http_clients.classroom_client import HttpClassroomClient
from app.infrastructure.http_clients.identity_client import HttpIdentityClient

pytestmark = pytest.mark.asyncio

IDENTITY_URL = "http://identity-test"
CLASSROOM_URL = "http://classroom-test"


@pytest.fixture
def http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient()


async def test_identity_client_valid_token_returns_user(http_client: httpx.AsyncClient) -> None:
    subject_id = uuid4()
    with respx.mock() as respx_mock:
        respx_mock.get(f"{IDENTITY_URL}/internal/tokens/validate").mock(
            return_value=httpx.Response(200, json={"sub": str(subject_id), "role": "teacher", "extra": {}})
        )
        client = HttpIdentityClient(http_client=http_client, base_url=IDENTITY_URL, internal_key="clave")
        user = await client.validate_token("token-abc", correlation_id="cid-1")

    assert user.subject_id == subject_id
    assert user.role == "teacher"


async def test_identity_client_invalid_token_raises_invalid_token(http_client: httpx.AsyncClient) -> None:
    with respx.mock() as respx_mock:
        respx_mock.get(f"{IDENTITY_URL}/internal/tokens/validate").mock(return_value=httpx.Response(401, json={}))
        client = HttpIdentityClient(http_client=http_client, base_url=IDENTITY_URL, internal_key="clave")
        with pytest.raises(InvalidToken):
            await client.validate_token("token-malo", correlation_id=None)


async def test_identity_client_no_response_raises_identity_service_unavailable(http_client: httpx.AsyncClient) -> None:
    with respx.mock() as respx_mock:
        respx_mock.get(f"{IDENTITY_URL}/internal/tokens/validate").mock(side_effect=httpx.ConnectError("boom"))
        client = HttpIdentityClient(http_client=http_client, base_url=IDENTITY_URL, internal_key="clave")
        with pytest.raises(IdentityServiceUnavailable):
            await client.validate_token("token-x", correlation_id=None)


async def test_identity_client_circuit_breaker_opens_after_consecutive_failures(http_client: httpx.AsyncClient) -> None:
    clock = {"now": 0.0}
    breaker = CircuitBreaker(failure_threshold=3, recovery_seconds=30.0, clock=lambda: clock["now"])
    client = HttpIdentityClient(http_client=http_client, base_url=IDENTITY_URL, internal_key="clave", breaker=breaker)

    with respx.mock() as respx_mock:
        route = respx_mock.get(f"{IDENTITY_URL}/internal/tokens/validate").mock(side_effect=httpx.ConnectError("boom"))

        for i in range(3):
            with pytest.raises(IdentityServiceUnavailable):
                await client.validate_token(f"token-{i}", correlation_id=None)
        assert route.call_count == 3

        # Circuit open, the next call fails fast without hitting the network.
        with pytest.raises(IdentityServiceUnavailable):
            await client.validate_token("token-otro", correlation_id=None)
        assert route.call_count == 3

        # The 30s window runs out -> half-open, a new attempt is allowed.
        clock["now"] = 31.0
        with pytest.raises(IdentityServiceUnavailable):
            await client.validate_token("token-otro-2", correlation_id=None)
        assert route.call_count == 4


async def test_classroom_client_authorized(http_client: httpx.AsyncClient) -> None:
    classroom_id = uuid4()
    subject_id = uuid4()
    with respx.mock() as respx_mock:
        respx_mock.get(f"{CLASSROOM_URL}/internal/classrooms/{classroom_id}/access").mock(
            return_value=httpx.Response(200, json={"authorized": True})
        )
        client = HttpClassroomClient(http_client=http_client, base_url=CLASSROOM_URL, internal_key="clave")
        authorized = await client.verify_access(classroom_id, subject_id, "teacher", None)

    assert authorized is True


async def test_classroom_client_fails_closed_when_no_response(http_client: httpx.AsyncClient) -> None:
    classroom_id = uuid4()
    subject_id = uuid4()
    with respx.mock() as respx_mock:
        respx_mock.get(f"{CLASSROOM_URL}/internal/classrooms/{classroom_id}/access").mock(
            side_effect=httpx.ConnectTimeout("timeout")
        )
        client = HttpClassroomClient(http_client=http_client, base_url=CLASSROOM_URL, internal_key="clave")
        authorized = await client.verify_access(classroom_id, subject_id, "student", None)

    assert authorized is False  # fail-closed, never raises, never authorizes by default


async def test_classroom_client_caches_result(http_client: httpx.AsyncClient) -> None:
    classroom_id = uuid4()
    subject_id = uuid4()
    with respx.mock() as respx_mock:
        route = respx_mock.get(f"{CLASSROOM_URL}/internal/classrooms/{classroom_id}/access").mock(
            return_value=httpx.Response(200, json={"authorized": True})
        )
        client = HttpClassroomClient(http_client=http_client, base_url=CLASSROOM_URL, internal_key="clave")
        assert await client.verify_access(classroom_id, subject_id, "student", None) is True
        assert await client.verify_access(classroom_id, subject_id, "student", None) is True

    assert route.call_count == 1  # second call was served from the 30s TTL cache

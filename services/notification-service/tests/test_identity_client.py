"""Unit tests for IdentityClient, the call to identity-service that validates
the access token on every REST request: 2s timeout plus circuit breaker, and
any failure maps to InvalidToken. See app/api/deps.py."""

from __future__ import annotations

import httpx
import pytest
import respx

from app.domain.exceptions import InvalidToken
from app.infrastructure.http_clients.circuit_breaker import CircuitBreaker
from app.infrastructure.http_clients.identity_client import IdentityClient

pytestmark = pytest.mark.asyncio

_BASE_URL = "http://identity-service.invalid"


def _client(failure_threshold: int = 5, recovery_seconds: float = 30.0, cache_ttl_seconds: int = 30) -> IdentityClient:
    return IdentityClient(
        http_client=httpx.AsyncClient(),
        base_url=_BASE_URL,
        internal_service_key="test-internal-key",
        timeout_sec=2.0,
        circuit_breaker=CircuitBreaker(failure_threshold=failure_threshold, recovery_seconds=recovery_seconds),
        cache_ttl_seconds=cache_ttl_seconds,
    )


@respx.mock
async def test_valid_token_returns_claims() -> None:
    respx.get(f"{_BASE_URL}/internal/tokens/validate").mock(
        return_value=httpx.Response(200, json={"sub": "docente-1", "role": "teacher", "extra": {}})
    )
    client = _client()

    claims = await client.validate_token("token-valido")

    assert claims.sub == "docente-1"
    assert claims.role == "teacher"


@respx.mock
async def test_401_response_from_identity_translates_to_invalid_token() -> None:
    respx.get(f"{_BASE_URL}/internal/tokens/validate").mock(return_value=httpx.Response(401, json={}))
    client = _client()

    with pytest.raises(InvalidToken):
        await client.validate_token("token-expirado")


@respx.mock
async def test_identity_service_not_responding_translates_to_invalid_token() -> None:
    respx.get(f"{_BASE_URL}/internal/tokens/validate").mock(side_effect=httpx.ConnectError("connection refused"))
    client = _client()

    with pytest.raises(InvalidToken):
        await client.validate_token("cualquier-token")


@respx.mock
async def test_open_circuit_after_consecutive_failures_fails_fast_without_hitting_the_network() -> None:
    route = respx.get(f"{_BASE_URL}/internal/tokens/validate").mock(side_effect=httpx.ConnectError("down"))
    client = _client(failure_threshold=2, recovery_seconds=30.0)

    with pytest.raises(InvalidToken):
        await client.validate_token("token-1")
    with pytest.raises(InvalidToken):
        await client.validate_token("token-2")
    assert route.call_count == 2

    # Third attempt, the circuit is already open, shouldn't hit the network again.
    with pytest.raises(InvalidToken):
        await client.validate_token("token-3")
    assert route.call_count == 2


@respx.mock
async def test_repeated_invalid_tokens_do_not_open_the_circuit() -> None:
    """identity-service responding 401 means it's healthy, the token is just
    wrong. That must never count as a circuit-breaker failure, or a run of
    ordinary expired tokens would start rejecting valid ones too."""
    route = respx.get(f"{_BASE_URL}/internal/tokens/validate").mock(return_value=httpx.Response(401, json={}))
    client = _client(failure_threshold=2, recovery_seconds=30.0)

    for i in range(5):
        with pytest.raises(InvalidToken):
            await client.validate_token(f"token-invalido-{i}")

    # Every call actually reached identity-service, none were short-circuited.
    assert route.call_count == 5


@respx.mock
async def test_a_valid_token_is_cached_and_not_revalidated_on_every_call() -> None:
    route = respx.get(f"{_BASE_URL}/internal/tokens/validate").mock(
        return_value=httpx.Response(200, json={"sub": "docente-1", "role": "teacher", "extra": {}})
    )
    client = _client(cache_ttl_seconds=30)

    first = await client.validate_token("token-valido")
    second = await client.validate_token("token-valido")

    assert first == second
    assert route.call_count == 1

from __future__ import annotations

import fakeredis.aioredis
import pytest

from app.infrastructure.redis_gateway import RedisAttemptLockout

pytestmark = pytest.mark.asyncio

MAX_FAILURES = 3
STEPS = [60, 300, 900]


def _lockout(redis: fakeredis.aioredis.FakeRedis) -> RedisAttemptLockout:
    return RedisAttemptLockout(
        redis, max_failures=MAX_FAILURES, fails_window_sec=300, wait_steps_sec=STEPS, reset_after_sec=3600
    )


async def _fail_until_locked(lockout: RedisAttemptLockout, key: str) -> int:
    wait = 0
    for _ in range(MAX_FAILURES):
        wait = await lockout.registrar_fallo(key)
    return wait


async def _let_the_wait_pass(redis: fakeredis.aioredis.FakeRedis, key: str) -> None:
    await redis.delete(f"lockout:{key}:until")


async def test_free_key_is_not_locked(redis_client: fakeredis.aioredis.FakeRedis) -> None:
    assert await _lockout(redis_client).segundos_bloqueado("k") == 0


async def test_failures_below_the_maximum_do_not_lock(redis_client: fakeredis.aioredis.FakeRedis) -> None:
    lockout = _lockout(redis_client)

    waits = [await lockout.registrar_fallo("k") for _ in range(MAX_FAILURES - 1)]

    assert waits == [0] * (MAX_FAILURES - 1)
    assert await lockout.segundos_bloqueado("k") == 0


async def test_the_failure_that_reaches_the_maximum_locks_with_the_first_step(
    redis_client: fakeredis.aioredis.FakeRedis,
) -> None:
    lockout = _lockout(redis_client)

    wait = await _fail_until_locked(lockout, "k")

    assert wait == STEPS[0]
    assert 0 < await lockout.segundos_bloqueado("k") <= STEPS[0]


async def test_each_new_lock_waits_longer_and_the_last_step_repeats(
    redis_client: fakeredis.aioredis.FakeRedis,
) -> None:
    lockout = _lockout(redis_client)
    waits = []

    for _ in range(len(STEPS) + 2):
        waits.append(await _fail_until_locked(lockout, "k"))
        await _let_the_wait_pass(redis_client, "k")

    assert waits == [60, 300, 900, 900, 900]


async def test_a_success_starts_over_from_the_first_step(redis_client: fakeredis.aioredis.FakeRedis) -> None:
    lockout = _lockout(redis_client)
    await _fail_until_locked(lockout, "k")
    await _let_the_wait_pass(redis_client, "k")
    await _fail_until_locked(lockout, "k")
    await _let_the_wait_pass(redis_client, "k")

    await lockout.registrar_exito("k")

    assert await _fail_until_locked(lockout, "k") == STEPS[0]


async def test_a_success_clears_the_failures_of_the_current_round(redis_client: fakeredis.aioredis.FakeRedis) -> None:
    lockout = _lockout(redis_client)
    for _ in range(MAX_FAILURES - 1):
        await lockout.registrar_fallo("k")

    await lockout.registrar_exito("k")

    assert await lockout.registrar_fallo("k") == 0


async def test_keys_do_not_affect_each_other(redis_client: fakeredis.aioredis.FakeRedis) -> None:
    lockout = _lockout(redis_client)

    await _fail_until_locked(lockout, "a")

    assert await lockout.segundos_bloqueado("a") > 0
    assert await lockout.segundos_bloqueado("b") == 0


async def test_a_failure_past_the_maximum_returns_the_current_wait_without_escalating(
    redis_client: fakeredis.aioredis.FakeRedis,
) -> None:
    # Several requests can fail at the same time: only the one that reaches the
    # maximum exactly locks, the others must not push the level up.
    lockout = _lockout(redis_client)
    await redis_client.set("lockout:k:fails", MAX_FAILURES)
    await redis_client.set("lockout:k:until", "1", ex=STEPS[0])

    wait = await lockout.registrar_fallo("k")

    assert 0 < wait <= STEPS[0]
    assert await redis_client.get("lockout:k:level") is None

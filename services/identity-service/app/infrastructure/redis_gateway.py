from __future__ import annotations

import time
from uuid import UUID

from redis.asyncio import Redis


# Implements the RateLimiter port with INCR + TTL.
class RedisRateLimiter:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def permitir(self, clave: str, maximo: int, ventana_seg: int) -> bool:
        key = f"ratelimit:{clave}"
        current = await self._redis.incr(key)
        if current == 1:
            await self._redis.expire(key, ventana_seg)
        return current <= maximo

    async def segundos_restantes(self, clave: str) -> int:
        # ttl is negative when the key has no expiry or is already gone.
        return max(await self._redis.ttl(f"ratelimit:{clave}"), 0)

    async def intentos(self, clave: str) -> int:
        return int(await self._redis.get(f"ratelimit:{clave}") or 0)

    async def olvidar(self, clave: str) -> None:
        await self._redis.delete(f"ratelimit:{clave}")


# Implements the TokenBlacklist port to invalidate refresh tokens. The value
# is the moment it was invalidated, to tell a real reuse from a race.
class RedisTokenBlacklist:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def invalidar(self, jti: str, ttl_seg: int) -> None:
        await self._redis.setex(f"blacklist:{jti}", ttl_seg, str(time.time()))

    async def segundos_desde_invalidacion(self, jti: str) -> float | None:
        value = await self._redis.get(f"blacklist:{jti}")
        return None if value is None else time.time() - float(value)


# Implements the SessionRegistry port. A revoked sid lives as long as a
# refresh token could, after that the tokens are dead by themselves.
class RedisSessionRegistry:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def revocar_sesion(self, sid: str, ttl_seg: int) -> None:
        await self._redis.setex(f"session-revoked:{sid}", ttl_seg, "1")

    async def sesion_revocada(self, sid: str) -> bool:
        return bool(await self._redis.exists(f"session-revoked:{sid}"))

    async def cerrar_todas(self, person_id: UUID, ttl_seg: int) -> None:
        # +1 because token dates only have whole seconds: anything issued in
        # this same second, before the mark, must count as old.
        await self._redis.setex(f"sessions-not-before:{person_id}", ttl_seg, str(int(time.time()) + 1))

    async def emitida_antes_del_cierre(self, person_id: UUID, emitido_en: int) -> bool:
        mark = await self._redis.get(f"sessions-not-before:{person_id}")
        return mark is not None and emitido_en < int(mark)


# Implements the PortalAccessStore port. One key per guardian, that expires on its own.
class RedisPortalAccessStore:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def conceder(self, person_id: UUID, ttl_seg: int) -> None:
        await self._redis.setex(f"portal-access:{person_id}", ttl_seg, "1")

    async def revocar(self, person_id: UUID) -> None:
        await self._redis.delete(f"portal-access:{person_id}")

    async def esta_concedido(self, person_id: UUID) -> bool:
        return bool(await self._redis.exists(f"portal-access:{person_id}"))


# Implements the AttemptLockout port. Three keys per attempt key:
#   fails: failures in the current round, expires by itself
#   until: exists while the key is locked, its TTL is the wait
#   level: how many times it got locked, forgotten after a quiet period
class RedisAttemptLockout:
    def __init__(
        self,
        redis: Redis,
        max_failures: int,
        fails_window_sec: int,
        wait_steps_sec: list[int],
        reset_after_sec: int,
    ) -> None:
        self._redis = redis
        self._max_failures = max_failures
        self._fails_window_sec = fails_window_sec
        self._wait_steps_sec = wait_steps_sec
        self._reset_after_sec = reset_after_sec

    async def segundos_bloqueado(self, clave: str) -> int:
        return max(await self._redis.ttl(f"lockout:{clave}:until"), 0)

    async def registrar_fallo(self, clave: str) -> int:
        fails = await self._redis.incr(f"lockout:{clave}:fails")
        if fails == 1:
            await self._redis.expire(f"lockout:{clave}:fails", self._fails_window_sec)
        if fails < self._max_failures:
            return 0
        # Only the call that reaches the maximum exactly locks. If several
        # requests fail at once, the rest just see the lock that is already set.
        if fails > self._max_failures:
            return await self.segundos_bloqueado(clave)

        level = await self._redis.incr(f"lockout:{clave}:level")
        await self._redis.expire(f"lockout:{clave}:level", self._reset_after_sec)
        wait = self._wait_steps_sec[min(level, len(self._wait_steps_sec)) - 1]
        await self._redis.set(f"lockout:{clave}:until", "1", ex=wait)
        await self._redis.delete(f"lockout:{clave}:fails")
        return wait

    async def nivel(self, clave: str) -> int:
        return int(await self._redis.get(f"lockout:{clave}:level") or 0)

    async def registrar_exito(self, clave: str) -> None:
        await self._redis.delete(f"lockout:{clave}:fails", f"lockout:{clave}:level", f"lockout:{clave}:until")


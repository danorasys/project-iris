from __future__ import annotations

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


# Implements the TokenBlacklist port to invalidate refresh tokens on logout.
class RedisTokenBlacklist:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def invalidar(self, jti: str, ttl_seg: int) -> None:
        await self._redis.setex(f"blacklist:{jti}", ttl_seg, "1")

    async def esta_invalidado(self, jti: str) -> bool:
        return bool(await self._redis.exists(f"blacklist:{jti}"))

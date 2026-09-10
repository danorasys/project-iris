from __future__ import annotations

import json

from redis.asyncio import Redis


class RedisRateLimiter:
    """Implements the RateLimiter port with INCR + TTL. Copied from the same
    pattern in identity-service/app/infrastructure/redis_gateway.py."""

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def permitir(self, clave: str, maximo: int, ventana_seg: int) -> bool:
        key = f"ratelimit:{clave}"
        current = await self._redis.incr(key)
        if current == 1:
            await self._redis.expire(key, ventana_seg)
        return current <= maximo


class RedisEventPublisher:
    """Implements the EventPublisher port. A lightweight event bus toward
    notification-service via Redis Pub/Sub."""

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def publicar(self, canal: str, evento: dict[str, object]) -> None:
        await self._redis.publish(canal, json.dumps(evento, default=str, ensure_ascii=False))

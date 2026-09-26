# Implements the RequestCounter port with a fixed window kept in Redis, so the
# count is shared by every gateway replica and survives a restart.

from __future__ import annotations

import logging

from redis.asyncio import Redis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)


class RedisRequestCounter:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def hit(self, key: str, limit: int, window_sec: int) -> int:
        redis_key = f"gateway-ratelimit:{key}"
        try:
            pipe = self._redis.pipeline()
            pipe.incr(redis_key)
            pipe.ttl(redis_key)
            count, ttl = await pipe.execute()
            # No expiry yet: first hit, or the process died right after INCR.
            if ttl < 0:
                await self._redis.expire(redis_key, window_sec)
                ttl = window_sec
        except (RedisError, OSError):
            # If Redis is down the gateway keeps serving. The login and 2FA
            # locks of identity-service do not depend on this counter.
            logger.warning("Contador de solicitudes no disponible, se deja pasar la solicitud")
            return 0
        return max(int(ttl), 1) if count > limit else 0

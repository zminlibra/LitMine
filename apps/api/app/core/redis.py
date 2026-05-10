import redis.asyncio as aioredis
from arq.connections import ArqRedis
from app.config import get_settings

settings = get_settings()
redis_client: aioredis.Redis | None = None
arq_redis_client: ArqRedis | None = None


async def get_redis() -> aioredis.Redis:
    global redis_client
    if redis_client is None:
        redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
    return redis_client


async def get_arq_redis() -> ArqRedis:
    """Get an ArqRedis connection for enqueueing jobs."""
    global arq_redis_client
    if arq_redis_client is None:
        arq_redis_client = await ArqRedis.from_url(settings.redis_url)
    return arq_redis_client


async def close_redis():
    global redis_client, arq_redis_client
    if redis_client:
        await redis_client.close()
        redis_client = None
    if arq_redis_client:
        await arq_redis_client.close()
        arq_redis_client = None

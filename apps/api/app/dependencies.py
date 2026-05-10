from uuid import UUID
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import redis.asyncio as aioredis

from app.core.database import get_db
from app.core.redis import get_redis
from app.core.security import decode_token
from app.models import User, Subscription
from app.config import TIER_CAPABILITIES

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if user_id is None or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


async def get_tier_capabilities(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(Subscription).where(Subscription.user_id == user.id))
    sub = result.scalar_one_or_none()
    tier = sub.tier if sub else "free"
    return TIER_CAPABILITIES[tier]


async def check_rate_limit(
    user: User = Depends(get_current_user),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Rate limit for free tier: 1 crawl per 7 days."""
    from app.config import get_settings
    settings = get_settings()

    key = f"rate_limit:crawl:{user.id}"
    last_crawl = await redis.get(key)
    if last_crawl:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Free tier allows 1 crawl per {settings.free_crawl_cooldown_hours // 24} days. Upgrade to Pro.",
        )

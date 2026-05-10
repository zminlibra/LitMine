from uuid import UUID
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import redis.asyncio as aioredis

from app.core.database import get_db
from app.core.redis import get_redis, get_arq_redis
from app.dependencies import get_current_user, get_tier_capabilities, check_rate_limit
from app.models import User, Project, Paper
from app.schemas.project import CrawlStatusResponse

router = APIRouter(tags=["ingest"])


@router.post("/projects/{project_id}/crawl", status_code=200)
async def trigger_crawl(
    project_id: UUID,
    user: User = Depends(get_current_user),
    capabilities: dict = Depends(get_tier_capabilities),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, detail="Project not found")

    if project.crawl_status not in ("idle", "completed", "failed"):
        raise HTTPException(400, detail=f"Search already in progress (status: {project.crawl_status})")

    # Rate limit for free tier - record now
    if capabilities["data_retention_days"] is not None:
        from app.config import get_settings
        settings = get_settings()
        redis = await get_redis()
        key = f"rate_limit:crawl:{user.id}"
        await redis.set(key, "1", ex=settings.free_crawl_cooldown_hours * 3600)

    project.crawl_status = "queued"
    project.crawl_progress = {
        "searching": {"total": project.max_papers, "completed": 0},
    }
    await db.commit()

    # Enqueue crawl job via arq
    arq_redis = await get_arq_redis()
    await arq_redis.enqueue_job("crawl_paper_job", str(project.id))

    return {"detail": "Crawl queued", "project_id": str(project.id)}


@router.get("/projects/{project_id}/crawl/status", response_model=CrawlStatusResponse)
async def crawl_status(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, detail="Project not found")

    return CrawlStatusResponse(
        status=project.crawl_status,
        stages=project.crawl_progress or {},
    )


@router.websocket("/ws/projects/{project_id}/crawl")
async def crawl_websocket(websocket: WebSocket, project_id: str):
    await websocket.accept()
    redis = await get_redis()
    pubsub = redis.pubsub()
    channel = f"crawl_progress:{project_id}"
    await pubsub.subscribe(channel)

    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=30)
            if message:
                await websocket.send_text(message["data"])
            # Keepalive ping
            await websocket.send_json({"type": "keepalive"})
    except WebSocketDisconnect:
        await pubsub.unsubscribe(channel)

from contextlib import asynccontextmanager
import asyncio
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.core.redis import get_redis, close_redis
from app.api.router import api_router

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await get_redis()

    # Warm GROBID readiness (in background, don't block startup)
    async def _wait_grobid():
        import httpx
        for i in range(20):
            try:
                async with httpx.AsyncClient(timeout=5) as c:
                    r = await c.get(f"{settings.grobid_url}/api/isalive")
                    if r.status_code == 200:
                        logger.info("GROBID is ready")
                        return
            except Exception:
                pass
            await asyncio.sleep(3)
        logger.warning("GROBID not ready after 60s — PDF parsing will fail until it starts")

    asyncio.create_task(_wait_grobid())

    yield

    # Shutdown
    await close_redis()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}

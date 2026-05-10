"""LLM proxy endpoint - all AI calls go through backend, never expose API key to frontend."""
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import get_settings
from app.dependencies import get_current_user
from app.models import User

settings = get_settings()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm", tags=["llm"])


class ChatMessage(BaseModel):
    role: str  # system, user, assistant
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    temperature: float = 0.5
    max_tokens: int = 2000
    response_format: dict | None = None  # {"type": "json_object"} for structured output


class ChatResponse(BaseModel):
    content: str


@router.post("/proxy", response_model=ChatResponse)
async def llm_proxy(
    body: ChatRequest,
    user: User = Depends(get_current_user),
):
    """Proxy DeepSeek API calls through backend using system key."""
    if not settings.llm_api_key:
        raise HTTPException(500, detail="LLM API key not configured on server")

    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    payload: dict = {
        "model": settings.llm_model,
        "messages": messages,
        "temperature": body.temperature,
        "max_tokens": body.max_tokens,
        "stream": False,
    }

    if body.response_format:
        payload["response_format"] = body.response_format

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{settings.llm_api_base.rstrip('/')}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.llm_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

            if resp.status_code == 402:
                raise HTTPException(402, detail="LLM quota exhausted")
            if resp.status_code == 401:
                raise HTTPException(500, detail="Server LLM key invalid")
            if resp.status_code != 200:
                logger.error(f"LLM proxy error {resp.status_code}: {resp.text[:200]}")
                raise HTTPException(502, detail=f"LLM upstream error: {resp.status_code}")

            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return ChatResponse(content=content)

    except httpx.TimeoutException:
        raise HTTPException(504, detail="LLM request timed out")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LLM proxy failed: {e}")
        raise HTTPException(500, detail="LLM proxy error")

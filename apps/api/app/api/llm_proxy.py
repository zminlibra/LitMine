"""LLM proxy endpoint — routes to multiple providers (DeepSeek, OpenAI, Gemini, Anthropic, etc.)."""
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import get_settings, LLM_PROVIDERS
from app.dependencies import get_current_user
from app.models import User

settings = get_settings()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm", tags=["llm"])

PROVIDER_LIST = [
    {"id": k, "name": v["name"], "models": v["models"], "default_model": v["default_model"]}
    for k, v in LLM_PROVIDERS.items()
]


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    temperature: float = 0.5
    max_tokens: int = 2000
    response_format: dict | None = None
    provider: str = "deepseek"       # which provider to use
    model: str | None = None          # override default model
    api_key: str | None = None        # user-provided key (takes priority over server key)


class ChatResponse(BaseModel):
    content: str


@router.get("/providers")
async def list_providers():
    """Return available LLM providers and their models."""
    return {"providers": PROVIDER_LIST}


@router.post("/proxy", response_model=ChatResponse)
async def llm_proxy(
    body: ChatRequest,
    user: User = Depends(get_current_user),
):
    """Proxy LLM calls to the selected provider."""
    provider_cfg = LLM_PROVIDERS.get(body.provider)
    if not provider_cfg:
        raise HTTPException(400, detail=f"Unknown provider: {body.provider}")

    # Resolve API key: user-supplied > server default
    api_key = body.api_key or settings.llm_api_key
    if not api_key:
        raise HTTPException(400, detail=f"No API key available for {provider_cfg['name']}. Please provide one.")

    # Resolve model
    model = body.model or provider_cfg["default_model"]

    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    # Build endpoint URL
    base = provider_cfg["base_url"].rstrip("/")
    if body.provider == "gemini":
        # Gemini uses a different path pattern
        url = f"{base}/models/{model}:generateContent"
        payload = _build_gemini_payload(messages, body)
    elif body.provider == "anthropic":
        url = f"{base}/v1/messages"
        payload = _build_anthropic_payload(messages, body, model)
    else:
        # OpenAI-compatible API (DeepSeek, OpenAI, OpenRouter, Qwen, Kimi)
        url = f"{base}/chat/completions"
        payload: dict = {
            "model": model,
            "messages": messages,
            "temperature": body.temperature,
            "max_tokens": body.max_tokens,
            "stream": False,
        }
        if body.response_format:
            payload["response_format"] = body.response_format

    # Build auth header
    headers = {
        "Content-Type": "application/json",
        provider_cfg["auth_header"]: f"{provider_cfg['auth_prefix']}{api_key}",
    }
    if body.provider == "anthropic":
        headers["anthropic-version"] = "2023-06-01"

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, headers=headers, json=payload)

            if resp.status_code == 402:
                raise HTTPException(402, detail="LLM quota exhausted")
            if resp.status_code == 401 or resp.status_code == 403:
                raise HTTPException(401, detail=f"{provider_cfg['name']} API key invalid")
            if resp.status_code == 429:
                raise HTTPException(429, detail=f"{provider_cfg['name']} rate limited. Please wait and try again.")
            if resp.status_code != 200:
                logger.error(f"LLM proxy error {resp.status_code} from {body.provider}: {resp.text[:300]}")
                raise HTTPException(502, detail=f"LLM upstream error ({resp.status_code})")

            data = resp.json()
            content = _extract_content(data, body.provider)
            return ChatResponse(content=content)

    except httpx.TimeoutException:
        raise HTTPException(504, detail="LLM request timed out")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LLM proxy failed: {e}")
        raise HTTPException(500, detail="LLM proxy error")


# ── Provider-specific payload builders ──

def _build_gemini_payload(messages: list[dict], body: ChatRequest) -> dict:
    """Build Gemini API request body."""
    contents = []
    system_instruction = None
    for m in messages:
        if m["role"] == "system":
            system_instruction = {"parts": [{"text": m["content"]}]}
        else:
            role = "model" if m["role"] == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": m["content"]}]})

    payload: dict = {
        "contents": contents,
        "generationConfig": {
            "temperature": body.temperature,
            "maxOutputTokens": body.max_tokens,
        },
    }
    if system_instruction:
        payload["systemInstruction"] = system_instruction
    return payload


def _build_anthropic_payload(messages: list[dict], body: ChatRequest, model: str) -> dict:
    """Build Anthropic Messages API request body."""
    system_msgs = [m["content"] for m in messages if m["role"] == "system"]
    chat_msgs = [{"role": m["role"], "content": m["content"]} for m in messages if m["role"] != "system"]

    payload: dict = {
        "model": model,
        "messages": chat_msgs,
        "max_tokens": body.max_tokens,
    }
    if system_msgs:
        payload["system"] = system_msgs[0] if len(system_msgs) == 1 else system_msgs
    return payload


def _extract_content(data: dict, provider: str) -> str:
    """Extract text content from provider-specific response format."""
    if provider == "gemini":
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            return "".join(p.get("text", "") for p in parts)
        return ""
    elif provider == "anthropic":
        content_block = data.get("content", [])
        return "".join(b.get("text", "") for b in content_block if b.get("type") == "text")
    else:
        # OpenAI-compatible
        return data.get("choices", [{}])[0].get("message", {}).get("content", "")

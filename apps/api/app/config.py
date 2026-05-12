from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    # App
    app_name: str = "LitMine API"
    debug: bool = True
    secret_key: str = "dev-secret-key-change-in-production"
    cors_origins: list[str] = ["http://localhost:3000"]

    # PostgreSQL
    database_url: str = "postgresql+asyncpg://litmine:litmine_dev@localhost:5432/litmine"
    database_url_sync: str = "postgresql://litmine:litmine_dev@localhost:5432/litmine"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # GROBID
    grobid_url: str = "http://localhost:8070"

    # Crossref (polite contact email for API)
    crossref_email: str = "litmine@example.com"

    # Upload limits
    max_upload_size_mb: int = 50

    # OpenAlex
    openalex_api_key: str = "05659snR8lF8VrvKmiYsOf"

    # LLM (LiteLLM)
    llm_api_base: str = "https://api.deepseek.com"
    llm_model: str = "deepseek-chat"
    llm_api_key: str = ""
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536

    # JWT
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Tier limits
    free_max_projects: int = 5
    free_max_papers_per_project: int = 30
    pro_max_papers_per_project: int = 200

    # Rate limiting
    free_crawl_cooldown_hours: int = 168  # 7 days
    free_data_retention_days: int = 30


# Preset configurations for all supported LLM providers.
# Users can bring their own API key and select any provider from the frontend.
LLM_PROVIDERS: dict = {
    "deepseek": {
        "name": "DeepSeek",
        "base_url": "https://api.deepseek.com",
        "models": ["deepseek-chat", "deepseek-reasoner", "deepseek-v4-flash", "deepseek-v4-pro"],
        "default_model": "deepseek-chat",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
    },
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o4-mini", "o3-mini"],
        "default_model": "gpt-4o-mini",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
    },
    "anthropic": {
        "name": "Anthropic",
        "base_url": "https://api.anthropic.com",
        "models": ["claude-sonnet-4-7", "claude-haiku-4-5", "claude-opus-4-7", "claude-sonnet-4-5-20250929"],
        "default_model": "claude-sonnet-4-7",
        "auth_header": "x-api-key",
        "auth_prefix": "",
    },
    "gemini": {
        "name": "Google Gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta",
        "models": ["gemini-3-flash", "gemini-3-pro", "gemini-3.1-flash", "gemini-3.1-pro", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
        "default_model": "gemini-3-flash",
        "auth_header": "x-goog-api-key",
        "auth_prefix": "",
    },
    "openrouter": {
        "name": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "models": ["openai/gpt-4o", "anthropic/claude-sonnet-4-7", "google/gemini-2.5-flash", "deepseek/deepseek-chat"],
        "default_model": "openai/gpt-4o",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
    },
    "qwen": {
        "name": "通义千问",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "models": ["qwen-plus", "qwen-max", "qwen-turbo", "qwen3-235b-a22b"],
        "default_model": "qwen-plus",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
    },
    "kimi": {
        "name": "Kimi (Moonshot)",
        "base_url": "https://api.moonshot.cn/v1",
        "models": ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
        "default_model": "moonshot-v1-32k",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
    },
}


@lru_cache
def get_settings() -> Settings:
    return Settings()


TIER_CAPABILITIES = {
    "free": {
        "max_projects": 5,
        "max_papers_per_project": 50,
    "default_max_papers": 50,
        "sources": ["arxiv", "pubmed", "biorxiv", "openalex"],
        "max_report_sections": 1,
        "graph_features": ["citation_graph"],
        "monitoring_enabled": False,
        "export_watermark": True,
        "collaboration_enabled": False,
        "data_retention_days": 30,
    },
    "pro": {
        "max_projects": None,
        "max_papers_per_project": 200,
        "sources": ["arxiv", "pubmed", "biorxiv", "openalex", "cnki", "semantic_scholar"],
        "max_report_sections": 4,
        "graph_features": ["citation_graph", "concept_graph", "method_graph", "organism_graph"],
        "monitoring_enabled": True,
        "export_watermark": False,
        "collaboration_enabled": False,
        "data_retention_days": None,
    },
    "team": {
        "max_projects": None,
        "max_papers_per_project": 500,
        "sources": ["arxiv", "pubmed", "biorxiv", "openalex", "cnki", "semantic_scholar"],
        "max_report_sections": 4,
        "graph_features": [
            "citation_graph",
            "concept_graph",
            "method_graph",
            "organism_graph",
        ],
        "monitoring_enabled": True,
        "export_watermark": False,
        "collaboration_enabled": True,
        "data_retention_days": None,
    },
}

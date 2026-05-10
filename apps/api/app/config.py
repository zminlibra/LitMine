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
        "sources": ["arxiv", "pubmed", "biorxiv", "cnki", "semantic_scholar"],
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
        "sources": ["arxiv", "pubmed", "biorxiv", "cnki", "semantic_scholar"],
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

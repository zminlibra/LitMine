from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class ProjectCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    keywords: list[str] = Field(default_factory=list, min_length=1)
    sources: list[str] = Field(default=["arxiv", "pubmed", "biorxiv"])
    year_range_start: int | None = 2018
    year_range_end: int | None = 2025
    max_papers: int = Field(default=30, ge=10, le=100)


class ProjectUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    keywords: list[str] | None = None


class CrawlStatusResponse(BaseModel):
    status: str
    stages: dict


class ProjectResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    keywords: list[str] | None = None
    sources: list[str] | None = None
    year_range_start: int | None = None
    year_range_end: int | None = None
    max_papers: int = 30
    crawl_status: str = "idle"
    crawl_progress: dict | None = None
    paper_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    projects: list[ProjectResponse]
    total: int

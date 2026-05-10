from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class PaperResponse(BaseModel):
    id: UUID
    project_id: UUID
    title: str
    title_cn: str | None = None
    abstract: str | None = None
    abstract_cn: str | None = None
    doi: str | None = None
    authors: list[str] | None = None
    journal: str | None = None
    year: int | None = None
    source: str
    url: str | None = None
    pdf_storage_path: str | None = None
    status: str
    extracted_entities: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaperListResponse(BaseModel):
    papers: list[PaperResponse]
    total: int
    page: int
    page_size: int


class PaperDetailResponse(PaperResponse):
    structured_text: str | None = None
    embedding: list[float] | None = None


class PaperUpdateRequest(BaseModel):
    title: str | None = None
    abstract: str | None = None
    authors: list[str] | None = None
    journal: str | None = None
    year: int | None = None
    doi: str | None = None


class SearchRequest(BaseModel):
    query: str | None = None
    author: str | None = None
    year: int | None = None
    source: str | None = None
    status: str | None = None

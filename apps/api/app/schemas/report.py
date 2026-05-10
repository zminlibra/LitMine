from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class ReportGenerateRequest(BaseModel):
    focus_areas: list[str] = Field(default_factory=list)
    max_papers_in_report: int = Field(default=20, ge=5, le=50)
    include_visualizations: bool = True


class ReportResponse(BaseModel):
    id: UUID
    project_id: UUID
    title: str
    content_md: str | None = None
    focus_areas: list[str] | None = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}

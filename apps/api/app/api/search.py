from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models import User, Paper
from app.schemas.paper import PaperResponse, PaperListResponse

router = APIRouter(tags=["search"])


@router.get("/projects/{project_id}/search", response_model=PaperListResponse)
async def search_papers(
    project_id: UUID,
    q: str | None = Query(None, description="General search query"),
    author: str | None = Query(None),
    year: int | None = Query(None),
    source: str | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    base = select(Paper).where(Paper.project_id == project_id)

    if q:
        pattern = f"%{q}%"
        base = base.where(
            or_(Paper.title.ilike(pattern), Paper.abstract.ilike(pattern))
        )
    if author:
        base = base.where(Paper.authors.any(author))  # type: ignore[arg-type]
    if year:
        base = base.where(Paper.year == year)
    if source:
        base = base.where(Paper.source == source)
    if status:
        base = base.where(Paper.status == status)

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar()

    papers_q = base.order_by(Paper.year.desc().nulls_last(), Paper.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(papers_q)
    papers = result.scalars().all()

    return PaperListResponse(
        papers=[PaperResponse.model_validate(p) for p in papers],
        total=total, page=page, page_size=page_size,
    )

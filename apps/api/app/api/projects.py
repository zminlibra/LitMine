import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.dependencies import get_current_user, get_tier_capabilities
from app.models import User, Project, Paper
from app.schemas.project import (
    ProjectCreateRequest, ProjectUpdateRequest, ProjectResponse,
    ProjectListResponse, CrawlStatusResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    req: ProjectCreateRequest,
    user: User = Depends(get_current_user),
    capabilities: dict = Depends(get_tier_capabilities),
    db: AsyncSession = Depends(get_db),
):
    # Check project limit
    if capabilities["max_projects"] is not None:
        result = await db.execute(
            select(func.count()).select_from(Project).where(Project.user_id == user.id)
        )
        count = result.scalar()
        if count >= capabilities["max_projects"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Free tier limited to {capabilities['max_projects']} project. Upgrade to Pro.",
            )

    # Validate sources
    for src in req.sources:
        if src not in capabilities["sources"]:
            raise HTTPException(status_code=400, detail=f"Source '{src}' not available on your tier")

    project = Project(
        user_id=user.id,
        name=req.name,
        description=req.description,
        keywords=req.keywords,
        sources=req.sources,
        year_range_start=req.year_range_start,
        year_range_end=req.year_range_end,
        max_papers=min(req.max_papers, capabilities["max_papers_per_project"]),
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return ProjectResponse(
        id=project.id, name=project.name, description=project.description,
        keywords=project.keywords, sources=project.sources,
        year_range_start=project.year_range_start, year_range_end=project.year_range_end,
        max_papers=project.max_papers, crawl_status=project.crawl_status,
        crawl_progress=project.crawl_progress, paper_count=0,
        created_at=project.created_at,
    )


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.user_id == user.id).order_by(Project.created_at.desc())
    )
    projects = result.scalars().all()
    items = []
    for p in projects:
        paper_count_result = await db.execute(
            select(func.count()).select_from(Paper).where(Paper.project_id == p.id)
        )
        paper_count = paper_count_result.scalar()
        items.append(ProjectResponse(
            id=p.id, name=p.name, description=p.description,
            keywords=p.keywords, sources=p.sources,
            year_range_start=p.year_range_start, year_range_end=p.year_range_end,
            max_papers=p.max_papers, crawl_status=p.crawl_status,
            crawl_progress=p.crawl_progress, paper_count=paper_count,
            created_at=p.created_at,
        ))
    return ProjectListResponse(projects=items, total=len(items))


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    paper_count_result = await db.execute(
        select(func.count()).select_from(Paper).where(Paper.project_id == project.id)
    )
    paper_count = paper_count_result.scalar()

    return ProjectResponse(
        id=project.id, name=project.name, description=project.description,
        keywords=project.keywords, sources=project.sources,
        year_range_start=project.year_range_start, year_range_end=project.year_range_end,
        max_papers=project.max_papers, crawl_status=project.crawl_status,
        crawl_progress=project.crawl_progress, paper_count=paper_count,
        created_at=project.created_at,
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    req: ProjectUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if req.name is not None:
        project.name = req.name
    if req.description is not None:
        project.description = req.description
    if req.keywords is not None:
        project.keywords = req.keywords

    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=200)
async def delete_project(
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
    try:
        await db.delete(project)
        await db.commit()
    except Exception as e:
        logger.exception(f"Failed to delete project {project_id}")
        await db.rollback()
        raise HTTPException(500, detail=f"Failed to delete: {str(e)}")
    return {"detail": "Project deleted"}

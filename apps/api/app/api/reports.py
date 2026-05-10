from uuid import UUID
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models import User, Project, Paper, Report
from app.schemas.report import ReportGenerateRequest, ReportResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["reports"])


@router.post("/projects/{project_id}/reports/generate", response_model=ReportResponse)
async def generate_report(
    project_id: UUID,
    req: ReportGenerateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, detail="Project not found")

    report = Report(
        project_id=project.id,
        title=f"Literature Review: {project.name}",
        focus_areas=req.focus_areas,
        status="generating",
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    # Generate inline (no arq dependency)
    from app.integrations.llm import generate_literature_review

    papers_result = await db.execute(
        select(Paper).where(Paper.project_id == project_id).order_by(Paper.year.desc())
    )
    papers = papers_result.scalars().all()

    if not papers:
        report.status = "failed"
        report.content_md = "No papers found in this project."
        await db.commit()
        await db.refresh(report)
        return ReportResponse.model_validate(report)

    paper_dicts = [
        {"title": p.title, "abstract": p.abstract, "authors": p.authors, "year": p.year}
        for p in papers
    ]

    try:
        content = await generate_literature_review(
            papers=paper_dicts,
            focus_areas=report.focus_areas or [],
            num_sections=5,
            max_papers=min(len(paper_dicts), 20),
        )
        report.content_md = content
        report.status = "completed"
    except Exception as e:
        logger.exception(f"Report generation failed: {e}")
        report.content_md = f"Error generating report: {e}"
        report.status = "failed"

    await db.commit()
    await db.refresh(report)
    return ReportResponse.model_validate(report)


@router.get("/projects/{project_id}/reports")
async def list_reports(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify ownership
    proj_result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(404, detail="Project not found")

    result = await db.execute(
        select(Report).where(Report.project_id == project_id).order_by(Report.created_at.desc())
    )
    reports = result.scalars().all()
    return {"reports": [ReportResponse.model_validate(r) for r in reports]}


@router.get("/reports/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Report).where(Report.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, detail="Report not found")

    # Verify ownership
    proj_result = await db.execute(
        select(Project).where(Project.id == report.project_id, Project.user_id == user.id)
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(404, detail="Report not found")

    return ReportResponse.model_validate(report)


@router.delete("/reports/{report_id}", status_code=200)
async def delete_report(
    report_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Report).where(Report.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, detail="Report not found")

    # Verify ownership
    proj_result = await db.execute(
        select(Project).where(Project.id == report.project_id, Project.user_id == user.id)
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(404, detail="Report not found")

    await db.delete(report)
    await db.commit()
    return {"detail": "Report deleted"}


@router.get("/reports/{report_id}/export/pdf")
async def export_report_pdf(
    report_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Report).where(Report.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report or not report.content_md:
        raise HTTPException(404, detail="Report or content not found")

    # For MVP, return the markdown with a text/markdown mime type
    # Full PDF export will use WeasyPrint or headless browser in production
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(content=report.content_md, media_type="text/markdown")

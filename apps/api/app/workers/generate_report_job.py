"""Background job to generate a literature review report."""
import logging
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import select

from app.config import get_settings
from app.models import Report, Paper, Project
from app.integrations.llm import generate_literature_review

settings = get_settings()
logger = logging.getLogger(__name__)
engine = create_async_engine(settings.database_url)


async def generate_report_job(ctx, report_id: str):
    """Generate a literature review report."""
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        result = await db.execute(select(Report).where(Report.id == UUID(report_id)))
        report = result.scalar_one_or_none()
        if not report:
            logger.error(f"Report {report_id} not found")
            return

        report.status = "generating"
        await db.commit()

        # Get project papers
        papers_result = await db.execute(
            select(Paper).where(Paper.project_id == report.project_id).order_by(Paper.year.desc())
        )
        papers = papers_result.scalars().all()

        if not papers:
            report.status = "failed"
            report.content_md = "No papers found in this project."
            await db.commit()
            return

        paper_dicts = [
            {"title": p.title, "abstract": p.abstract, "authors": p.authors, "year": p.year}
            for p in papers
        ]

        # Get project settings
        proj_result = await db.execute(select(Project).where(Project.id == report.project_id))
        project = proj_result.scalar_one_or_none()

        num_sections = 5
        if project:
            from app.config import TIER_CAPABILITIES
            # Use tier capabilities to determine sections
            pass  # Default to 5 (4 analysis + 1 narrative review)

        try:
            content = await generate_literature_review(
                papers=paper_dicts,
                focus_areas=report.focus_areas or [],
                num_sections=num_sections,
                max_papers=min(len(paper_dicts), 20),
            )
            report.content_md = content
            report.status = "completed"
        except Exception as e:
            logger.exception(f"Report generation failed: {e}")
            report.content_md = f"Error generating report: {e}"
            report.status = "failed"

        await db.commit()
        logger.info(f"Report {report_id} generation complete: {report.status}")

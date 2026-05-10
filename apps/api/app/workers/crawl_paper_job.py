"""Background job to crawl papers for a project."""
import json
import logging
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select

from app.config import get_settings
from app.models import Project, Paper

settings = get_settings()
logger = logging.getLogger(__name__)

engine = create_async_engine(settings.database_url)


async def crawl_paper_job(ctx, project_id: str):
    """Main crawl job. Orchestrates crawling from all sources."""
    from app.services.crawler_service import crawl_project

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    redis = ctx["redis"]

    async with session_factory() as db:
        result = await db.execute(select(Project).where(Project.id == UUID(project_id)))
        project = result.scalar_one_or_none()
        if not project:
            logger.error(f"Project {project_id} not found")
            return

        project.crawl_status = "searching"
        await db.commit()

        # Publish progress
        await redis.publish(f"crawl_progress:{project_id}", json.dumps({
            "type": "progress_update", "stage": "searching", "completed": 0, "total": project.max_papers,
        }))

        # Crawl papers
        try:
            paper_dicts = await crawl_project(project)
        except Exception as e:
            logger.exception(f"Crawl failed for project {project_id}")
            project.crawl_status = "failed"
            await db.commit()
            await redis.publish(f"crawl_progress:{project_id}", json.dumps({
                "type": "error", "stage": "crawling", "message": str(e),
            }))
            return

        # Query existing papers in this project for dedup
        existing_result = await db.execute(
            select(Paper.doi, Paper.title).where(Paper.project_id == project.id)
        )
        existing_rows = existing_result.all()
        existing_dois = {row[0] for row in existing_rows if row[0]}
        existing_titles = {row[1].lower().strip()[:100] for row in existing_rows if row[1]}

        # Insert papers into DB, skip duplicates
        added = 0
        for pd in paper_dicts:
            doi = pd.get("doi")
            title = pd.get("title", "")
            title_norm = title.lower().strip()[:100]

            if doi and doi in existing_dois:
                continue
            if title_norm in existing_titles:
                continue

            if doi:
                existing_dois.add(doi)
            existing_titles.add(title_norm)

            paper = Paper(**pd)
            db.add(paper)
            added += 1

        skipped = len(paper_dicts) - added
        if skipped:
            logger.info(f"Dedup: skipped {skipped} duplicate papers for project {project_id}")

        # Update progress — only report stages that actually ran
        total_found = added
        project.crawl_progress = {
            "searching": {"total": total_found, "completed": total_found},
        }
        project.crawl_status = "completed"
        await db.commit()

        await redis.publish(f"crawl_progress:{project_id}", json.dumps({
            "type": "crawl_complete", "total_papers": total_found,
        }))

        logger.info(f"Crawl complete for project {project_id}: {total_found} papers found")

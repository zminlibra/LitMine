"""Background job to parse an uploaded PDF via GROBID and update paper metadata."""
import logging
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import select

from app.config import get_settings
from app.models import Paper
from app.core.minio import get_s3_client
from app.integrations.grobid import parse_pdf_with_grobid, extract_tei_header

settings = get_settings()
logger = logging.getLogger(__name__)
engine = create_async_engine(settings.database_url)


async def parse_uploaded_pdf_job(ctx, paper_id: str):
    """Parse an uploaded PDF: download from MinIO, send to GROBID, update paper metadata."""
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        result = await db.execute(select(Paper).where(Paper.id == UUID(paper_id)))
        paper = result.scalar_one_or_none()
        if not paper:
            logger.error(f"Paper {paper_id} not found for PDF parsing")
            return

        if not paper.pdf_storage_path:
            logger.warning(f"Paper {paper_id} has no pdf_storage_path, skipping")
            return

        # Generate a pre-signed URL to pass to GROBID
        try:
            s3 = get_s3_client()
            pdf_url = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": settings.s3_bucket, "Key": paper.pdf_storage_path},
                ExpiresIn=3600,
            )
        except Exception as e:
            logger.error(f"Failed to generate pre-signed URL for {paper.pdf_storage_path}: {e}")
            return

        # Parse with GROBID
        tei_xml = await parse_pdf_with_grobid(pdf_url)
        if not tei_xml:
            logger.warning(f"GROBID parsing returned no TEI for paper {paper_id}")
            return

        # Extract header metadata
        header = extract_tei_header(tei_xml)

        # Update paper with extracted data
        if header.get("title") and header["title"] != paper.title:
            # Only overwrite title if current is just a filename (no spaces, ends in .pdf)
            if "." in paper.title or len(paper.title) < 20:
                paper.title = header["title"]

        if header.get("abstract") and not paper.abstract:
            paper.abstract = header["abstract"]

        if header.get("authors") and (not paper.authors or len(paper.authors) == 0):
            paper.authors = header["authors"]

        await db.commit()
        logger.info(f"Updated paper {paper_id} from GROBID: title={paper.title[:60] if paper.title else None}")

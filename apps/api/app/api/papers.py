from uuid import UUID
import uuid as uuid_mod
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import logging

from app.core.database import get_db
from app.config import get_settings
from app.dependencies import get_current_user, get_tier_capabilities
from app.models import User, Paper, Project
from app.schemas.paper import PaperResponse, PaperListResponse, PaperDetailResponse, PaperUpdateRequest
from app.services.paper_import_service import resolve_paper_metadata, extract_doi_from_input

settings = get_settings()
logger = logging.getLogger(__name__)

router = APIRouter(tags=["papers"])


async def get_paper_or_404(paper_id: UUID, db: AsyncSession) -> Paper:
    result = await db.execute(select(Paper).where(Paper.id == paper_id))
    paper = result.scalar_one_or_none()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    return paper


@router.get("/projects/{project_id}/papers", response_model=PaperListResponse)
async def list_papers(
    project_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    base = select(Paper).where(Paper.project_id == project_id)
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


@router.get("/papers/{paper_id}", response_model=PaperDetailResponse)
async def get_paper(
    paper_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    paper = await get_paper_or_404(paper_id, db)
    return PaperDetailResponse.model_validate(paper)


@router.patch("/papers/{paper_id}", response_model=PaperDetailResponse)
async def update_paper(
    paper_id: UUID,
    body: PaperUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually edit a paper's metadata."""
    paper = await get_paper_or_404(paper_id, db)

    if body.title is not None:
        paper.title = body.title
    if body.abstract is not None:
        paper.abstract = body.abstract
    if body.authors is not None:
        paper.authors = body.authors
    if body.journal is not None:
        paper.journal = body.journal
    if body.year is not None:
        paper.year = body.year
    if body.doi is not None:
        paper.doi = body.doi

    await db.commit()
    await db.refresh(paper)
    return PaperDetailResponse.model_validate(paper)


@router.delete("/papers/{paper_id}", status_code=200)
async def delete_paper(
    paper_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    paper = await get_paper_or_404(paper_id, db)
    await db.delete(paper)
    await db.commit()
    return {"detail": "Paper deleted"}


class TranslationCacheRequest(BaseModel):
    title_cn: str | None = None
    abstract_cn: str | None = None


@router.post("/papers/{paper_id}/translation", response_model=PaperDetailResponse)
async def save_translation(
    paper_id: UUID,
    body: TranslationCacheRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save Chinese translation cache for a paper."""
    paper = await get_paper_or_404(paper_id, db)
    if body.title_cn is not None:
        paper.title_cn = body.title_cn
    if body.abstract_cn is not None:
        paper.abstract_cn = body.abstract_cn
    await db.commit()
    await db.refresh(paper)
    return PaperDetailResponse.model_validate(paper)


async def _do_refresh(paper: Paper) -> dict | None:
    """Refresh a single paper from its source. Returns updated data or None.
    Also applies the Paper fields in-place. Does NOT commit (caller decides)."""
    source = paper.source
    doi = paper.doi

    if source == "arxiv":
        updated = await _refresh_arxiv(doi, paper.title)
    elif source == "pubmed":
        updated = await _refresh_pubmed(doi, paper.title)
    elif source == "biorxiv":
        updated = await _refresh_biorxiv(doi, paper.title)
    elif source == "openalex":
        updated = await _refresh_openalex(doi, paper.title)
        if updated and not updated.get("abstract") and doi:
            logger.info(f"OpenAlex abstract empty for {paper.id}, falling back to PubMed")
            pubmed_data = await _refresh_pubmed(doi, paper.title)
            if pubmed_data and pubmed_data.get("abstract"):
                updated["abstract"] = pubmed_data["abstract"]
                if not updated.get("journal") and pubmed_data.get("journal"):
                    updated["journal"] = pubmed_data["journal"]
                if not updated.get("year") and pubmed_data.get("year"):
                    updated["year"] = pubmed_data["year"]
                logger.info(f"Filled abstract from PubMed for {paper.id}")
            else:
                # Last resort: try scraping publisher page (Nature, Science, Cell, etc.)
                logger.info(f"PubMed also empty for {paper.id}, trying publisher page")
                pub_abstract = await _fetch_abstract_from_publisher_page(doi, str(paper.id))
                if pub_abstract:
                    updated["abstract"] = pub_abstract
                    logger.info(f"Filled abstract from publisher page for {paper.id}")
    elif source == "manual_upload" or source == "crossref":
        # Try S2 title match for DOI
        if not doi and paper.title:
            from app.integrations.semantic_scholar import lookup_doi_by_title as s2_lookup
            new_doi = await s2_lookup(paper.title)
            if new_doi:
                paper.doi = new_doi
                doi = new_doi
        if doi:
            updated = await _refresh_openalex(doi, paper.title)
            if not updated:
                updated = await _refresh_pubmed(doi, paper.title)
            if updated and not updated.get("abstract"):
                pub_abstract = await _fetch_abstract_from_publisher_page(doi, str(paper.id))
                if pub_abstract and len(pub_abstract) > len(paper.abstract or ""):
                    updated["abstract"] = pub_abstract
        else:
            return None
    else:
        raise ValueError(f"Unknown source: {source}")

    if updated:
        if updated.get("title"):
            paper.title = _clean_html_tags(updated["title"])
        if updated.get("abstract"):
            # Don't overwrite a longer existing abstract with a shorter one
            new_abstract = _clean_html_tags(updated["abstract"])
            if not paper.abstract or len(new_abstract) >= len(paper.abstract):
                paper.abstract = new_abstract
        if updated.get("authors"):
            paper.authors = updated["authors"]
        if updated.get("journal"):
            paper.journal = updated["journal"]
        if updated.get("year"):
            paper.year = updated["year"]
        if updated.get("doi"):
            paper.doi = updated["doi"]

    return updated


@router.post("/papers/{paper_id}/refresh", response_model=PaperDetailResponse)
async def refresh_paper(
    paper_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-fetch a single paper's metadata from its original source."""
    paper = await get_paper_or_404(paper_id, db)

    try:
        updated = await _do_refresh(paper)
        if updated:
            await db.commit()
            await db.refresh(paper)
            logger.info(f"Refreshed paper {paper_id} ({paper.source})")
        else:
            logger.warning(f"No data found for paper {paper_id} ({paper.source})")

        return PaperDetailResponse.model_validate(paper)

    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Refresh paper {paper_id} failed: {e}")
        raise HTTPException(500, detail=f"Refresh failed: {e}")


@router.post("/projects/{project_id}/papers/refresh-all")
async def refresh_all_papers(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Refresh metadata for all papers in a project from their original sources."""
    result = await db.execute(
        select(Paper).where(Paper.project_id == project_id)
    )
    papers = result.scalars().all()

    if not papers:
        raise HTTPException(404, detail="No papers found in this project")

    refreshed = 0
    skipped = 0
    errors = 0

    for paper in papers:
        try:
            updated = await _do_refresh(paper)
            if updated:
                refreshed += 1
            else:
                skipped += 1
        except Exception as e:
            logger.error(f"Refresh paper {paper.id} failed: {e}")
            errors += 1

    if refreshed > 0:
        await db.commit()

    return {
        "total": len(papers),
        "refreshed": refreshed,
        "skipped": skipped,
        "errors": errors,
    }


@router.post("/projects/{project_id}/papers/import-by-doi", response_model=PaperResponse)
async def import_by_doi(
    project_id: UUID,
    input: str = Form(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import a paper by DOI or URL. Cascaded: Crossref -> OpenAlex -> PubMed -> Publisher page."""
    # Verify project exists and belongs to user
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, detail="Project not found")

    # Resolve metadata
    metadata = await resolve_paper_metadata(input)
    if not metadata or not metadata.get("title"):
        raise HTTPException(400, detail="Could not resolve paper metadata from the given DOI/URL. Please check and try again.")

    doi = extract_doi_from_input(input) or metadata.get("doi")

    # Check for duplicate
    if doi:
        dup_result = await db.execute(
            select(Paper).where(Paper.project_id == project_id, Paper.doi == doi)
        )
        if dup_result.scalar_one_or_none():
            raise HTTPException(409, detail="A paper with this DOI already exists in this project.")

    paper = Paper(
        project_id=project_id,
        title=metadata["title"],
        abstract=metadata.get("abstract", ""),
        doi=doi,
        authors=metadata.get("authors", []),
        journal=metadata.get("journal"),
        year=metadata.get("year"),
        source=metadata.get("source", "manual_upload"),
        url=f"https://doi.org/{doi}" if doi else None,
        status="metadata_only",
    )
    db.add(paper)
    await db.commit()
    await db.refresh(paper)

    return PaperResponse.model_validate(paper)


@router.post("/projects/{project_id}/papers/import-batch")
async def import_batch(
    project_id: UUID,
    inputs: str = Form(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import multiple papers by DOI/URL, one per line."""
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, detail="Project not found")

    lines = [l.strip() for l in inputs.split("\n") if l.strip()]
    if not lines:
        raise HTTPException(400, detail="No valid inputs provided")
    if len(lines) > 50:
        raise HTTPException(400, detail="Maximum 50 items per batch import")

    imported: list[dict] = []
    skipped: list[str] = []
    failed: list[str] = []

    for line in lines:
        try:
            metadata = await resolve_paper_metadata(line)
            if not metadata or not metadata.get("title"):
                failed.append(line)
                continue

            doi = extract_doi_from_input(line) or metadata.get("doi")
            if doi:
                dup = await db.execute(
                    select(Paper).where(Paper.project_id == project_id, Paper.doi == doi)
                )
                if dup.scalar_one_or_none():
                    skipped.append(metadata["title"][:80])
                    continue

            paper = Paper(
                project_id=project_id,
                title=metadata["title"],
                abstract=metadata.get("abstract", ""),
                doi=doi,
                authors=metadata.get("authors", []),
                journal=metadata.get("journal"),
                year=metadata.get("year"),
                source=metadata.get("source", "manual_upload"),
                url=f"https://doi.org/{doi}" if doi else None,
                status="metadata_only",
            )
            db.add(paper)
            imported.append({"title": metadata["title"][:100], "doi": doi})

        except Exception as e:
            logger.warning(f"Batch import failed for '{line[:60]}': {e}")
            failed.append(line[:80])

    if imported:
        await db.commit()

    return {
        "total": len(lines),
        "imported": len(imported),
        "skipped": len(skipped),
        "failed": len(failed),
        "imported_items": imported,
        "skipped_items": skipped,
        "failed_items": failed,
    }


@router.post("/projects/{project_id}/papers/upload", response_model=PaperResponse)
async def upload_pdf(
    project_id: UUID,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a PDF to create a paper. PDF is stored on local filesystem and parsed via GROBID."""
    # Verify project exists
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, detail="Project not found")

    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, detail="Only PDF files are accepted.")

    # Validate file size
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > settings.max_upload_size_mb:
        raise HTTPException(400, detail=f"File too large ({size_mb:.1f} MB). Maximum is {settings.max_upload_size_mb} MB.")

    # Save to local filesystem
    import os, pathlib
    upload_dir = pathlib.Path("data/pdfs") / str(project_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    storage_key = f"{uuid_mod.uuid4()}.pdf"
    local_path = upload_dir / storage_key

    try:
        local_path.write_bytes(content)
        logger.info(f"Saved PDF: {local_path}")
    except Exception as e:
        logger.error(f"Failed to save PDF: {e}")
        raise HTTPException(500, detail="Failed to store PDF file.")

    # Create paper record with placeholder title
    placeholder_title = file.filename[:-4] if file.filename.lower().endswith(".pdf") else file.filename

    paper = Paper(
        project_id=project_id,
        title=placeholder_title,
        source="manual_upload",
        pdf_storage_path=str(local_path),
        status="metadata_only",
    )
    db.add(paper)
    await db.commit()
    await db.refresh(paper)

    # Parse PDF with GROBID
    try:
        from app.integrations.grobid import parse_pdf_bytes_with_grobid, extract_tei_header

        tei_xml = await parse_pdf_bytes_with_grobid(content)
        if tei_xml:
            header = extract_tei_header(tei_xml)
            parsed_title = (header.get("title") or "").strip()
            if parsed_title and len(parsed_title) > 5:
                paper.title = parsed_title
            if header.get("abstract"):
                paper.abstract = header["abstract"]
            if header.get("authors"):
                paper.authors = header["authors"]
            if header.get("journal"):
                paper.journal = header["journal"]
            if header.get("year"):
                paper.year = header["year"]
            if header.get("doi"):
                paper.doi = header["doi"]

            # If GROBID failed to extract authors (common for Chinese PDFs), try LLM
            grobid_failed = not header.get("authors") or not header.get("journal")
            if grobid_failed:
                from app.integrations.pdf_text import extract_text_from_pdf_bytes, parse_metadata_with_llm
                raw_text = await extract_text_from_pdf_bytes(content)
                if raw_text:
                    llm_result = await parse_metadata_with_llm(raw_text)
                    if llm_result.get("title") and len(llm_result["title"]) > 3:
                        paper.title = llm_result["title"]
                    if llm_result.get("authors"):
                        paper.authors = llm_result["authors"]
                    if llm_result.get("journal"):
                        paper.journal = llm_result["journal"]
                    if llm_result.get("year"):
                        paper.year = llm_result["year"]
                    if llm_result.get("abstract") and not paper.abstract:
                        paper.abstract = llm_result["abstract"]
                    logger.info(f"LLM parsed paper {paper.id}: title={paper.title[:60]}")

            await db.commit()
            await db.refresh(paper)
            logger.info(f"GROBID parsed paper {paper.id}: title={paper.title[:60]}")
            if not paper.doi and paper.title:
                asyncio.create_task(_background_doi_lookup_s2(paper.id, paper.title))
        else:
            logger.warning(f"GROBID returned no TEI for paper {paper.id}")
    except Exception as e:
        logger.warning(f"GROBID parsing skipped for paper {paper.id}: {e}")

    return PaperResponse.model_validate(paper)


@router.post("/projects/{project_id}/papers/import-bibtex")
async def import_bibtex(
    project_id: UUID,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import papers from a BibTeX (.bib) or RIS (.ris) file."""
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, detail="Project not found")

    content = (await file.read()).decode("utf-8", errors="replace")
    if not content.strip():
        raise HTTPException(400, detail="Empty file")

    from app.integrations.bibtex_ris import guess_format, parse_bibtex, parse_ris

    fmt = guess_format(content)
    if fmt == "bibtex":
        entries = parse_bibtex(content)
    elif fmt == "ris":
        entries = parse_ris(content)
    else:
        raise HTTPException(400, detail="Unrecognized format. Please upload a .bib or .ris file.")

    if not entries:
        raise HTTPException(400, detail="No valid entries found in file")

    imported = 0
    skipped = 0
    for entry in entries[:100]:
        title = entry.get("title")
        doi = entry.get("doi")
        if not title:
            continue

        if doi:
            dup = await db.execute(
                select(Paper).where(Paper.project_id == project_id, Paper.doi == doi)
            )
            if dup.scalar_one_or_none():
                skipped += 1
                continue

        paper = Paper(
            project_id=project_id,
            title=title,
            abstract=entry.get("abstract", ""),
            doi=doi,
            authors=entry.get("authors", []),
            journal=entry.get("journal"),
            year=entry.get("year"),
            source="manual_upload",
            status="metadata_only",
        )
        db.add(paper)
        imported += 1

    if imported > 0:
        await db.commit()

    return {
        "format": fmt,
        "total_entries": len(entries),
        "imported": imported,
        "skipped": skipped,
    }


def _clean_html_tags(text: str) -> str:
    """Strip HTML entities and tags from text."""
    import html as _html
    import re as _re
    text = _html.unescape(text or "")
    text = _re.sub(r"<[^>]+>", "", text)
    return text.strip()


async def _lookup_doi_by_title(title: str, author: str | None = None, journal: str | None = None) -> str | None:
    """Search Crossref by title (+ optional author/journal) and return matching DOI."""
    if not title:
        return None
    try:
        import httpx
        query_parts = [title[:200]]
        if author:
            query_parts.append(author.split()[-1] if " " in author else author)
        if journal:
            query_parts.append(journal[:100])
        query = " ".join(query_parts)

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.crossref.org/works",
                params={"query.bibliographic": query, "rows": 10},
                headers={"User-Agent": f"LitMine/1.0 (mailto:{settings.crossref_email})"},
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
        items = data.get("message", {}).get("items", [])
        if not items:
            return None

        # Score candidates by title word overlap, with journal bonus
        best = None
        best_score = 0
        title_lower = _clean_html_tags(title).lower()
        title_words = set(title_lower.split())
        journal_lower = (journal or "").lower()
        for item in items:
            candidate_title = _clean_html_tags(
                " ".join(item.get("title", [])) if isinstance(item.get("title"), list) else item.get("title", "")
            ).lower()
            candidate_words = set(candidate_title.split())
            if not title_words:
                continue
            overlap = len(title_words & candidate_words) / len(title_words)
            # Bonus: if journal name partially matches
            if journal_lower:
                container = item.get("container-title", [])
                if container:
                    container_title = container[0].lower() if isinstance(container, list) else container.lower()
                    if journal_lower in container_title or container_title in journal_lower:
                        overlap += 0.1
            if overlap >= best_score and overlap >= 0.3:
                best_score = overlap
                best = item.get("DOI")

        if best and best_score >= 0.5:
            logger.info(f"DOI lookup: {best} (score={best_score:.2f})")
            return best
    except Exception as e:
        logger.debug(f"DOI lookup failed: {e}")
    return None


async def _lookup_doi_for_paper(paper: Paper, db: AsyncSession) -> None:
    """Try to find a DOI via Semantic Scholar title match."""
    from app.integrations.semantic_scholar import lookup_doi_by_title as s2_lookup
    doi = await s2_lookup(paper.title)
    if doi:
        paper.doi = doi
        logger.info(f"Found DOI for paper {paper.id}: {doi}")


async def _background_doi_lookup_s2(paper_id: UUID, title: str) -> None:
    """Run Semantic Scholar DOI lookup in background with its own DB session."""
    from app.core.database import engine as db_engine
    from sqlalchemy.ext.asyncio import AsyncSession as AsyncSessionCls
    from app.integrations.semantic_scholar import lookup_doi_by_title as s2_lookup
    try:
        doi = await s2_lookup(title)
        if doi:
            async with AsyncSessionCls(db_engine) as session:
                result = await session.execute(select(Paper).where(Paper.id == paper_id))
                paper = result.scalar_one_or_none()
                if paper and not paper.doi:
                    paper.doi = doi
                    await session.commit()
                    logger.info(f"Background S2 DOI: {doi} for paper {paper_id}")
    except Exception as e:
        logger.debug(f"Background S2 DOI failed for {paper_id}: {e}")


async def _refresh_arxiv(doi: str | None, title: str) -> dict | None:
    """Re-fetch from arXiv API by title search."""
    import httpx
    import feedparser

    # Try DOI first, then title
    query = f'doi:{doi}' if doi else title[:200]
    params = {
        "search_query": f"all:{query}",
        "start": 0,
        "max_results": 1,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get("https://export.arxiv.org/api/query", params=params)
        resp.raise_for_status()

    feed = feedparser.parse(resp.text)
    if not feed.entries:
        return None

    entry = feed.entries[0]
    authors = [a.name for a in entry.authors] if hasattr(entry, "authors") else []
    arxiv_doi = None
    for link in entry.links:
        if "doi.org" in link.get("href", ""):
            arxiv_doi = link["href"].split("doi.org/")[-1]
            break

    return {
        "title": entry.title.strip().replace("\n", " "),
        "abstract": entry.summary.strip().replace("\n", " "),
        "authors": authors,
        "journal": "arXiv preprint",
        "year": int(entry.published[:4]) if entry.published else None,
        "doi": arxiv_doi or doi,
    }


async def _refresh_pubmed(doi: str | None, title: str) -> dict | None:
    """Re-fetch from PubMed by DOI or title."""
    import httpx
    import xml.etree.ElementTree as ET

    if doi:
        query = f'{doi}[doi]'
    else:
        query = title[:200]

    async with httpx.AsyncClient(timeout=15.0) as client:
        # Search
        search_params = {
            "db": "pubmed", "term": query, "retmax": 1, "retmode": "json",
        }
        resp = await client.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi", params=search_params)
        resp.raise_for_status()
        pmids = resp.json().get("esearchresult", {}).get("idlist", [])
        if not pmids:
            return None

        # Fetch detail
        import time; time.sleep(0.34)  # rate limit
        fetch_params = {
            "db": "pubmed", "id": pmids[0], "retmode": "xml",
        }
        resp = await client.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi", params=fetch_params)
        resp.raise_for_status()

    root = ET.fromstring(resp.text)
    article = root.find(".//PubmedArticle")
    if article is None:
        return None

    citation = article.find(".//Article")
    if citation is None:
        return None

    title_el = citation.find(".//ArticleTitle")
    new_title = "".join(title_el.itertext()).strip() if title_el is not None else title

    abstract_parts = []
    for abs_el in citation.findall(".//AbstractText"):
        text = "".join(abs_el.itertext()).strip()
        if text:
            abstract_parts.append(text)
    new_abstract = " ".join(abstract_parts)

    authors = []
    for author_el in citation.findall(".//Author"):
        last = author_el.findtext("LastName", "")
        fore = author_el.findtext("ForeName", "")
        if last:
            authors.append(f"{last} {fore}".strip())

    journal_el = citation.find(".//Journal")
    journal = journal_el.findtext("ISOAbbreviation") if journal_el is not None else None
    year_el = journal_el.find(".//PubDate/Year") if journal_el is not None else None
    year = int(year_el.text) if year_el is not None and year_el.text else None

    new_doi = doi
    for eid in article.findall(".//ELocationID"):
        if eid.get("EIdType") == "doi":
            new_doi = eid.text

    return {
        "title": new_title, "abstract": new_abstract, "authors": authors,
        "journal": journal, "year": year, "doi": new_doi,
    }


async def _refresh_biorxiv(doi: str | None, title: str) -> dict | None:
    """Re-fetch from bioRxiv API by DOI."""
    import httpx

    if not doi:
        logger.warning("bioRxiv refresh requires DOI")
        return None

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"https://api.biorxiv.org/details/biorxiv/10.1101/{doi.split('10.1101/')[-1]}")
        resp.raise_for_status()
        data = resp.json()

    collection = data.get("collection", [])
    if not collection:
        return None

    item = collection[0]
    authors = item.get("authors", "").split(";")
    authors = [a.strip() for a in authors if a.strip()]
    item_doi = item.get("doi", "")

    return {
        "title": item.get("title", "").strip(),
        "abstract": item.get("abstract", "").strip(),
        "authors": authors,
        "journal": "bioRxiv preprint",
        "year": int(item.get("date", "")[:4]) or None,
        "doi": item_doi or doi,
    }


async def _refresh_openalex(doi: str | None, title: str) -> dict | None:
    """Re-fetch from OpenAlex by DOI."""
    import httpx

    if not doi:
        logger.warning("OpenAlex refresh requires DOI")
        return None

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"https://api.openalex.org/works/doi:{doi}")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        work = resp.json()

    # Authors
    authors_list = []
    for authorship in work.get("authorships", []):
        author = authorship.get("author", {})
        name = author.get("display_name", "")
        if name:
            authors_list.append(name)

    # Abstract
    abstract = ""
    abstract_inverted = work.get("abstract_inverted_index")
    if abstract_inverted and isinstance(abstract_inverted, dict):
        words = [(pos, word) for word, positions in abstract_inverted.items() for pos in positions]
        words.sort()
        abstract = " ".join(w for _, w in words)
    if not abstract:
        abstract = (work.get("abstract") or "").strip()

    # Journal
    primary_location = work.get("primary_location", {}) or {}
    source = primary_location.get("source", {}) or {}
    journal = source.get("display_name") or None

    return {
        "title": (work.get("title") or "").strip(),
        "abstract": abstract,
        "authors": authors_list,
        "journal": journal,
        "year": work.get("publication_year") or None,
        "doi": doi,
    }


async def _fetch_abstract_from_publisher_page(doi: str | None, paper_id: str = "") -> str | None:
    """Try to extract abstract from publisher page via meta tags or JSON-LD."""
    import re
    import httpx
    import json

    if not doi:
        return None

    url = f"https://doi.org/{doi}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (compatible; LitMine/1.0)"}, follow_redirects=True)
            if resp.status_code != 200:
                return None
            html = resp.text
    except Exception:
        return None

    def _extract_description(obj, depth=0):
        """Recurse into JSON-LD to find description text."""
        if depth > 5:
            return None
        if isinstance(obj, dict):
            desc = obj.get("description", "")
            if isinstance(desc, str) and len(desc) > 100:
                return desc
            for key in ("mainEntity", "itemListElement", "@graph", "result", "articleBody"):
                if key in obj:
                    result = _extract_description(obj[key], depth + 1)
                    if result:
                        return result
            # Also try the itemListElement list within mainEntity
            if "itemListElement" in obj:
                items = obj["itemListElement"]
                if isinstance(items, list):
                    for item in items:
                        result = _extract_description(item, depth + 1)
                        if result:
                            return result
        elif isinstance(obj, list):
            for item in obj:
                result = _extract_description(item, depth + 1)
                if result:
                    return result
        return None

    # Try JSON-LD first
    ld_match = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.DOTALL)
    if ld_match:
        try:
            data = json.loads(ld_match.group(1))
            desc = _extract_description(data)
            if desc:
                logger.info(f"Got abstract from JSON-LD for {paper_id}")
                return desc.strip()
        except Exception:
            pass

    # Fall back to meta tags (handle both quote styles)
    for meta_name in ["dc.description", "description", "citation_abstract", "abstract"]:
        for pattern in [
            rf'<meta\s+name="{meta_name}"\s+content="([^"]+)"',
            rf"<meta\s+name='{meta_name}'\s+content='([^']+)'",
            rf'<meta\s+content="([^"]+)"\s+name="{meta_name}"',
        ]:
            meta_match = re.search(pattern, html)
            if meta_match:
                text = meta_match.group(1)
                # Decode HTML entities
                text = text.replace("&#x27;", "'").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
                if len(text) > 100:
                    logger.info(f"Got abstract from meta {meta_name} for {paper_id}")
                    return text.strip()

    return None

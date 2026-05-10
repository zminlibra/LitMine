"""Paper crawling service - orchestrates search across all data sources."""
import asyncio
import time
import logging
from uuid import UUID

from app.integrations.arxiv import search_arxiv, ArxivPaper
from app.integrations.pubmed import search_pubmed, PubMedPaper
from app.integrations.biorxiv import search_biorxiv, BioRxivPaper
from app.integrations.openalex import search_openalex, OpenAlexPaper
from app.config import get_settings
from app.models import Paper, Project

logger = logging.getLogger(__name__)

# Simple token bucket rate limiter — prevents 429 from PubMed, CrossRef, etc.
_rate_limit_last: float = 0
_rate_limit_interval: float = 0.35  # ~3 req/s max across all sources


async def _throttle():
    """Wait if needed to respect the global rate limit."""
    global _rate_limit_last
    now = time.monotonic()
    wait = _rate_limit_last + _rate_limit_interval - now
    if wait > 0:
        await asyncio.sleep(wait)
    _rate_limit_last = time.monotonic()


def _add_papers(
    source_name: str, papers, all_papers: list[dict], seen_dois: set[str],
    seen_titles: set[str], project_id, max_per_source: int,
    get_doi, get_title, get_authors, get_year, get_journal, get_url, get_pdf_url,
):
    added = 0
    for p in papers:
        if added >= max_per_source:
            break
        doi = get_doi(p)
        title = get_title(p)

        # Check if this paper already exists (from a different source)
        title_norm = title.lower().strip()[:100]

        existing = None
        if doi and doi in seen_dois:
            existing = next((item for item in all_papers if item["doi"] == doi), None)
        elif title_norm in seen_titles:
            existing = next((item for item in all_papers if item["title"].lower().strip()[:100] == title_norm), None)

        # If an existing paper (e.g. from OpenAlex) has no abstract but this source
        # (e.g. PubMed) has one, fill it in rather than skipping
        if existing and not existing.get("abstract") and getattr(p, "abstract", ""):
            existing["abstract"] = getattr(p, "abstract", "")
            if not existing.get("journal") and get_journal(p):
                existing["journal"] = get_journal(p)
            if not existing.get("year") and get_year(p):
                existing["year"] = get_year(p)
            if not existing.get("authors") and get_authors(p):
                existing["authors"] = get_authors(p)
            logger.info(
                f"Filled missing abstract from {source_name} for paper "
                f"'{existing['title'][:80]}' (source stays {existing['source']})"
            )
            continue

        if existing:
            continue

        if doi:
            seen_dois.add(doi)
        seen_titles.add(title_norm)

        all_papers.append({
            "project_id": project_id,
            "title": title,
            "abstract": getattr(p, "abstract", ""),
            "doi": doi,
            "authors": get_authors(p),
            "journal": get_journal(p),
            "year": get_year(p),
            "source": source_name,
            "url": get_url(p),
            "pdf_url": get_pdf_url(p),
            "status": "metadata_only",
        })
        added += 1


async def crawl_project(project: Project) -> list[dict]:
    """Crawl all configured sources for a project. Returns list of paper dicts to insert."""
    keywords = project.keywords or []
    max_per_source = max(project.max_papers // len(project.sources or [1]), 10)
    sources = project.sources or ["arxiv", "pubmed", "biorxiv"]

    all_papers: list[dict] = []
    seen_dois: set[str] = set()
    seen_titles: set[str] = set()

    def make_add_fn():
        """Create an add_fn bound to the current state."""
        return lambda source_name, papers, get_doi, get_title, get_authors, get_year, get_journal, get_url, get_pdf_url: _add_papers(
            source_name, papers, all_papers, seen_dois, seen_titles, project.id, max_per_source,
            get_doi, get_title, get_authors, get_year, get_journal, get_url, get_pdf_url,
        )

    tasks = []
    if "arxiv" in sources:
        tasks.append(_crawl_arxiv(keywords, max_per_source, project, make_add_fn()))
    if "pubmed" in sources:
        tasks.append(_crawl_pubmed(keywords, max_per_source, project, make_add_fn()))
    if "biorxiv" in sources:
        tasks.append(_crawl_biorxiv(keywords, max_per_source, project, make_add_fn()))
    if "openalex" in sources:
        tasks.append(_crawl_openalex(keywords, max_per_source, project, make_add_fn()))

    await asyncio.gather(*tasks, return_exceptions=True)
    return all_papers


async def _crawl_arxiv(keywords, max_per_source, project, add_fn):
    await _throttle()
    try:
        papers = await search_arxiv(
            keywords=keywords,
            max_results=max_per_source,
            year_start=project.year_range_start,
            year_end=project.year_range_end,
        )
        add_fn("arxiv", papers,
               lambda p: p.doi,
               lambda p: p.title,
               lambda p: p.authors,
               lambda p: p.year,
               lambda p: p.journal,
               lambda p: p.url,
               lambda p: p.pdf_url)
    except Exception as e:
        logger.error(f"arXiv crawl failed: {e}")


async def _crawl_pubmed(keywords, max_per_source, project, add_fn):
    await _throttle()
    try:
        papers = await search_pubmed(
            keywords=keywords,
            max_results=max_per_source,
            year_start=project.year_range_start,
            year_end=project.year_range_end,
        )
        add_fn("pubmed", papers,
               lambda p: p.doi,
               lambda p: p.title,
               lambda p: p.authors,
               lambda p: p.year,
               lambda p: p.journal,
               lambda p: p.url,
               lambda p: f"https://pubmed.ncbi.nlm.nih.gov/{p.pmid}/")
    except Exception as e:
        logger.error(f"PubMed crawl failed: {e}")


async def _crawl_biorxiv(keywords, max_per_source, project, add_fn):
    await _throttle()
    try:
        papers = await search_biorxiv(
            keywords=keywords,
            max_results=max_per_source,
            year_start=project.year_range_start,
            year_end=project.year_range_end,
        )
        add_fn("biorxiv", papers,
               lambda p: p.doi,
               lambda p: p.title,
               lambda p: p.authors,
               lambda p: p.year,
               lambda p: p.journal,
               lambda p: p.url,
               lambda p: p.pdf_url)
    except Exception as e:
        logger.error(f"bioRxiv crawl failed: {e}")


async def _crawl_openalex(keywords, max_per_source, project, add_fn):
    await _throttle()
    try:
        settings = get_settings()
        api_key = getattr(settings, "openalex_api_key", "")
        papers = await search_openalex(
            keywords=keywords,
            max_results=max_per_source,
            year_start=project.year_range_start,
            year_end=project.year_range_end,
            api_key=api_key,
        )
        add_fn("openalex", papers,
               lambda p: p.doi,
               lambda p: p.title,
               lambda p: p.authors,
               lambda p: p.year,
               lambda p: p.journal,
               lambda p: p.url,
               lambda p: p.pdf_url)
    except Exception as e:
        logger.error(f"OpenAlex crawl failed: {e}")

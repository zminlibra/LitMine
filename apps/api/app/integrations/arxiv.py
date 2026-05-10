"""arXiv API client for paper crawling."""
import asyncio
import httpx
import feedparser
from dataclasses import dataclass


@dataclass
class ArxivPaper:
    title: str
    abstract: str
    authors: list[str]
    year: int
    url: str
    pdf_url: str
    doi: str | None
    arxiv_id: str
    journal: str | None = None


async def search_arxiv(
    keywords: list[str],
    max_results: int = 30,
    year_start: int | None = None,
    year_end: int | None = None,
) -> list[ArxivPaper]:
    """Search arXiv API for papers matching keywords."""
    # Multi-word keywords = AND between words, single-word = normal match
    # Use ti+abs field for better relevance (all: is too broad for single words)
    parts = []
    for kw in keywords:
        if " " in kw:
            words = kw.split()
            and_parts = " AND ".join(f"all:{w}" for w in words)
            parts.append(f"({and_parts})")  # (all:metabolic AND all:engineering)
        else:
            parts.append(f"abs:{kw}")  # search in abstract for better relevance
    query = " OR ".join(parts)
    if " AND " in query:
        query = f"({query})"
    base_url = "https://export.arxiv.org/api/query"

    params = {
        "search_query": f"all:{query}",
        "start": 0,
        "max_results": max_results,
        "sortBy": "relevance",
        "sortOrder": "descending",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        for attempt in range(3):
            resp = await client.get(base_url, params=params)
            if resp.status_code == 429:
                if attempt < 2:
                    await asyncio.sleep(3 * (attempt + 1))
                    continue
            resp.raise_for_status()
            break

    feed = feedparser.parse(resp.text)
    papers = []

    for entry in feed.entries:
        arxiv_id = entry.id.split("/abs/")[-1].rstrip("v0123456789")
        published_year = int(entry.published[:4]) if entry.published else 0

        if year_start and year_end:
            if published_year < year_start or published_year > year_end:
                continue

        authors = [a.name for a in entry.authors] if hasattr(entry, "authors") else []

        # Try to extract DOI from links
        doi = None
        for link in entry.links:
            if "doi.org" in link.get("href", ""):
                doi = link["href"].split("doi.org/")[-1]

        papers.append(ArxivPaper(
            title=entry.title.strip().replace("\n", " "),
            abstract=entry.summary.strip().replace("\n", " "),
            authors=authors,
            year=published_year,
            url=entry.id,
            pdf_url=entry.id.replace("/abs/", "/pdf/") if "/abs/" in entry.id else "",
            doi=doi,
            arxiv_id=arxiv_id,
            journal="arXiv preprint",
        ))

    return papers

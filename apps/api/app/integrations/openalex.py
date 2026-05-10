"""OpenAlex API client."""
import asyncio
import httpx
from dataclasses import dataclass


@dataclass
class OpenAlexPaper:
    title: str
    abstract: str
    authors: list[str]
    year: int
    doi: str | None
    journal: str | None
    url: str
    pdf_url: str | None
    cited_by_count: int


async def search_openalex(
    keywords: list[str],
    max_results: int = 30,
    year_start: int | None = None,
    year_end: int | None = None,
    api_key: str = "",
) -> list[OpenAlexPaper]:
    """Search OpenAlex for papers matching keywords."""
    base_url = "https://api.openalex.org/works"

    # Build filter: for phrase keywords use title.search (exact), for single words use
    # title_and_abstract.search. If we have phrases, only search title for best relevance.
    phrase_parts = []
    word_parts = []
    for kw in keywords:
        if " " in kw:
            phrase_parts.append(kw)
        else:
            word_parts.append(kw)

    filter_parts = []
    # Build a single search query using title.search for best phrase relevance
    all_keywords = phrase_parts + word_parts
    search_terms = []
    for kw in all_keywords:
        search_terms.append(kw.replace(" ", "+"))
    keyword_queries = "|".join(search_terms)
    filter_parts.append(f"title.search:{keyword_queries}")

    if year_start and year_end:
        filter_parts.append(f"publication_year:{year_start}-{year_end}")
    elif year_start:
        filter_parts.append(f"publication_year:{year_start}")
    elif year_end:
        filter_parts.append(f"publication_year:{year_end}")

    params = {
        "filter": ",".join(filter_parts),
        "per_page": min(max_results, 200),
        "sort": "cited_by_count:desc",
    }

    papers = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Retry up to 3 times with backoff on 429
        for attempt in range(3):
            resp = await client.get(base_url, params=params)
            if resp.status_code == 429:
                if attempt < 2:
                    await asyncio.sleep(2 * (attempt + 1))
                    continue
            resp.raise_for_status()
            break
        data = resp.json()

        for work in data.get("results", [])[:max_results]:
            # Title
            title = work.get("title", "Untitled")
            if not title:
                continue

            # Abstract - prefer inverted index, fall back to plain text
            abstract = ""
            abstract_inverted = work.get("abstract_inverted_index")
            if abstract_inverted and isinstance(abstract_inverted, dict):
                # Reconstruct abstract from inverted index
                words = [(pos, word) for word, positions in abstract_inverted.items()
                         for pos in positions]
                words.sort()
                abstract = " ".join(w for _, w in words)
            if not abstract:
                abstract = (work.get("abstract") or "").strip()

            # Authors - from authorship list
            authors_list = []
            for authorship in work.get("authorships", []):
                author = authorship.get("author", {})
                name = author.get("display_name", "")
                if name:
                    authors_list.append(name)

            # DOI
            doi = work.get("doi", "")
            if doi:
                doi = doi.lstrip("https://doi.org/")

            # Journal / venue
            primary_location = work.get("primary_location", {}) or {}
            source = primary_location.get("source", {}) or {}
            journal = source.get("display_name") or None

            # Year
            year = work.get("publication_year") or 0

            # URL
            work_url = work.get("id", "")

            # PDF URL - try open access
            oa_url = None
            oa_info = work.get("open_access", {}) or {}
            if oa_info.get("oa_url"):
                oa_url = oa_info["oa_url"]

            papers.append(OpenAlexPaper(
                title=title.strip(),
                abstract=abstract.strip(),
                authors=authors_list,
                year=year,
                doi=doi or None,
                journal=journal,
                url=work_url,
                pdf_url=oa_url,
                cited_by_count=work.get("cited_by_count", 0),
            ))

    return papers

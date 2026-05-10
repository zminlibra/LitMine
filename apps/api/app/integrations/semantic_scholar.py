"""Semantic Scholar API client for DOI lookup by title."""
import logging
import httpx

logger = logging.getLogger(__name__)


async def lookup_doi_by_title(title: str) -> str | None:
    """Search Semantic Scholar by exact title match and return DOI.

    S2's title match API is much more accurate than Crossref's general search.
    """
    if not title or len(title) < 10:
        return None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.semanticscholar.org/graph/v1/paper/search/match",
                params={"query": title[:300], "fields": "externalIds"},
                headers={"User-Agent": "LitMine/1.0"},
            )
            if resp.status_code == 404:
                return None
            if resp.status_code != 200:
                logger.debug(f"S2 returned {resp.status_code}")
                return None
            data = resp.json()

        papers = data.get("data", [])
        # data can be a list (search/match) or single object (paper lookup)
        if isinstance(papers, dict):
            papers = [papers]
        if papers and len(papers) > 0:
            external_ids = papers[0].get("externalIds", {})
            doi = external_ids.get("DOI")
            if doi:
                logger.info(f"S2 matched DOI: {doi}")
                return doi
    except Exception as e:
        logger.debug(f"S2 DOI lookup failed: {e}")

    return None

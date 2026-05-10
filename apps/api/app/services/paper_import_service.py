"""Cascaded paper metadata resolver: Crossref -> OpenAlex -> PubMed -> Publisher page."""
import re
import logging

from app.integrations.crossref import resolve_doi_via_crossref

logger = logging.getLogger(__name__)


def extract_doi_from_input(raw: str) -> str | None:
    """Extract a DOI from a user-provided string (DOI or URL)."""
    raw = raw.strip()

    # Full URL: https://doi.org/10.1038/...
    url_match = re.search(r"doi\.org/(10\.[^?#\s]+)", raw, re.IGNORECASE)
    if url_match:
        return url_match.group(1).rstrip(".")

    # Already a bare DOI: 10.xxx/...
    if raw.startswith("10."):
        return raw.split()[0].rstrip(".")

    return None


async def resolve_paper_metadata(raw_input: str) -> dict | None:
    """Resolve paper metadata from a DOI or URL via cascade.

    Returns dict with: title, abstract, authors, journal, year, doi, source
    Returns None if all sources fail.
    """
    doi = extract_doi_from_input(raw_input)
    if not doi:
        logger.warning(f"Could not extract DOI from: {raw_input}")
        return None

    # Step 1: Crossref (fastest, most complete metadata)
    data = await resolve_doi_via_crossref(doi)
    if data and data.get("title"):
        data["source"] = "crossref"
        logger.info(f"Resolved DOI {doi} via Crossref")
        # If abstract is empty, try fallbacks
        if not data.get("abstract"):
            await _fill_abstract(data, doi)
        return data

    # Step 2: OpenAlex (good for abstracts)
    from app.api.papers import _refresh_openalex
    data = await _refresh_openalex(doi, "")
    if data and data.get("title"):
        data["source"] = "openalex"
        logger.info(f"Resolved DOI {doi} via OpenAlex")
        if not data.get("abstract"):
            await _fill_abstract(data, doi)
        return data

    # Step 3: PubMed
    from app.api.papers import _refresh_pubmed
    data = await _refresh_pubmed(doi, "")
    if data and data.get("title"):
        data["source"] = "pubmed"
        logger.info(f"Resolved DOI {doi} via PubMed")
        return data

    return None


async def _fill_abstract(data: dict, doi: str) -> None:
    """Try to fill missing abstract from PubMed or publisher page."""
    from app.api.papers import _refresh_pubmed, _fetch_abstract_from_publisher_page

    # Try PubMed
    pubmed_data = await _refresh_pubmed(doi, data.get("title", ""))
    if pubmed_data and pubmed_data.get("abstract"):
        data["abstract"] = pubmed_data["abstract"]
        if not data.get("journal"):
            data["journal"] = pubmed_data.get("journal")
        if not data.get("year"):
            data["year"] = pubmed_data.get("year")
        return

    # Last resort: scrape publisher page
    pub_abstract = await _fetch_abstract_from_publisher_page(doi)
    if pub_abstract:
        data["abstract"] = pub_abstract

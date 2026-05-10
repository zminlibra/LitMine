"""Crossref API client for DOI metadata resolution."""
import logging
import httpx
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


async def resolve_doi_via_crossref(doi: str) -> dict | None:
    """Fetch paper metadata from Crossref by DOI.

    Returns dict with: title, abstract, authors, journal, year, doi
    Returns None if not found or error.
    """
    url = f"https://api.crossref.org/works/{doi}"
    headers = {"User-Agent": f"LitMine/1.0 (mailto:{settings.crossref_email})"}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 404:
                logger.info(f"Crossref: DOI {doi} not found")
                return None
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning(f"Crossref lookup failed for {doi}: {e}")
        return None

    message = data.get("message", {})
    if not message:
        return None

    # Title
    title_list = message.get("title", [])
    title = title_list[0] if title_list else None

    # Abstract (may be in different formats)
    abstract = message.get("abstract", "")
    if not abstract:
        # Try JATS abstract
        abstract = _extract_jats_abstract(message)

    # Authors
    authors = []
    for author in message.get("author", []):
        given = author.get("given", "")
        family = author.get("family", "")
        if given or family:
            authors.append(f"{family} {given}".strip())

    # Journal
    journal = None
    container_title = message.get("container-title", [])
    if container_title:
        journal = container_title[0]
    if not journal:
        # Try short title
        short_container = message.get("short-container-title", [])
        if short_container:
            journal = short_container[0]

    # Year
    year = None
    issued = message.get("issued", {})
    if issued:
        parts = issued.get("date-parts", [[]])
        if parts and parts[0]:
            year = parts[0][0]

    return {
        "title": title,
        "abstract": abstract.strip() if abstract else "",
        "authors": authors,
        "journal": journal,
        "year": year,
        "doi": doi,
    }


def _extract_jats_abstract(message: dict) -> str:
    """Extract abstract from JATS XML in Crossref response."""
    import re
    jats = message.get("abstract", "")
    if not isinstance(jats, str):
        return ""
    # Strip JATS markup tags
    parts = []
    jats_lower = jats.lower()
    if "<jats:p>" in jats_lower:
        for line in jats.split("\n"):
            stripped = line.strip()
            if stripped.lower().startswith("<jats:p>") and stripped.lower().endswith("</jats:p>"):
                inner = stripped[len("<jats:p>"):-len("</jats:p>")]
                # Remove other inline tags but keep text
                inner = re.sub(r"<[^>]+>", "", inner)
                parts.append(inner)
    if parts:
        return " ".join(parts)
    # Fallback: strip all XML tags
    return re.sub(r"<[^>]+>", "", jats).strip()

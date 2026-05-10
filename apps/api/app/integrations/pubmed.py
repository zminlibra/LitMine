"""PubMed E-Utils API client."""
import httpx
import time
from dataclasses import dataclass


@dataclass
class PubMedPaper:
    title: str
    abstract: str
    authors: list[str]
    year: int
    pmid: str
    doi: str | None
    journal: str | None
    url: str
    mesh_terms: list[str]


EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"


async def search_pubmed(
    keywords: list[str],
    max_results: int = 30,
    year_start: int | None = None,
    year_end: int | None = None,
) -> list[PubMedPaper]:
    """Search PubMed for papers matching keywords."""
    # Multi-word keywords = AND between words, single-word = normal match
    parts = []
    for kw in keywords:
        if " " in kw:
            words = kw.split()
            and_parts = " AND ".join(f'{w}[All Fields]' for w in words)
            parts.append(f"({and_parts})")  # (metabolic[All Fields] AND engineering[All Fields])
        else:
            parts.append(f'{kw}[All Fields]')
    query = " OR ".join(parts)

    if year_start and year_end:
        query += f" AND ({year_start}[PDAT]:{year_end}[PDAT])"

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 1: Search for PMIDs
        search_params = {
            "db": "pubmed",
            "term": query,
            "retmax": max_results,
            "retmode": "json",
            "sort": "relevance",
        }
        search_resp = await client.get(f"{EUTILS_BASE}/esearch.fcgi", params=search_params)
        search_resp.raise_for_status()
        search_data = search_resp.json()
        pmids = search_data.get("esearchresult", {}).get("idlist", [])

        if not pmids:
            return []

        # Respect rate limits
        time.sleep(0.34)

        # Step 2: Fetch details for PMIDs
        fetch_params = {
            "db": "pubmed",
            "id": ",".join(pmids),
            "retmode": "xml",
        }
        fetch_resp = await client.get(f"{EUTILS_BASE}/efetch.fcgi", params=fetch_params)
        fetch_resp.raise_for_status()

    # Parse XML response
    import xml.etree.ElementTree as ET
    root = ET.fromstring(fetch_resp.text)
    papers = []

    for article in root.findall(".//PubmedArticle"):
        citation = article.find(".//Article")

        # Title - use itertext() to avoid truncation at nested tags (e.g. <sup>, <i>)
        title_el = citation.find(".//ArticleTitle")
        if title_el is not None:
            title = "".join(title_el.itertext()).strip()
        else:
            title = "Untitled"

        # Abstract - use itertext() for the same reason
        abstract_parts = []
        for abs_el in citation.findall(".//AbstractText"):
            text = "".join(abs_el.itertext()).strip()
            if text:
                abstract_parts.append(text)
        abstract = " ".join(abstract_parts)

        # Authors
        authors = []
        for author_el in citation.findall(".//Author"):
            last = author_el.findtext("LastName", "")
            fore = author_el.findtext("ForeName", "")
            if last:
                authors.append(f"{last} {fore}".strip())

        # Journal / Year
        journal_el = citation.find(".//Journal")
        journal_title = journal_el.findtext("ISOAbbreviation") if journal_el is not None else None
        year_el = journal_el.find(".//PubDate/Year") if journal_el is not None else None
        year = int(year_el.text) if year_el is not None and year_el.text else 0

        # PMID
        pmid_el = citation.find(".//PMID")
        pmid = pmid_el.text if pmid_el is not None else ""

        # DOI
        doi = None
        for eid in article.findall(".//ELocationID"):
            if eid.get("EIdType") == "doi":
                doi = eid.text

        # MeSH terms
        mesh_terms = []
        for mesh in article.findall(".//MeshHeading/DescriptorName"):
            if mesh.text:
                mesh_terms.append(mesh.text)

        papers.append(PubMedPaper(
            title=title.strip().replace("\n", " "),
            abstract=abstract.strip().replace("\n", " "),
            authors=authors,
            year=year,
            pmid=pmid,
            doi=doi,
            journal=journal_title,
            url=f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
            mesh_terms=mesh_terms,
        ))

    return papers

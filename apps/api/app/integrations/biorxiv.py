"""bioRxiv API client."""
import httpx
from dataclasses import dataclass


@dataclass
class BioRxivPaper:
    title: str
    abstract: str
    authors: list[str]
    year: int
    doi: str
    url: str
    pdf_url: str
    journal: str = "bioRxiv preprint"


async def search_biorxiv(
    keywords: list[str],
    max_results: int = 30,
    year_start: int | None = None,
    year_end: int | None = None,
) -> list[BioRxivPaper]:
    """Search bioRxiv for papers matching keywords."""
    base_url = "https://api.biorxiv.org/details/biorxiv"

    # bioRxiv API searches by date range, not keywords directly
    # We fetch recent papers and filter by keyword ourselves
    date_range = f"{year_start or 2018}-01-01/{year_end or 2025}-12-31"

    papers = []
    cursor = 0
    max_pages = 20  # maximum pages to fetch (30 papers per page = 600 papers scanned)
    pages_fetched = 0

    async with httpx.AsyncClient(timeout=30.0) as client:
        while len(papers) < max_results and pages_fetched < max_pages:
            pages_fetched += 1
            resp = await client.get(f"{base_url}/{date_range}/{cursor}")
            resp.raise_for_status()
            data = resp.json()

            collection = data.get("collection", [])
            if not collection:
                break

            for item in collection:
                if len(papers) >= max_results:
                    break

                title = item.get("title", "")
                abstract = item.get("abstract", "")

                # Filter by keywords: multi-word = phrase match, single-word = substring match
                # At least one keyword must match for the paper to be included
                combined_text = f"{title} {abstract}".lower()
                found = False
                for kw in keywords:
                    if kw.lower() in combined_text:
                        found = True
                        break
                if not found:
                    continue
                    authors = item.get("authors", "").split(";")
                    authors = [a.strip() for a in authors if a.strip()]

                    doi = item.get("doi", "")
                    papers.append(BioRxivPaper(
                        title=title.strip(),
                        abstract=abstract.strip(),
                        authors=authors,
                        year=int(item.get("date", "2025")[:4]),
                        doi=doi,
                        url=f"https://www.biorxiv.org/content/{doi}" if doi else "",
                        pdf_url=f"https://www.biorxiv.org/content/{doi}.full.pdf" if doi else "",
                    ))

            cursor += len(collection)
            messages = data.get("messages", [])
            if any("no more results" in m.get("status", "").lower() for m in messages):
                break

    return papers

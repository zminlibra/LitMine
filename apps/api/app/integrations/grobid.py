"""GROBID client for PDF TEI XML extraction."""
import httpx
import logging

from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


async def parse_pdf_bytes_with_grobid(pdf_content: bytes) -> str | None:
    """Send PDF bytes directly to GROBID fulltext (no download step)."""
    grobid_url = settings.grobid_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{grobid_url}/api/processFulltextDocument",
                files={"input": ("paper.pdf", pdf_content, "application/pdf")},
                data={
                    "consolidateHeader": "1",
                    "consolidateCitations": "1",
                    "includeRawCitations": "1",
                    "includeRawAffiliations": "1",
                },
            )
            if resp.status_code == 200:
                return resp.text
            else:
                logger.warning(f"GROBID returned status {resp.status_code}")
                return None
    except Exception as e:
        logger.error(f"GROBID parsing failed: {e}")
        return None


async def parse_pdf_header_with_grobid(pdf_url: str) -> str | None:
    """Send PDF to GROBID header-only endpoint. Much faster than fulltext (1-5s vs 10-30s)."""
    grobid_url = settings.grobid_url.rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            pdf_resp = await client.get(pdf_url)
            if pdf_resp.status_code != 200:
                logger.warning(f"Failed to download PDF from {pdf_url}: {pdf_resp.status_code}")
                return None
            pdf_content = pdf_resp.content

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{grobid_url}/api/processHeaderDocument",
                files={"input": ("paper.pdf", pdf_content, "application/pdf")},
                data={"consolidateHeader": "1"},
            )
            if resp.status_code == 200:
                return resp.text
            else:
                logger.warning(f"GROBID header returned status {resp.status_code}")
                return None

    except Exception as e:
        logger.error(f"GROBID header parsing failed: {e}")
        return None


async def parse_pdf_with_grobid(pdf_url: str) -> str | None:
    """Send PDF to GROBID fulltext and get back TEI XML."""
    grobid_url = settings.grobid_url.rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            pdf_resp = await client.get(pdf_url)
            if pdf_resp.status_code != 200:
                logger.warning(f"Failed to download PDF from {pdf_url}: {pdf_resp.status_code}")
                return None
            pdf_content = pdf_resp.content

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{grobid_url}/api/processFulltextDocument",
                files={"input": ("paper.pdf", pdf_content, "application/pdf")},
                data={
                    "consolidateHeader": "1",
                    "consolidateCitations": "1",
                    "includeRawCitations": "1",
                    "includeRawAffiliations": "1",
                },
            )

            if resp.status_code == 200:
                return resp.text
            else:
                logger.warning(f"GROBID returned status {resp.status_code}")
                return None

    except Exception as e:
        logger.error(f"GROBID parsing failed: {e}")
        return None


def extract_tei_header(tei_xml: str) -> dict:
    """Extract title, authors, abstract from TEI XML header.

    Returns dict with keys: title, authors (list[str]), abstract
    """
    from lxml import etree

    try:
        root = etree.fromstring(tei_xml.encode("utf-8"))
    except Exception:
        return {"title": None, "authors": [], "abstract": ""}

    ns = {"tei": "http://www.tei-c.org/ns/1.0"}

    def get_text(xpath: str) -> str:
        parts = root.xpath(xpath, namespaces=ns)
        if parts:
            return " ".join(parts[0].itertext()).strip()
        return ""

    # Title
    title = get_text("//tei:titleStmt/tei:title[@level='a'][@type='main']")
    if not title:
        title = get_text("//tei:titleStmt/tei:title[@type='main']")
    if not title:
        title = get_text("//tei:titleStmt/tei:title")

    # Authors — GROBID may place them in <titleStmt> or <sourceDesc>/<biblStruct>/<analytic>
    authors = []
    seen = set()

    def extract_author_name(el):
        """Extract 'Surname Forename' from an <author> element."""
        forename = el.xpath("string(tei:persName/tei:forename[@type='first'])", namespaces=ns).strip()
        if not forename:
            forename = el.xpath("string(tei:persName/tei:forename)", namespaces=ns).strip()
        surname = el.xpath("string(tei:persName/tei:surname)", namespaces=ns).strip()
        if forename or surname:
            return f"{surname} {forename}".strip()
        # Fallback: get all text content
        return " ".join(el.itertext()).strip()

    # Only look in sourceDesc/biblStruct/analytic (not references)
    for author_el in root.xpath("//tei:sourceDesc//tei:analytic/tei:author", namespaces=ns):
        name = extract_author_name(author_el)
        if name and name not in seen:
            seen.add(name)
            authors.append(name)

    # Fallback: titleStmt/author
    if not authors:
        for author_el in root.xpath("//tei:titleStmt/tei:author", namespaces=ns):
            name = extract_author_name(author_el)
            if name and name not in seen:
                seen.add(name)
                authors.append(name)

    # Journal — from sourceDesc/monogr/title level="j"
    journal = get_text("//tei:sourceDesc//tei:monogr/tei:title[@level='j'][@type='main']")
    if not journal:
        journal = get_text("//tei:sourceDesc//tei:monogr/tei:title[@level='j']")

    # Year — from sourceDesc/monogr/imprint/date
    year = None
    date_el = root.xpath("//tei:sourceDesc//tei:monogr/tei:imprint/tei:date[@when]", namespaces=ns)
    if date_el:
        when = date_el[0].get("when", "")
        if when:
            try:
                year = int(when[:4])
            except ValueError:
                pass

    # DOI — from sourceDesc/biblStruct/idno type=DOI
    doi = None
    doi_els = root.xpath("//tei:sourceDesc//tei:idno[@type='DOI']", namespaces=ns)
    if doi_els:
        doi = doi_els[0].text.strip() if doi_els[0].text else None

    # Abstract — from header, fall back to body first section
    abstract = get_text("//tei:profileDesc/tei:abstract")
    if not abstract:
        abstract = get_text("//tei:abstract")

    # If header abstract is too short (< 200 chars), try body's first real paragraph
    if not abstract or len(abstract) < 200:
        body_divs = root.xpath("//tei:text/tei:body//tei:div[tei:head and tei:p]", namespaces=ns)
        for div in body_divs:
            head = " ".join(div.xpath("tei:head", namespaces=ns)[0].itertext()) if div.xpath("tei:head", namespaces=ns) else ""
            # Skip resource / peer-review / supplement sections
            if any(kw in head.lower() for kw in ("resource", "peer review", "supplement", "acknowledg", "reference", "data availab", "code availab", "methods", "author contrib")):
                continue
            paragraphs = div.xpath("tei:p", namespaces=ns)
            # Only take the first paragraph (usually the abstract) if it's substantial
            if paragraphs:
                first_p = " ".join(paragraphs[0].itertext()).strip()
                if len(first_p) > len(abstract or ""):
                    abstract = first_p
                    break

    def _clean(text: str | None) -> str | None:
        """Decode HTML entities and strip XML/HTML tags."""
        if not text:
            return text
        import html
        text = html.unescape(text)
        # Strip remaining XML/HTML tags like <i>, </i>, <b>, etc.
        import re
        text = re.sub(r'<[^>]+>', '', text)
        return text.strip()

    return {
        "title": _clean(title),
        "authors": [_clean(a) for a in authors],
        "journal": _clean(journal),
        "year": year,
        "doi": doi,
        "abstract": _clean(abstract),
    }


def extract_sections_from_tei(tei_xml: str) -> dict[str, str]:
    """Extract abstract, introduction, methods, results, discussion from TEI XML."""
    from lxml import etree

    try:
        root = etree.fromstring(tei_xml.encode("utf-8"))
    except Exception:
        return {"abstract": "", "introduction": "", "methods": "", "results": "", "discussion": ""}

    ns = {"tei": "http://www.tei-c.org/ns/1.0"}

    def get_text(element, xpath: str) -> str:
        parts = element.xpath(xpath, namespaces=ns)
        if parts:
            return " ".join(parts[0].itertext()).strip()
        return ""

    sections = {
        "abstract": get_text(root, "//tei:profileDesc/tei:abstract"),
        "introduction": "",
        "methods": "",
        "results": "",
        "discussion": "",
    }

    # Extract body sections by heading matching
    for div in root.xpath("//tei:text/tei:body/tei:div", namespaces=ns):
        head = get_text(div, "tei:head").lower()
        text = " ".join(div.itertext()).strip()

        if "introduction" in head or "intro" in head:
            sections["introduction"] += text + "\n"
        elif "method" in head or "material" in head or "experimental" in head:
            sections["methods"] += text + "\n"
        elif "result" in head or "finding" in head:
            sections["results"] += text + "\n"
        elif "discussion" in head or "conclusion" in head or "discuss" in head:
            sections["discussion"] += text + "\n"

    return sections

"""Parse BibTeX (.bib) and RIS (.ris) files into paper metadata dicts."""
import re
import logging

logger = logging.getLogger(__name__)


def parse_bibtex(content: str) -> list[dict]:
    """Parse BibTeX content into list of paper metadata dicts.

    Returns list of dicts with: title, authors, journal, year, doi, abstract
    """
    entries = []
    # Split into entries by @...{... pattern
    entry_pattern = re.compile(r'@\w+\s*\{\s*([^,]+)\s*,\s*(.*?)\}\s*$', re.DOTALL | re.MULTILINE)
    matches = entry_pattern.findall(content)

    if not matches:
        # Try simpler pattern
        parts = re.split(r'@\w+\{', content)
        for part in parts:
            if not part.strip():
                continue
            entries.append(_parse_bibtex_entry(part))
    else:
        for citekey, fields_str in matches:
            entry = _parse_bibtex_entry(f"{citekey},\n{fields_str}")
            entries.append(entry)

    return [e for e in entries if e.get("title")]


def _parse_bibtex_entry(raw: str) -> dict:
    """Parse a single BibTeX entry fields."""
    result: dict = {"title": None, "authors": [], "journal": None, "year": None, "doi": None, "abstract": ""}

    # Find key-value pairs: field = {value} or field = "value"
    field_pattern = re.compile(
        r'(\w+)\s*=\s*[\{"]\s*((?:[^{}"\n]|\{[^{}]*\})*)\s*[\}"]',
        re.MULTILINE,
    )
    fields = field_pattern.findall(raw)

    for field_name, value in fields:
        value = value.strip()
        field_name = field_name.lower()

        if field_name == "title":
            result["title"] = value.replace("{", "").replace("}", "")
        elif field_name in ("author", "authors"):
            authors = re.split(r'\s+and\s+', value)
            result["authors"] = [a.strip().replace("{", "").replace("}", "") for a in authors if a.strip()]
        elif field_name == "journal":
            result["journal"] = value.replace("{", "").replace("}", "")
        elif field_name == "year":
            try:
                result["year"] = int(value)
            except ValueError:
                pass
        elif field_name == "doi":
            result["doi"] = value
        elif field_name == "abstract":
            result["abstract"] = value

    return result


def parse_ris(content: str) -> list[dict]:
    """Parse RIS content into list of paper metadata dicts.

    Returns list of dicts with: title, authors, journal, year, doi, abstract
    """
    entries = []
    current: dict | None = None

    for line in content.split("\n"):
        line = line.strip()
        if not line:
            continue

        if line.upper().startswith("TY  -"):
            if current:
                entries.append(current)
            current = {"title": None, "authors": [], "journal": None, "year": None, "doi": None, "abstract": ""}
            continue

        if current is None:
            continue

        match = re.match(r'^([A-Z0-9]{2})\s+-\s+(.*)', line)
        if not match:
            continue

        tag = match.group(1).upper()
        value = match.group(2).strip()

        if tag == "TI":
            current["title"] = current["title"] or value
        elif tag == "T1":
            current["title"] = current["title"] or value
        elif tag in ("AU", "A1"):
            current["authors"].append(value)
        elif tag == "JO":
            current["journal"] = current["journal"] or value
        elif tag == "JF":
            current["journal"] = current["journal"] or value
        elif tag == "JA":
            current["journal"] = current["journal"] or value
        elif tag == "PY":
            try:
                current["year"] = int(value)
            except ValueError:
                pass
        elif tag == "Y1" and current["year"] is None:
            try:
                current["year"] = int(value[:4])
            except ValueError:
                pass
        elif tag == "DO":
            current["doi"] = current["doi"] or value
        elif tag in ("AB", "N2"):
            current["abstract"] = (current["abstract"] or "") + " " + value
            current["abstract"] = current["abstract"].strip()

    if current:
        entries.append(current)

    return [e for e in entries if e.get("title")]


def guess_format(content: str) -> str | None:
    """Guess whether content is BibTeX or RIS format."""
    first_line = content.strip().split("\n")[0].strip()
    if first_line.upper().startswith("TY  -"):
        return "ris"
    if first_line.startswith("@"):
        return "bibtex"
    return None

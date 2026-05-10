"""Scientific text normalization utilities."""


def normalize_organism_name(name: str) -> str:
    """Normalize organism names to canonical form.
    Maps common abbreviations like 'E. coli' to 'Escherichia coli'.
    """
    abbreviations = {
        "e. coli": "Escherichia coli",
        "e.coli": "Escherichia coli",
        "s. cerevisiae": "Saccharomyces cerevisiae",
        "s.cerevisiae": "Saccharomyces cerevisiae",
        "b. subtilis": "Bacillus subtilis",
        "p. aeruginosa": "Pseudomonas aeruginosa",
        "c. elegans": "Caenorhabditis elegans",
        "d. melanogaster": "Drosophila melanogaster",
        "m. musculus": "Mus musculus",
        "h. sapiens": "Homo sapiens",
    }
    name_lower = name.lower().strip()
    return abbreviations.get(name_lower, name.strip())


def normalize_doi(doi: str) -> str:
    """Normalize DOI to lowercase, stripped."""
    if not doi:
        return ""
    return doi.strip().lower().rstrip(".").replace("https://doi.org/", "")

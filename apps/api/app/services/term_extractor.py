"""Dynamic term extraction from paper titles/abstracts using TF-IDF + seed word list.

Strategy:
- First 10 papers: seed word list provides baseline coverage
- 10+ papers: transition to TF-IDF extracted terms, blended with seed list
"""
import re
import math
from collections import Counter
import logging

logger = logging.getLogger(__name__)

# Minimal seed word list — only cross-disciplinary generic terms.
# Domain-specific terms come entirely from TF-IDF on the user's paper corpus.
# This ensures the platform works for ANY research field, not just molecular biology.
#
# If you need to bias term extraction toward a specific domain (e.g. for a field-specific
# deployment), add words to DOMAIN_BIAS_WORDS below. They are merged into SEED_TERMS
# at extraction time. Leave empty for fully dynamic, domain-agnostic extraction.
DOMAIN_BIAS_WORDS: set[str] = set()

SEED_TERMS: set[str] = {
    # Universal research methods / approaches
    "machine learning", "deep learning", "neural network",
    "simulation", "modeling", "computational",
    "high-throughput", "screening",
    "optimization", "characterization",
    "in vitro", "in vivo", "clinical trial",
    # Universal analysis terms
    "mechanism", "pathway", "regulation",
    "synthesis", "degradation", "biosynthesis",
    "expression", "purification",
    # Cross-domain applications
    "sustainability", "renewable", "green chemistry",
}

# Words to exclude from TF-IDF (too common to be meaningful)
STOP_WORDS: set[str] = {
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "can", "shall", "this",
    "that", "these", "those", "it", "its", "we", "they", "them", "their",
    "our", "your", "his", "her", "its", "which", "who", "whom", "what",
    "when", "where", "how", "all", "each", "every", "both", "few", "more",
    "most", "other", "some", "such", "no", "not", "only", "own", "same",
    "so", "than", "too", "very", "also", "if", "then", "else", "into",
    "up", "out", "about", "over", "under", "after", "before", "between",
    "through", "during", "using", "based", "used", "however", "thus",
    "therefore", "found", "show", "shown", "study", "results", "data",
    "analysis", "approach", "method", "methods", "new", "novel",
    "different", "important", "major", "key", "role", "well", "yet",
    "one", "two", "first", "many", "several", "high", "low", "large",
    "small", "recent", "years", "within", "among", "due", "via",
    "provide", "identify", "identified", "potential",
    "including", "present", "demonstrate", "demonstrated", "reveal",
    "revealed", "development", "production", "understanding",
    "characterization", "application", "effect", "effects",
    "significantly", "significance", "various", "specific",
    "particularly", "especially", "associated", "involved",
    "whether", "addition", "widely", "available",
    # Academic stop words — frequent in papers but not domain-specific
    "review", "reviews", "reviewed", "reviewing",
    "caused", "causes", "causing", "cause",
    "led", "lead", "leads", "leading",
    "made", "makes", "making",
    "done", "does", "did", "doing",
    "give", "gives", "given", "giving",
    "take", "takes", "taken", "taking",
    "see", "sees", "seen", "seeing",
    "know", "known", "knowing",
    "think", "thinking", "thought",
    "come", "comes", "came", "coming",
    "go", "goes", "going", "went", "gone",
    "get", "gets", "getting",
    "put", "puts", "putting",
    "set", "sets", "setting",
    "call", "calls", "called", "calling",
    "find", "finds", "finding",
    "look", "looks", "looking", "looked",
    "work", "works", "worked", "working",
    "play", "plays", "played", "playing",
    "factor", "factors", "role", "roles",
    "current", "future", "recent", "previous", "early", "later",
    "challenge", "challenges", "issue", "issues",
    "impact", "impacts", "influence", "influences",
    "level", "levels", "type", "types", "form", "forms",
    "aspect", "aspects", "feature", "features",
    "change", "changes", "increase", "decrease",
    "improve", "improved", "improvement", "enhance", "enhanced",
    "compare", "compared", "comparison",
    "related", "relation", "relationship",
    "significant", "significantly", "critical",
    "essential", "necessary", "required",
    "main", "primary", "secondary", "total",
    "lack", "needs", "need", "needed",
    "case", "cases", "context", "contexts",
    "field", "fields", "area", "areas",
    "focus", "focused", "focusing",
    "aim", "aims", "aimed", "target", "targets",
    "way", "ways", "means", "manner",
    "part", "parts", "component", "components",
    "stage", "stages", "step", "steps", "phase", "phases",
    "number", "numbers", "rate", "rates",
    "report", "reports", "reported",
    "describe", "described", "discuss", "discussed",
    "examine", "examined", "investigate", "investigated",
    "explore", "explored", "evaluate", "evaluated",
    "assess", "assessed", "determine", "determined",
    "possible", "possibly", "likely",
    "general", "generally", "overall",
    "similar", "despite", "limited",
    "detail", "details", "et al",
    "severe", "disease", "diseases", "patient", "patients",
    "remain", "remains", "unclear", "unknown",
    "together", "conclusion", "conclusions",
    "indicate", "indicated", "indicates",
    "suggest", "suggested", "suggests", "suggesting",
    "seems", "appears", "appear",
    "considered", "considered",
    # JATS/XML metadata — not research terms
    "jats", "xmlns", "xlink", "xref", "pubid",
    "pmid", "doi", "pubmed", "arxiv",
    # Paper section headers — too generic
    "introduction", "background", "methods", "results",
    "discussion", "conclusion", "conclusions",
    "supplementary", "supplemental", "acknowledgements",
    # Metadata / UI noise
    "title", "abstract", "keyword", "keywords",
    "figure", "table", "fig", "suppl",
    "author", "authors", "affiliation",
    "copyright", "license", "permission",
    "competing", "interests", "availability",
    "correspondence", "contributions",
    # Generic research framing words
    "topic", "topics", "theme", "themes",
    "gap", "gaps", "overview",
    # Abstract framing noise — common in academic writing
    "article", "articles", "here",
    "provides", "provide", "providing",
    "drive", "drives", "driven",
    "class", "classes",
}


def _tokenize(text: str) -> list[str]:
    """Extract meaningful single-word and bigram terms from text."""
    text = text.lower()
    # Remove non-alpha characters but keep spaces and hyphens
    text = re.sub(r"[^a-z\s\-]", " ", text)
    tokens = text.split()
    # Filter stop words and short tokens
    tokens = [t for t in tokens if t not in STOP_WORDS and len(t) > 2]

    # Generate bigrams
    bigrams = [f"{tokens[i]} {tokens[i+1]}" for i in range(len(tokens) - 1)]

    return tokens + bigrams


def extract_terms(papers: list[dict], max_terms: int = 30) -> list[str]:
    """Extract top terms from paper titles and abstracts using TF-IDF.

    Args:
        papers: list of dicts with 'title' and 'abstract' keys
        max_terms: maximum number of terms to return

    Returns:
        list of top terms sorted by TF-IDF score
    """
    if not papers:
        return sorted(SEED_TERMS)[:30]

    # Build corpus
    docs: list[str] = []
    for p in papers:
        text = f"{p.get('title', '') or ''} {(p.get('abstract', '') or '')[:500]}"
        docs.append(text)

    # Tokenize each document
    doc_tokens: list[list[str]] = [_tokenize(doc) for doc in docs]
    n_docs = len(docs)

    # Compute document frequency
    df: dict[str, int] = Counter()
    for tokens in doc_tokens:
        unique = set(tokens)
        for term in unique:
            df[term] += 1

    # Compute TF-IDF for each term
    tfidf_scores: dict[str, float] = {}
    for tokens in doc_tokens:
        tf = Counter(tokens)
        for term, count in tf.items():
            if df[term] < 2:  # Must appear in at least 2 papers
                continue
            if df[term] > n_docs * 0.8:  # Skip terms appearing in >80% of papers (too generic)
                continue
            idf = math.log((n_docs + 1) / (df[term] + 1)) + 1
            tfidf_scores[term] = tfidf_scores.get(term, 0) + count * idf

    # Sort by score
    sorted_terms = sorted(tfidf_scores.items(), key=lambda x: x[1], reverse=True)

    # --- Alias merging: prefer bigrams over their component unigrams ---
    # Build a lookup of all bigrams and their scores
    bigram_lookup: dict[str, float] = {}
    for term, score in sorted_terms:
        if " " in term:  # is a bigram
            bigram_lookup[term] = score

    # Filter: remove unigrams that are dominated by a containing bigram
    merged: list[tuple[str, float]] = []
    for term, score in sorted_terms:
        if " " not in term:  # is a unigram
            # Check if this unigram is the first word of any bigram in the lookup
            dominated = False
            for bigram, bigram_score in bigram_lookup.items():
                parts = bigram.split()
                if term == parts[0] or term == parts[-1]:
                    # If the bigram score is at least 60% of the unigram score,
                    # the unigram is likely a fragment of the more specific bigram
                    if bigram_score >= score * 0.6:
                        dominated = True
                        break
            if not dominated:
                merged.append((term, score))
        else:
            merged.append((term, score))

    sorted_terms = merged

    # Take top terms from TF-IDF, proportionally to max_terms
    n_tfidf = min(len(sorted_terms), int(max_terms * 0.8)) if n_docs >= 10 else int(max_terms * 0.3)
    extracted = [t for t, _ in sorted_terms[:n_tfidf]]

    # Blend with seed terms if there's room (includes DOMAIN_BIAS_WORDS)
    effective_seed = SEED_TERMS | DOMAIN_BIAS_WORDS
    if len(extracted) < max_terms:
        seed_sample = [s for s in sorted(effective_seed) if s.lower() not in {e.lower() for e in extracted}]
        extracted.extend(seed_sample[:max_terms - len(extracted)])

    return extracted[:max_terms]

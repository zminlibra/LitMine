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

# Broad seed word list — covers multiple disciplines, provides initial coverage
# when there aren't enough papers for meaningful TF-IDF
SEED_TERMS: set[str] = {
    # Molecular biology
    "CRISPR", "Cas9", "Cas12", "Cas13", "genome editing", "gene editing",
    "base editing", "prime editing", "knockout", "knockdown", "overexpression",
    "heterologous expression", "promoter", "plasmid", "vector",
    # Omics
    "transcriptomics", "proteomics", "metabolomics", "genomics",
    "RNA-seq", "single-cell", "multi-omics",
    # Metabolic & synthetic biology
    "metabolic engineering", "synthetic biology", "pathway engineering",
    "strain engineering", "directed evolution", "rational design",
    "high-throughput", "flux balance", "metabolic flux",
    # Common model organisms
    "E. coli", "yeast", "Saccharomyces", "Bacillus", "Streptomyces",
    "mammalian", "Arabidopsis", "zebrafish", "Drosophila",
    # Methods
    "machine learning", "deep learning", "neural network",
    "fermentation", "bioreactor", "fed-batch",
    # Applications
    "antibiotic", "resistance", "biofilm", "quorum sensing",
    "natural product", "secondary metabolite", "biosynthesis",
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


def extract_terms(papers: list[dict]) -> list[str]:
    """Extract top terms from paper titles and abstracts using TF-IDF.

    Args:
        papers: list of dicts with 'title' and 'abstract' keys

    Returns:
        list of top ~30 terms sorted by TF-IDF score
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

    # Take top 25 terms from TF-IDF
    extracted = [t for t, _ in sorted_terms[:25]]

    # Blend with seed terms: if we have enough papers (>10), prioritize TF-IDF
    if n_docs >= 10:
        # 80% TF-IDF, 20% seed
        result = extracted[:24]  # top 24 from TF-IDF
        seed_sample = [s for s in SEED_TERMS if s.lower() not in {e.lower() for e in extracted}]
        result.extend(seed_sample[:6])
    else:
        # < 10 papers: 30% TF-IDF, 70% seed
        result = extracted[:9]
        result.extend(sorted(SEED_TERMS)[:21])

    return result[:30]

"""LLM integration via DeepSeek/OpenAI-compatible API for entity extraction and report generation."""
import json
import logging
import httpx
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


EXTRACTION_PROMPT = """You are a scientific literature extraction system for synthetic biology / microbiology.

Extract the following entities from the paper below. Output as a JSON object.

Instructions:
- Only extract entities explicitly mentioned in the text. Do not infer.
- For each entity, provide a confidence score (0.0-1.0).
- For methods: categorize as "experimental", "computational", or "statistical".
- For organisms: include strain identifiers if mentioned.
- For genes/proteins: use standard nomenclature (gene: lowercase italic, protein: Title case).

{
  "concepts": [
    {"name": "CRISPR interference", "domain": "gene regulation", "is_novel_in_paper": false, "confidence": 0.95}
  ],
  "methods": [
    {"name": "CRISPR-Cas9 genome editing", "category": "experimental", "is_core_method": true, "confidence": 0.98}
  ],
  "organisms": [
    {"name": "Escherichia coli", "strain": "MG1655", "role": "primary_model", "confidence": 0.99}
  ],
  "genes": [
    {"symbol": "cas9", "full_name": "CRISPR-associated protein 9", "organism": "Streptococcus pyogenes", "manipulation": "heterologous_expression", "confidence": 0.97}
  ],
  "proteins": [
    {"name": "Cas9 endonuclease", "uniprot_id": null, "function": "DNA cleavage", "confidence": 0.97}
  ],
  "datasets": [
    {"name": "GSE12345", "data_type": "RNA-seq", "accession": "GSE12345", "confidence": 0.90}
  ]
}

Paper title: {title}
Abstract: {abstract}
"""


REPORT_PROMPT = """You are an expert scientific literature reviewer in synthetic biology and microbiology.

Write a structured literature review based on the papers below. Use clean Markdown with plenty of visual structure. The review must have {num_sections} sections:

## 1. Research Overview & Landscape
Summarize the current state — key questions, major players, recent trends. Keep this section concise (3-5 bullet points using -).
Then include a **summary table**:

| Theme | Key Papers | Status |
|-------|-----------|--------|
| ... | [1],[2] | active / emerging / mature |

## 2. Key Concepts & Relationships
Explain the most important concepts and how they interconnect.
- Use bullet points for concept descriptions (1-2 sentences each).
- Include a **concept relationship diagram** as a simple ASCII-style flowchart or a 2-column table showing Concept → Related To.
- Use inline citations [N] throughout.

## 3. Methodology Summary & Comparison
Describe key experimental and computational methods found across the papers. Use this format:
- A **comparison table**:

| Method | Papers | Advantages | Limitations |
|--------|--------|------------|-------------|
| ... | [N] | ... | ... |

- Follow with 2-3 bullet points highlighting notable methodological trends or innovations.

## 4. Key Contributors & Research Gaps
- Bullet list of the most active authors/labs and their focus areas (cite paper numbers).
- Bullet list of underexplored gaps — be specific about what is missing.
- End with a **"Recommended Next Steps"** table:

| Priority | Research Direction | Rationale | Based on |
|----------|-------------------|-----------|----------|
| High / Medium | ... | ... | [N] |

## 5. Integrated Literature Review (Introduction-Style)
Write a polished, narrative literature review section suitable for the introduction of a research paper or grant proposal. This should synthesize the findings across ALL sections above into a flowing academic narrative. Follow these rules:
- Write 3-4 coherent paragraphs in proper academic English.
- Start broad (the field's importance), narrow down to specific gaps, then end with a clear research opportunity.
- Integrate citations naturally in the text using [N] format — NOT as a separate reference list.
- Use transitional phrases between paragraphs. Avoid bullet points — this section is prose only.
- After the narrative paragraphs, append a **"References"** section listing each cited paper as:
  `[N] Author et al. (Year). Title. *Journal*.`

## Writing Rules
- Every claim MUST cite at least one paper with [N].
- Use bullet points aggressively in sections 1-4 — avoid paragraphs longer than 3 sentences.
- Tables are REQUIRED in sections 1, 3, and 4.
- Section 5 MUST be flowing prose (no bullet points or tables).
- Keep sections 1-4 total under 4000 words. Section 5 should be 600-900 words — a thorough narrative suitable for a real paper introduction.
- Use proper scientific writing style.

Focus areas (if specified): {focus_areas}

Papers to review:
{papers_text}"""


async def _call_llm(messages: list[dict], temperature: float = 0.1, max_tokens: int = 2000) -> str:
    """Call DeepSeek/OpenAI-compatible chat API."""
    url = f"{settings.llm_api_base}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": settings.llm_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def extract_entities(title: str, abstract: str, model: str | None = None) -> dict:
    """Extract scientific entities from paper title and abstract using LLM."""
    prompt = EXTRACTION_PROMPT.replace("{title}", title).replace("{abstract}", abstract[:8000])

    try:
        content = await _call_llm(
            messages=[
                {"role": "system", "content": "You are a precise scientific literature extraction system. Output strictly valid JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=2000,
        )
        return json.loads(content) if content else {}
    except Exception as e:
        logger.error(f"Entity extraction failed: {e}")
        return {}


async def generate_literature_review(
    papers: list[dict],
    focus_areas: list[str] = [],
    num_sections: int = 4,
    max_papers: int = 20,
    model: str | None = None,
) -> str:
    """Generate a structured literature review from a list of papers."""
    # Format papers for the prompt
    papers_text = "\n\n---\n\n".join(
        f"[{i+1}] **{p['title']}** ({p.get('year', 'n/a')}) - {', '.join(p.get('authors', [])[:3])}\n"
        f"{p.get('abstract', 'No abstract available.'[:1000])}"
        for i, p in enumerate(papers[:max_papers])
    )

    focus_str = ", ".join(focus_areas) if focus_areas else "General literature review"
    prompt = (REPORT_PROMPT
        .replace("{num_sections}", str(num_sections))
        .replace("{focus_areas}", focus_str)
        .replace("{papers_text}", papers_text[:80000]))

    try:
        content = await _call_llm(
            messages=[
                {"role": "system", "content": "You are an expert scientific literature reviewer. Write in clear, academic English with proper Markdown formatting."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=16000,
        )
        return content or "Report generation failed."
    except Exception as e:
        logger.error(f"Report generation failed: {e}")
        return f"Error generating report: {e}"

"""Extract plain text from PDF and parse metadata via LLM for Chinese/unusual PDFs."""
import logging
import httpx

from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

DEEPSEEK_PARSE_PROMPT = """你是一个学术文献解析助手。请从以下论文文本中提取元数据。

论文文本：
{text}

请以 JSON 格式返回以下字段（找不到的字段用 null）：
{{
  "title": "论文标题",
  "authors": ["作者1", "作者2"],
  "journal": "期刊名",
  "year": 年份数字,
  "abstract": "摘要文本"
}}

只返回 JSON，不要其他内容。"""


async def extract_text_from_pdf_bytes(pdf_content: bytes) -> str | None:
    """Extract plain text from PDF using GROBID's PDF-to-text capability or basic pdftotext."""
    try:
        # Try GROBID's text extraction
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{settings.grobid_url.rstrip('/')}/api/processFulltextDocument",
                files={"input": ("paper.pdf", pdf_content, "application/pdf")},
                data={"consolidateHeader": "0"},
            )
            if resp.status_code == 200:
                # Extract text from TEI XML
                tei = resp.text
                from lxml import etree
                root = etree.fromstring(tei.encode("utf-8"))
                # Get all text elements from body
                texts = []
                for elem in root.iter():
                    if elem.text and elem.text.strip():
                        texts.append(elem.text.strip())
                return " ".join(texts)
    except Exception as e:
        logger.warning(f"PDF text extraction via GROBID failed: {e}")

    return None


async def parse_metadata_with_llm(text: str) -> dict:
    """Use DeepSeek to extract paper metadata from raw text."""
    import json
    import re

    prompt = DEEPSEEK_PARSE_PROMPT.format(text=text[:4000])

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{settings.llm_api_base.rstrip('/')}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.llm_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.llm_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "max_tokens": 1000,
                },
            )
            if resp.status_code != 200:
                logger.warning(f"DeepSeek returned {resp.status_code}: {resp.text[:200]}")
                return {}
            data = resp.json()

        choices = data.get("choices")
        if not choices or not isinstance(choices, list) or len(choices) == 0:
            logger.warning(f"DeepSeek returned no choices: {data}")
            return {}

        content = choices[0].get("message", {}).get("content", "").strip()
        if not content:
            logger.warning("DeepSeek returned empty content")
            return {}

        # Extract JSON from response
        json_match = re.search(r"\{.*\}", content, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
            logger.info(f"LLM parsed: title={result.get('title', '')[:60]}")
            return result
    except Exception as e:
        logger.warning(f"LLM metadata parsing failed: {e}")

    return {}

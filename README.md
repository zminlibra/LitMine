# LitMine

<p align="center">
  <img src="https://img.shields.io/badge/status-active-success?style=flat-square" alt="Status" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/Next.js-16.2-black?style=flat-square&logo=next.js" alt="Next.js" />
</p>

<p align="center"><strong>AI-powered literature mining and research analytics platform for researchers across all disciplines.</strong></p>

---

## What LitMine Does

| | | |
|---|---|---|
| :mag: **Discover** | Search papers across arXiv, PubMed, bioRxiv, and OpenAlex simultaneously with automatic deduplication and metadata extraction |
| :bookmark_tabs: **Import** | Upload PDFs (auto-parsed via GROBID for title, authors, abstract, DOI), paste DOI links, or import BibTeX/RIS files from reference managers |
| :bar_chart: **Analyze** | See hotspot trends and research gap matrices powered by dynamic TF-IDF term extraction — no hardcoded domain vocabulary, works for **any** research field |
| :robot: **AI Deep Read** | 7-dimension paper analysis, multi-language translation (EN/ZH/JA/KO/ES/IT), AI-powered paper comparison, and chat-with-paper |
| :page_facing_up: **Generate** | Structured literature reviews with tables, bullet points, and a narrative introduction section ready for your paper |
| :globe_with_meridians: **Multi-language** | Translation, analysis, comparison, and report all support English / Chinese / Japanese / Korean / Spanish / Italian |

---

## Architecture

```
litmine/
├── apps/
│   ├── api/          # FastAPI backend (Python 3.11+)
│   └── web/          # Next.js frontend (TypeScript)
├── docker-compose.yml
├── README.md
├── README_CN.md
├── ROADMAP.md
└── scripts/
```

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI + SQLAlchemy + asyncpg |
| Frontend | Next.js 16 (App Router) + TypeScript + Tailwind CSS |
| Database | PostgreSQL 16 + pgvector (semantic search) |
| Cache / Queue | Redis |
| PDF Parsing | GROBID 0.8.1 (TEI XML extraction) |
| LLM | DeepSeek (chat + translation + entity extraction) |
| Infra | 3 Docker containers: PostgreSQL, Redis, GROBID |

---

## Quick Start

### Prerequisites

- Docker Desktop
- Node.js 18+
- Python 3.11+
- A DeepSeek API key (https://platform.deepseek.com)

### 1. Start Services

```bash
docker compose up -d
```

Starts PostgreSQL (with pgvector extension), Redis, and GROBID.

### 2. Configure & Run Backend

```bash
cd apps/api
cp .env.template .env       # edit .env — add your DeepSeek API key
pip install -e .
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Start Frontend

```bash
cd apps/web
npm install
npx next dev --port 3000
```

### 4. Open

Visit `http://localhost:3000` → register an account → create your first project → Discover papers.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| No Neo4j | Hotspot + Gap charts only; PostgreSQL `GROUP BY` is faster, lighter, and simpler |
| No message queue (arq/Redis) | Single-user context — report generation runs inline; fewer moving parts |
| No object storage (MinIO) | PDFs stored on local filesystem (`data/pdfs/`); no external service dependency |
| Dynamic vocabulary | TF-IDF extracted from user's paper corpus; cross-disciplinary seed words for cold start. Works for any field — molecular biology, materials science, social sciences |
| LLM server-side proxy | All DeepSeek calls go through backend `POST /api/v1/llm/proxy`; API key never touches the browser |
| `_deprecated/` directory | Old components (ForceGraph, AuthorNetwork, TimelineView, GraphSidebar) kept for reference but not loaded |

---

## Roadmap

See **[ROADMAP.md](ROADMAP.md)** for the complete product roadmap and current status.

---

## License

MIT © 2025–2026

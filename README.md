# LitMine

AI-powered literature mining and research analytics platform for scientists.

LitMine helps researchers quickly understand a field's landscape, identify research gaps, and generate structured literature reviews — all from a simple keyword search across multiple academic databases.

## What It Does

- **Discover papers** across arXiv, PubMed, bioRxiv, and OpenAlex
- **Import papers** via PDF upload (auto-parsed with GROBID), DOI lookup, or BibTeX/RIS files
- **AI-powered analysis** — 7-dimension deep analysis, translation (EN/ZH/JA/KO/ES/IT), chat with papers, and AI paper comparison
- **Research analytics** — dynamic hotspot detection and gap matrix, no hardcoded domain vocabulary
- **Literature review generation** — structured report with tables, bullet points, and a narrative introduction section ready for your paper
- **Multi-language support** throughout the entire platform

## Architecture

```
litmine/
├── apps/
│   ├── api/          # FastAPI backend
│   └── web/          # Next.js frontend
├── docker-compose.yml
└── scripts/
```

**Stack:** FastAPI + Next.js + PostgreSQL (pgvector) + Redis + GROBID (PDF parsing) + DeepSeek (LLM)

3 containers: PostgreSQL, Redis, GROBID.

## Quick Start

### Prerequisites

- Docker Desktop installed and running
- Node.js 18+ (for frontend dev)
- Python 3.11+ (for backend dev)
- A DeepSeek API key

### 1. Start Infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL (with pgvector), Redis, and GROBID.

### 2. Configure Backend

```bash
cd apps/api
cp .env.template .env
# Edit .env — add your DeepSeek API key and any other settings
```

```bash
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

Visit `http://localhost:3000`, register an account, and create your first project.

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| No Neo4j | Only Hotspot + Gap charts are retained; Postgres GROUP BY is faster and lighter |
| No arq/Redis queue | Single-user context — report generation runs inline |
| No MinIO | PDFs stored on local filesystem (`data/pdfs/`) |
| Dynamic vocabulary | TF-IDF from paper corpus, seed word list for initial bootstrap |
| LLM proxy | All AI calls go through backend; API key never touches the browser |

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full development plan and current status.

## License

MIT

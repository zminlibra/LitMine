# LitMine

<p align="center">
  <img src="https://img.shields.io/badge/status-active-success?style=flat-square" alt="Status" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/Next.js-16.2-black?style=flat-square&logo=next.js" alt="Next.js" />
</p>

<p align="center"><strong>面向全学科科研人员的 AI 驱动文献挖掘与研究分析平台。</strong></p>

---

## 能做什么

| | | |
|---|---|---|
| :mag: **论文发现** | 从 arXiv、PubMed、bioRxiv、OpenAlex 四个数据源同步搜索，自动去重和元数据提取 |
| :bookmark_tabs: **论文导入** | 上传 PDF（GROBID 自动解析标题/作者/摘要/DOI）、粘贴 DOI 链接、导入 BibTeX/RIS 参考文献文件 |
| :bar_chart: **研究分析** | 动态热点趋势 + 研究空白矩阵，TF-IDF 自动提取术语，**不预设学科词表**，适用于任何研究方向 |
| :robot: **AI 深度阅读** | 七维度论文分析、多语言翻译（中/日/韩/西/意）、AI 论文对比、论文对话 |
| :page_facing_up: **综述生成** | 结构化文献综述（表格 + 项目符号 + 可直接用于论文引言章节的叙事综述） |
| :globe_with_meridians: **全平台多语言** | 翻译、分析、对比、报告均支持中英日韩西意六种语言 |

---

## 技术架构

```
litmine/
├── apps/
│   ├── api/          # FastAPI 后端 (Python 3.11+)
│   └── web/          # Next.js 前端 (TypeScript)
├── docker-compose.yml
├── README.md
├── README_CN.md
├── ROADMAP.md
└── scripts/
```

| 层 | 技术 |
|----|------|
| 后端 | FastAPI + SQLAlchemy + asyncpg |
| 前端 | Next.js 16 (App Router) + TypeScript + Tailwind CSS |
| 数据库 | PostgreSQL 16 + pgvector（语义搜索） |
| 缓存/队列 | Redis |
| PDF 解析 | GROBID 0.8.1（TEI XML 提取） |
| 大模型 | DeepSeek（对话 + 翻译 + 实体提取） |
| 基础设施 | 3 个 Docker 容器：PostgreSQL、Redis、GROBID |

---

## 快速开始

### 环境要求

- Docker Desktop
- Node.js 18+
- Python 3.11+
- DeepSeek API Key（https://platform.deepseek.com）

### 1. 启动服务

```bash
docker compose up -d
```

启动 PostgreSQL（含 pgvector 向量扩展）、Redis 和 GROBID。

### 2. 配置并运行后端

```bash
cd apps/api
cp .env.template .env       # 编辑 .env，填入 DeepSeek API Key
pip install -e .
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. 启动前端

```bash
cd apps/web
npm install
npx next dev --port 3000
```

### 4. 打开

访问 `http://localhost:3000` → 注册账号 → 创建第一个项目 → Discover 论文。

---

## 关键设计决策

| 决策 | 原因 |
|------|------|
| 不用 Neo4j | 只保留热点图和空白矩阵，PostgreSQL `GROUP BY` 更快更轻，运维更简单 |
| 不用消息队列（arq/Redis） | 单用户场景下报告生成内联即可，减少运维组件 |
| 不用对象存储（MinIO） | PDF 存本地文件系统（`data/pdfs/`），无外部服务依赖 |
| 术语动态提取 | TF-IDF 从用户论文语料中自动提取，跨学科种子词做冷启动。适用于任何领域——分子生物学、材料科学、社会科学都可以 |
| LLM 服务端代理 | 所有 DeepSeek 调用走后端 `POST /api/v1/llm/proxy`，API Key 不接触浏览器 |
| `_deprecated/` 目录 | 旧组件（ForceGraph、AuthorNetwork、TimelineView、GraphSidebar）保留供参考但不加载 |

---

## 路线图

详见 **[ROADMAP.md](ROADMAP.md)** 查看完整产品路线图和当前进度。

---

## 许可证

MIT © 2025–2026

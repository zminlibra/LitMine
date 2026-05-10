# LitMine

面向科研人员的 AI 驱动文献挖掘与研究分析平台。

LitMine 帮助研究人员快速了解一个领域的全貌、识别研究空白，并生成结构化的文献综述——只需输入关键词，即可从多个学术数据库发现论文。

## 核心功能

- **论文发现** — 从 arXiv、PubMed、bioRxiv、OpenAlex 四个数据源搜索论文
- **论文导入** — 支持 PDF 上传（GROBID 自动解析元数据）、DOI 链接导入、BibTeX/RIS 文件批量导入
- **AI 深度分析** — 七维度论文分析、多语言翻译（中/日/韩/西/意）、论文对话、AI 论文对比
- **研究分析仪表盘** — 动态热点检测与空白矩阵，无预设学科词表，术语自动从论文语料提取
- **文献综述生成** — 结构化报告（表格 + 项目符号 + 可写入论文引言章节的叙事综述）
- **全平台多语言** — 交互界面、论文翻译、分析结果、报告内容均支持多语言

## 技术架构

**技术栈：** FastAPI + Next.js + PostgreSQL (pgvector) + Redis + GROBID + DeepSeek

3 个容器：PostgreSQL、Redis、GROBID。

## 快速开始

### 环境要求

- Docker Desktop 已安装并运行
- Node.js 18+
- Python 3.11+
- DeepSeek API Key

### 1. 启动基础设施

```bash
docker compose up -d
```

启动 PostgreSQL（含 pgvector 向量扩展）、Redis、GROBID。

### 2. 配置后端

```bash
cd apps/api
cp .env.template .env
# 编辑 .env，填入 DeepSeek API Key 等配置
```

```bash
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

### 4. 开始使用

打开 `http://localhost:3000`，注册账号，创建第一个项目。

## 关键设计决策

| 决策 | 原因 |
|------|------|
| 不用 Neo4j | 只保留热点图和空白矩阵两张图，Postgres GROUP BY 更快更轻 |
| 不用 arq/Redis 队列 | 单用户场景下报告生成内联即可，减少运维组件 |
| 不用 MinIO | PDF 存本地文件系统 |
| 术语动态提取 | TF-IDF 从论文语料中自动提取，种子词表做初始缓冲 |
| LLM 后端代理 | 所有 AI 调用走后端，API Key 不暴露到浏览器 |

## 路线图

详见 [ROADMAP.md](ROADMAP.md)。

## 许可证

MIT

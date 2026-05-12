<p align="center">
  <img src="https://raw.githubusercontent.com/zminlibra/LitMine/master/images/1%20cover.png" width="100%" alt="LitMine Cover" style="max-width: 100%;" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/twitter/twemoji/master/assets/svg/1f52c.svg" width="80" alt="LitMine Logo" />
</p>

<h1 align="center">LitMine</h1>

<p align="center">
  <strong>面向全学科科研人员的 AI 驱动文献挖掘与研究分析平台</strong>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README_JP.md">日本語</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-active-success?style=flat-square" alt="Status" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey?style=flat-square" alt="Platform" />
</p>

---

## LitMine 是什么

LitMine 是一个帮助科研人员**快速完成文献调研**的 AI 平台。它不预设任何学科词表——无论你做的是合成生物学、材料科学还是社会科学，LitMine 都能从你的论文语料中自动提取关键词、识别研究热点、找出研究空白，并生成结构化的文献综述。

传统的文献调研流程是：在 PubMed / Google Scholar 里一篇一篇翻 → 手动整理笔记 → 自己判断热点和空白 → 写文献综述。LitMine 把这条流程压缩到几分钟。

---

## 功能特性

- **论文发现** — 从 arXiv、PubMed、bioRxiv、OpenAlex 四个数据源同步搜索，自动去重和元数据补全
- **论文导入** — 上传 PDF（GROBID 自动解析标题/作者/摘要/DOI）、粘贴 DOI 链接、导入 BibTeX/RIS 参考文献文件
- **多语言翻译** — 论文标题和摘要翻译，支持中/日/韩/西/意五种语言，翻译结果缓存到数据库不会重复调 API
- **AI 深度分析** — 七维度论文分析（总结、核心贡献、方法论、关键结果、要点、局限性、深度洞察）
- **论文对比** — 选多篇论文，AI 从方法论、发现、优缺点、研究空白等维度做深度对比
- **论文对话** — 和论文对话，问什么答什么
- **研究热点与空白** — 动态 TF-IDF 术语提取 + 趋势斜率排序，不预设学科词表，适用于任何研究方向
- **文献综述生成** — 5 段结构化报告（领域概览 + 概念关系 + 方法论对比 + 贡献者与空白 + 叙事综述），带三线表格
- **全平台多语言** — 翻译、分析、对比、报告均支持中英日韩西意六种语言
- **3 容器部署** — PostgreSQL + Redis + GROBID，`docker compose up -d` 一键启动

---

## 截图

<p align="center">
  <img src="https://raw.githubusercontent.com/zminlibra/LitMine/master/images/2%20projects.png" width="100%" alt="Projects Dashboard" style="max-width: 100%;" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/zminlibra/LitMine/master/images/3%20project%20contents.png" width="100%" alt="Project Contents" style="max-width: 100%;" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/zminlibra/LitMine/master/images/4%20paper%20analysis.png" width="100%" alt="Paper Analysis" style="max-width: 100%;" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/zminlibra/LitMine/master/images/5%20paper%20comparison.png" width="100%" alt="Paper Comparison" style="max-width: 100%;" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/zminlibra/LitMine/master/images/6%20reports.png" width="100%" alt="Reports" style="max-width: 100%;" />
</p>

---

## 快速开始

### 环境要求

- Docker Desktop
- Node.js 18+
- Python 3.11+
- LLM API Key（支持 DeepSeek / OpenAI / Gemini / Anthropic / OpenRouter / 通义千问 / Kimi，在应用内 LLM Settings 中配置）

### 1. 启动服务

```bash
docker compose up -d
```

启动 PostgreSQL（含 pgvector 向量扩展）、Redis 和 GROBID。

### 2. 配置并运行后端

```bash
cd apps/api
cp .env.template .env       # 编辑 .env（可选）设置服务器默认 LLM API Key
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

## 架构

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

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | FastAPI + SQLAlchemy + asyncpg |
| 前端 | Next.js 16 (App Router) + TypeScript + Tailwind CSS |
| 数据库 | PostgreSQL 16 + pgvector（语义搜索） |
| 缓存 | Redis |
| PDF 解析 | GROBID 0.8.1（TEI XML 提取） |
| 大模型 | DeepSeek（对话 + 翻译 + 实体提取） |
| 基础设施 | 3 个 Docker 容器：PostgreSQL、Redis、GROBID |

---

## 关键设计决策

| 决策 | 原因 |
|------|------|
| 不用 Neo4j | 只保留热点图和空白矩阵，PostgreSQL `GROUP BY` 更快更轻 |
| 不用消息队列 | 单用户场景下报告生成内联即可，减少运维组件 |
| 不用对象存储 | PDF 存本地文件系统，无外部服务依赖 |
| 术语动态提取 | TF-IDF 从用户论文语料中自动提取，跨学科种子词做冷启动 |
| LLM 服务端代理 + 多提供商 | 支持 7 个提供商（DeepSeek/OpenAI/Gemini/Anthropic/OpenRouter/通义千问/Kimi），用户 API Key 存浏览器本地，所有调用走后端代理 |

---

## 开发

```bash
# 后端
cd apps/api && uvicorn app.main:app --reload

# 前端
cd apps/web && npx next dev
```

---

## 路线图

详见 **[ROADMAP.md](ROADMAP.md)**。

---

## 请作者喝杯咖啡

如果 LitMine 对你的科研有帮助，欢迎请作者喝杯咖啡！

<p align="center">
  <img src="https://raw.githubusercontent.com/zminlibra/LitMine/master/images/wechat.jpg" width="28%" alt="微信赞赏" style="min-width: 180px;" />
  <img src="https://raw.githubusercontent.com/zminlibra/LitMine/master/images/alipay.jpg" width="28%" alt="支付宝打赏" style="min-width: 180px;" />
</p>
<p align="center">
  <sub>微信赞赏 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 支付宝打赏</sub>
</p>

## 联系方式

- 邮箱：zming19861028@126.com / zming19861028@hotmail.com
- 微信：zminlibra
- GitHub：[zminlibra](https://github.com/zminlibra)

## 致谢

LitMine 建立在许多优秀开源项目之上：

- [GROBID](https://github.com/kermitt2/grobid) — PDF 结构化文本提取
- [FastAPI](https://github.com/fastapi/fastapi) — Python Web 框架
- [Next.js](https://github.com/vercel/next.js) — React 框架
- [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) — 高效 CSS 方案
- [PostgreSQL](https://www.postgresql.org/) + [pgvector](https://github.com/pgvector/pgvector) — 数据库与向量检索
- [Recharts](https://github.com/recharts/recharts) — 图表库
- [DeepSeek](https://www.deepseek.com/) — 大语言模型 API
- 所有在 Phase 1–4 中提供关键反馈的测试者和同事们

## 许可证

MIT © 2025–2026

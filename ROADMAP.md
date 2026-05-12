# LitMine — 产品定位与开发路线图

> 项目路径：`C:\Users\Administrator\project_fun\funcode`

---

## Phase 0：产品定位（已锁定）

### 三行假设

1. **帮谁？** 所有需要做文献调研的科研人员
2. **省什么事？** 省去手动翻几十篇论文提炼"这个领域都在做什么、哪里有空白"的时间
3. **回答哪三个问题？**
   - 这个领域当前热点是什么？
   - 哪里有研究空白？
   - 这些论文能不能帮我写文献综述？

### 产品本质

**分析仪表盘**，不是知识图谱。用户来挖信息，不是来看拓扑结构。

### 不可替代性

学科无关的实体抽取 + 空白识别。不依赖任何预设学科词表。

---

## 战略决策（已锁定）

| 决策 | 方案 | 原因 |
|------|------|------|
| Neo4j | **砍** | 只留 Hotspot + Gap 两张聚合图，PG GROUP BY 更快更轻 |
| API Key | **系统 Key** | LitMine 是开箱即用的服务，不是工具壳 |
| 术语表 | **PG TF-IDF** | 不依赖 Neo4j，种子词表 + 10 篇后自动过渡 |
| 实体数据 | **PG JSONB 列** | 替代 Neo4j，存菌株/酶/产物/方法等结构化实体 |
| 图谱图表 | **只留 2 张** | HotspotBarChart（热点）+ GapMatrix（空白） |

---

## Phase 1：安全 + 护栏 + 体验（已完成 ✅）

- [x] API Key 代理端点（系统 Key，预留结构化 JSON 格式）
- [x] 翻译缓存落地（PG 列 `title_cn` / `abstract_cn`，详情页 + 对比弹窗两条路径，含存量回填）
- [x] 爬虫 rate limit（token bucket，PubMed/CrossRef 各 1 req/s）
- [x] 进度条修复（crawl_paper_job 回调 3-4 行计数更新）
- [x] GROBID 健康检查优化（docker-compose start_period 90s，API 重试时友好提示）
- [x] 首页状态卡（"已收录 X 篇，术语模型训练中"）

**验收条件：**
- API Key 不暴露在前端
- 翻译重启不丢
- 爬虫 500 篇不被封
- 进度条在动
- 用户打开页面能看到状态

---

## Phase 2：术语表动态化 + 图表裁剪（已完成 ✅）

- [x] 术语表动态化：种子词表 + TF-IDF 混合策略
- [x] 砍 ForceGraph、AuthorNetwork、TimelineView、MethodsTimeline（组件文件保留但不再引用）
- [x] HotspotBarChart + GapMatrix 保留并切换术语动态词表
- [x] GapMatrix 加数据覆盖度标签（"空白可能来自数据覆盖限制"）
- [x] 删论文时清理对应实体数据（Neo4j 已砍，此条 N/A）

**验收条件：**
- 术语表随论文积累自动更新，不依赖预设学科词表
- 图谱页面只显示两个问题，每个图下一行字解释它在回答什么
- 删论文不留孤儿实体

---

## Phase 3：服务栈瘦身（已完成 ✅）

- [x] 砍 arq（report 生成改同步内联，Docker 去 arq 容器）
- [x] 砍 MinIO（PDF 存本地 `data/pdfs/`，S3 配置和容器已清理）
- [x] 砍 Neo4j（容器 + 代码 + graph_service 已清理）
- [x] docker-compose healthcheck（GROBID start_period 90s）
- [x] 服务栈：6 容器 → 3 容器（PG + Redis + GROBID）

**验收条件：**
- `docker compose ps` 只显示 3 个容器
- 首次启动后 API 正常响应
- 所有已有功能正常

---

## Phase 4：复盘

- [ ] 对照各阶段验收条件逐项检查
- [ ] 用户试用反馈（验收人：______，日期：______）
  - [ ] 测试者 A（同实验室同学，20min）：从注册到看见第一张图，不提问，≤7 分钟
  - [ ] 测试者 B（完全不同领域的科研朋友，20min）：用自己不熟悉的领域创建项目并解释 Analytics 图在说什么
  - [ ] 测试者 C（做过领域综述的博后/PI，30min）：评估 Section 5 文献综述是否"值得写进论文"
- [ ] 定下一步方向
- [ ] 如果没有通过，记录阻塞项并排入下一轮 Priority

**Pass 条件：** 所有测试者完成操作路径；至少 2/3 能正确解释 Analytics 图在说什么。

---

## 明确排除

- Neo4j 管道焊接及相关代码
- ForceGraph / AuthorNetwork / TimelineView / MethodsTimeline 维护
- arq 和 MinIO 保留
- 术语表写死

---

*最后更新：2026-05-11（Phase 1-3 完成，push 到 GitHub）*

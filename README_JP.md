<p align="center">
  <img src="https://raw.githubusercontent.com/zminlibra/LitMine/master/images/1%20cover.png" width="100%" alt="LitMine Cover" style="max-width: 100%;" />
</p>

<p align="center">
  <strong>あらゆる分野の研究者のためのAI駆動文献マイニング・研究分析プラットフォーム</strong>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README_CN.md">中文</a> |
  <a href="README_JP.md">日本語</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-active-success?style=flat-square" alt="Status" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey?style=flat-square" alt="Platform" />
</p>

---

## LitMine とは

LitMine は、研究者が**文献調査を高速に行う**ための AI プラットフォームです。分野固有の用語辞書に依存せず、合成生物学、材料科学、社会科学など、あらゆる研究分野に対応します。ユーザーの論文コーパスから自動的にキーワードを抽出し、研究ホットスポットの特定、研究ギャップの発見、構造化された文献レビューの生成を行います。

従来の文献調査フロー——PubMed / Google Scholar で 1 本ずつ検索 → 手動でノート整理 → ホットスポットとギャップを自分で判断 → レビューを執筆——を、LitMine は数分に短縮します。

---

## 機能

- **論文発見** — arXiv、PubMed、bioRxiv、OpenAlex の 4 つのデータソースから同時検索、自動重複排除とメタデータ補完
- **論文インポート** — PDF アップロード（GROBID によるタイトル・著者・要約・DOI の自動解析）、DOI リンク貼り付け、BibTeX/RIS ファイルのインポート
- **多言語翻訳** — 論文タイトルと要約を中国語・日本語・韓国語・スペイン語・イタリア語に翻訳、結果はデータベースにキャッシュ
- **AI 詳細分析** — 7 次元分析：要約・コア貢献・方法論・主な結果・重要ポイント・限界・深い洞察
- **論文比較** — 複数の論文を選択し、方法論・発見・強み・限界・研究ギャップを AI が比較
- **論文との対話** — 論文について質問し、文脈に応じた回答を得る
- **研究ホットスポットとギャップ** — 動的 TF-IDF 用語抽出 + トレンド傾斜ソート、あらゆる研究分野に対応
- **文献レビュー生成** — 5 セクションの構造化レポート（学術的三線表 + ナラティブイントロダクション）
- **全プラットフォーム多言語** — 翻訳・分析・比較・レポートが 6 言語（EN/ZH/JA/KO/ES/IT）に対応
- **3 コンテナデプロイ** — PostgreSQL + Redis + GROBID、`docker compose up -d` で起動

---

## スクリーンショット

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

## クイックスタート

### 前提条件

- Docker Desktop
- Node.js 18+
- Python 3.11+
- LLM API キー（DeepSeek / OpenAI / Gemini / Anthropic / OpenRouter / Qwen / Kimi 対応。アプリ内の LLM Settings で設定）

### 1. サービスの起動

```bash
docker compose up -d
```

PostgreSQL（pgvector 拡張機能付き）、Redis、GROBID が起動します。

### 2. バックエンドの設定と実行

```bash
cd apps/api
cp .env.template .env       # .env を編集（オプション）サーバーデフォルトの LLM API キーを設定
pip install -e .
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. フロントエンドの起動

```bash
cd apps/web
npm install
npx next dev --port 3000
```

### 4. 開く

`http://localhost:3000` にアクセス → アカウント登録 → 最初のプロジェクトを作成 → Discover 論文。

---

## アーキテクチャ

```
litmine/
├── apps/
│   ├── api/          # FastAPI バックエンド (Python 3.11+)
│   └── web/          # Next.js フロントエンド (TypeScript)
├── docker-compose.yml
├── README.md
├── README_CN.md
├── README_JP.md
├── ROADMAP.md
└── scripts/
```

## 技術スタック

| 層 | 技術 |
|----|------|
| バックエンド | FastAPI + SQLAlchemy + asyncpg |
| フロントエンド | Next.js 16 (App Router) + TypeScript + Tailwind CSS |
| データベース | PostgreSQL 16 + pgvector（意味検索） |
| キャッシュ | Redis |
| PDF 解析 | GROBID 0.8.1（TEI XML 抽出） |
| LLM | DeepSeek（対話 + 翻訳 + エンティティ抽出） |
| インフラ | 3 つの Docker コンテナ：PostgreSQL、Redis、GROBID |

---

## 主要な設計判断

| 判断 | 理由 |
|------|------|
| Neo4j 不使用 | ホットスポットとギャップチャートのみ保持、PostgreSQL `GROUP BY` の方が高速かつ軽量 |
| メッセージキュー不使用 | シングルユーザー向け — レポート生成はインライン実行、可動部品を削減 |
| オブジェクトストレージ不使用 | PDF はローカルファイルシステムに保存、外部サービス依存なし |
| 動的語彙抽出 | ユーザーの論文コーパスから TF-IDF で自動抽出、分野横断的なシードワードでコールドスタート対応 |
| LLM サーバーサイドプロキシ + マルチプロバイダー | 7 つのプロバイダーに対応（DeepSeek/OpenAI/Gemini/Anthropic/OpenRouter/Qwen/Kimi）。ユーザー API キーはブラウザに保存、すべての呼び出しはバックエンド経由 |

---

## 開発

```bash
# バックエンド
cd apps/api && uvicorn app.main:app --reload

# フロントエンド
cd apps/web && npx next dev
```

---

## ロードマップ

詳細は **[ROADMAP.md](ROADMAP.md)** を参照。

---

## コーヒーをおごる

LitMine があなたの研究に役立っているなら、コーヒーをおごってください！

<p align="center">
  <img src="https://raw.githubusercontent.com/zminlibra/LitMine/master/images/wechat.jpg" width="28%" alt="WeChat" style="min-width: 180px;" />
  <img src="https://raw.githubusercontent.com/zminlibra/LitMine/master/images/alipay.jpg" width="28%" alt="Alipay" style="min-width: 180px;" />
</p>
<p align="center">
  <sub>WeChat &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Alipay</sub>
</p>

## 連絡先

- メール: zming19861028@126.com / zming19861028@hotmail.com
- WeChat: zminlibra
- GitHub: [zminlibra](https://github.com/zminlibra)

## 謝辞

LitMine は多くの優れたオープンソースプロジェクトの上に構築されています：

- [GROBID](https://github.com/kermitt2/grobid) — PDF 構造化テキスト抽出
- [FastAPI](https://github.com/fastapi/fastapi) — Python Web フレームワーク
- [Next.js](https://github.com/vercel/next.js) — React フレームワーク
- [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) — ユーティリティファースト CSS
- [PostgreSQL](https://www.postgresql.org/) + [pgvector](https://github.com/pgvector/pgvector) — データベースとベクトル検索
- [Recharts](https://github.com/recharts/recharts) — チャートライブラリ
- [DeepSeek](https://www.deepseek.com/) — LLM API
- Phase 1–4 で重要なフィードバックを提供してくれたすべてのテスターと同僚の皆さん

## ライセンス

MIT © 2025–2026

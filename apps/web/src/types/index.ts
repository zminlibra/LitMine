export interface User {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  tier: "free" | "pro" | "team";
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
  sources: string[];
  year_range_start: number | null;
  year_range_end: number | null;
  max_papers: number;
  crawl_status: "idle" | "queued" | "crawling" | "parsing" | "extracting" | "embedding" | "completed" | "failed";
  crawl_progress: CrawlProgress | null;
  paper_count: number;
  created_at: string;
}

export interface CrawlProgress {
  crawling: StageProgress;
  parsing: StageProgress;
  extracting: StageProgress;
  embedding: StageProgress;
}

export interface StageProgress {
  total: number;
  completed: number;
}

export interface Paper {
  id: string;
  project_id: string;
  title: string;
  title_cn: string | null;
  abstract: string | null;
  abstract_cn: string | null;
  doi: string | null;
  authors: string[];
  journal: string | null;
  year: number | null;
  source: string;
  url: string | null;
  status: string;
  extracted_entities: Record<string, unknown> | null;
  created_at: string;
}

export interface PaperDetail extends Paper {
  structured_text: string | null;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Report {
  id: string;
  project_id: string;
  title: string;
  content_md: string | null;
  focus_areas: string[];
  status: "pending" | "generating" | "completed" | "failed";
  created_at: string;
}

export interface HotspotItem {
  name: string;
  frequency: number;
  recent_freq: number;
  avg_year: number;
  trend: number;
}

export interface MethodEvolutionItem {
  method: string;
  evolved_from: string | null;
  first_use: number;
  adoption_count: number;
}

export interface InfluentialAuthor {
  name: string;
  citation_count: number;
  collaborators: string[];
}

export interface GapItem {
  concept_a: string;
  concept_b: string;
  concept_a_papers: number;
  concept_b_papers: number;
  co_occurrence: number;
  gap_score: number;
}

export interface AIAnalysisResult {
  summary: string;
  coreContribution: string;
  methodology: string;
  keyResults: string;
  keyTakeaways: string;
  limitations: string;
  deepInsights: string;
}


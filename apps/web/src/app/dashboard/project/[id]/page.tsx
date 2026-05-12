"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  FileText,
  Search,
  Loader2,
  Globe,
  AlertCircle,
  CheckCircle2,
  Trash2,
  RefreshCw,
  BarChart3,
  Columns3,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import type { Project, Paper, CrawlProgress } from "@/types";
import CompareModal from "@/components/paper/CompareModal";
import ImportPaperModal from "@/components/paper/ImportPaperModal";

const STAGE_LABELS: Record<string, string> = {
  searching: "Discovering papers",
};

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.id as string;
  const showDiscoverPulse = searchParams.get("guide") === "discover";
  const autoCompare = searchParams.get("guide") === "compare";

  const [project, setProject] = useState<Project | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [filterText, setFilterText] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  const fetchProject = useCallback(async () => {
    const res = await api.get(`/api/v1/projects/${projectId}`);
    if (res.ok) {
      const data = await res.json();
      setProject(data);
      return data;
    }
    return null;
  }, [projectId]);

  const fetchPapers = useCallback(async () => {
    const res = await api.get(`/api/v1/projects/${projectId}/papers?page_size=100`);
    if (res.ok) {
      const data = await res.json();
      setPapers(data.papers || []);
    }
  }, [projectId]);

  useEffect(() => {
    Promise.all([fetchProject(), fetchPapers()]).finally(() => setLoading(false));
  }, [fetchProject, fetchPapers]);

  // WebSocket for live search progress
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/ws/projects/${projectId}/crawl`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "progress_update") {
          setProject((prev) => {
            if (!prev?.crawl_progress) return prev;
            const newProgress = { ...prev.crawl_progress };
            const stage = newProgress[msg.stage as keyof CrawlProgress];
            if (stage) {
              stage.completed = msg.completed;
            }
            return { ...prev, crawl_progress: newProgress };
          });
        } else if (msg.type === "crawl_complete") {
          setSearching(false);
          toast.success(`Discover complete! Found ${msg.total_papers} papers.`);
          fetchProject();
          fetchPapers();
        } else if (msg.type === "error") {
          toast.error(`Error in ${msg.stage}: ${msg.message}`);
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => ws.close();
  }, [projectId, fetchProject, fetchPapers]);

  const handleStartSearch = async () => {
    setSearching(true);
    try {
      const res = await api.post(`/api/v1/projects/${projectId}/crawl`);
      if (res.ok) {
        toast.success("Discover started!");
        fetchProject();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to start discover");
        setSearching(false);
      }
    } catch {
      toast.error("Failed to start discover");
      setSearching(false);
    }
  };

  const [compareMode, setCompareMode] = useState(autoCompare);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const handleRefreshAll = async () => {
    if (!confirm(`Refresh all ${papers.length} papers in this project? This may take a while.`)) return;
    setRefreshingAll(true);
    try {
      const res = await api.post(`/api/v1/projects/${projectId}/papers/refresh-all`);
      if (res.ok) {
        const data = await res.json();
        toast.success(`Refreshed ${data.refreshed} papers, ${data.skipped} skipped, ${data.errors} errors`);
        fetchPapers();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Refresh all failed");
      }
    } catch {
      toast.error("Refresh all failed, please retry");
    } finally {
      setRefreshingAll(false);
    }
  };

  const handleDeletePaper = async (e: React.MouseEvent, paperId: string, title: string) => {
    e.stopPropagation();
    if (!confirm(`Delete "${title.slice(0, 60)}"?`)) return;
    try {
      const res = await api.delete(`/api/v1/papers/${paperId}`);
      if (res.ok) {
        setPapers((prev) => prev.filter((p) => p.id !== paperId));
        toast.success("Paper deleted");
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete, please retry");
    }
  };

  const handleRefreshPaper = async (e: React.MouseEvent, paperId: string, title: string) => {
    e.stopPropagation();
    setRefreshingIds((prev) => new Set(prev).add(paperId));
    try {
      const res = await api.post(`/api/v1/papers/${paperId}/refresh`);
      if (res.ok) {
        const updated = await res.json();
        setPapers((prev) =>
          prev.map((p) =>
            p.id === paperId
              ? { ...p, title: updated.title, abstract: updated.abstract, authors: updated.authors, journal: updated.journal, year: updated.year, doi: updated.doi }
              : p
          )
        );
        toast.success(`Refreshed: ${updated.title.slice(0, 50)}...`);
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to refresh");
      }
    } catch {
      toast.error("Failed to refresh, please retry");
    } finally {
      setRefreshingIds((prev) => {
        const next = new Set(prev);
        next.delete(paperId);
        return next;
      });
    }
  };

  const handleToggleCompare = (paperId: string) => {
    setSelectedForCompare((prev) => {
      const next = new Set(prev);
      if (next.has(paperId)) {
        next.delete(paperId);
      } else {
        next.add(paperId);
      }
      return next;
    });
  };

  const comparePapers = papers.filter((p) => selectedForCompare.has(p.id));

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-4">
        <AlertCircle className="h-12 w-12 text-zinc-300" />
        <p className="text-zinc-500">Project not found</p>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const isActive = ["queued", "searching", "parsing", "extracting", "embedding"].includes(project.crawl_status);
  const isComplete = project.crawl_status === "completed";

  return (
    <div className="max-w-6xl mx-auto p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-zinc-400 hover:text-zinc-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">{project.name}</h1>
            {project.description && (
              <p className="text-zinc-500 text-sm mt-0.5">{project.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => router.push(`/dashboard/project/${projectId}/search`)}
          >
            <Search className="h-4 w-4" /> Search
          </Button>
          {isComplete && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => router.push(`/dashboard/project/${projectId}/graph`)}
            >
              <BarChart3 className="h-4 w-4" /> Analytics
            </Button>
          )}
          {isComplete && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => router.push(`/dashboard/project/${projectId}/report`)}
            >
              <FileText className="h-4 w-4" /> Report
            </Button>
          )}
          {papers.length >= 2 && (
            <Button
              variant={compareMode ? "default" : "outline"}
              size="sm"
              className={`gap-1 ${compareMode ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
              onClick={() => {
                setCompareMode(!compareMode);
                if (compareMode) setSelectedForCompare(new Set());
              }}
            >
              <Columns3 className="h-4 w-4" /> Compare
            </Button>
          )}
          <Button
            className={`bg-emerald-600 hover:bg-emerald-700 gap-1 ${showDiscoverPulse ? "animate-pulse-glow" : ""}`}
            size="sm"
            onClick={handleStartSearch}
            disabled={isActive || searching}
          >
            {isActive || searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Globe className="h-4 w-4" />
            )}
            {isActive ? "Discovering..." : "Discover"}
          </Button>
        </div>
      </div>

      {/* Search Progress */}
      {isActive && project.crawl_progress && (
        <Card className="mb-6 border-emerald-200 bg-emerald-50">
          <CardContent className="py-4">
            <h3 className="font-medium text-emerald-800 mb-3">Discover Progress</h3>
            <div className="space-y-2">
              {Object.entries(project.crawl_progress!).map(([stage, progress]) => {
                if (!progress || progress.total === 0) return null;
                const pct = Math.round((progress.completed / progress.total) * 100);
                const isDone = progress.completed === progress.total && progress.total > 0;
                const isCurrent = !isDone;

                return (
                  <div key={stage}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className={isCurrent ? "font-medium text-emerald-700" : "text-emerald-600"}>
                        {isDone && <CheckCircle2 className="h-3 w-3 inline mr-1" />}
                        {STAGE_LABELS[stage]}
                      </span>
                      <span className="text-emerald-600">
                        {progress.completed}/{progress.total}
                      </span>
                    </div>
                    <div className="h-2 bg-emerald-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paper count stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-zinc-900">{project.paper_count}</p>
            <p className="text-xs text-zinc-500">Papers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-zinc-900">
              {new Set(papers.map((p) => p.source)).size}
            </p>
            <p className="text-xs text-zinc-500">Sources</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-zinc-900">
              {new Set(papers.map((p) => p.year).filter(Boolean)).size}
            </p>
            <p className="text-xs text-zinc-500">Years Covered</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-zinc-900">
              {new Set(papers.map((p) => p.journal).filter(Boolean)).size}
            </p>
            <p className="text-xs text-zinc-500">Journals</p>
          </CardContent>
        </Card>
      </div>

      {/* Status Card */}
      {papers.length > 0 && (
        <Card className="mb-6 border-emerald-200 bg-gradient-to-r from-emerald-50/60 to-white">
          <CardContent className="py-3">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-sm text-zinc-500">
                Analysis ready — terms extracted from {papers.length} papers. Hotspot and gap analytics available in <button onClick={() => router.push(`/dashboard/project/${projectId}/graph`)} className="text-emerald-600 hover:underline font-medium">Research Analytics</button>.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paper List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between mb-3">
            <CardTitle className="text-lg">Papers</CardTitle>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Import
              </button>
              <button
                onClick={handleRefreshAll}
                disabled={refreshingAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors disabled:opacity-50"
              >
                {refreshingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {refreshingAll ? "Refreshing all..." : "Refresh All"}
              </button>
            </div>
          </div>
          <div className="px-6 pb-2">
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter by title, author, journal, keyword..."
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
            />
          </div>
        </CardHeader>
        <CardContent>
          {papers.length === 0 ? (
            <div className="text-center py-12 text-zinc-400">
              <FileText className="h-10 w-10 mx-auto mb-3" />
              <p>No papers yet. Click Discover to find papers.</p>
            </div>
          ) : (
            (() => {
              const f = filterText.toLowerCase();
              const filteredPapers = f
                ? papers.filter((p) =>
                    p.title.toLowerCase().includes(f) ||
                    (p.authors || []).join(" ").toLowerCase().includes(f) ||
                    (p.journal || "").toLowerCase().includes(f) ||
                    (p.doi || "").toLowerCase().includes(f)
                  )
                : papers;

              if (filteredPapers.length === 0) {
                return (
                  <div className="text-center py-12 text-zinc-400">
                    <p>No papers match "{filterText}"</p>
                  </div>
                );
              }

              return (
              <div className="divide-y divide-zinc-100">
              {filteredPapers.map((paper) => {
                const isPreprint = paper.source === "arxiv" || paper.source === "biorxiv";
                const isSelected = selectedForCompare.has(paper.id);
                return (
                <div
                  key={paper.id}
                  className={`group rounded-lg px-3 -mx-1 transition-all mb-1 py-3 ${
                    compareMode
                      ? isSelected
                        ? "border-2 border-emerald-400 bg-emerald-50/50 cursor-pointer shadow-[0_2px_6px_rgba(5,150,105,0.15)]"
                        : "border border-dashed border-zinc-200 cursor-pointer hover:border-zinc-300"
                      : isPreprint
                        ? "cursor-pointer border border-amber-200/70 bg-gradient-to-b from-amber-50/40 to-amber-50/20 shadow-[0_2px_4px_-1px_rgba(251,191,36,0.18)] hover:shadow-[0_3px_8px_-2px_rgba(251,191,36,0.25)] hover:border-amber-300"
                        : "first:pt-0 cursor-pointer hover:bg-zinc-50"
                  }`}
                  onClick={() => {
                    if (compareMode) {
                      handleToggleCompare(paper.id);
                    } else {
                      router.push(`/dashboard/project/${projectId}/papers/${paper.id}`);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    {compareMode && (
                      <div className={`shrink-0 mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "border-zinc-300 bg-white"
                      }`}>
                        {isSelected && (
                          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l2.5 2.5L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    )}
                    <h4 className="text-sm font-medium text-zinc-900 line-clamp-2 flex-1">{paper.title}</h4>
                    <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                      {!compareMode && (
                        <>
                          <button
                            className="p-1 rounded text-zinc-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            onClick={(e) => handleRefreshPaper(e, paper.id, paper.title)}
                            title="Refresh metadata"
                            disabled={refreshingIds.has(paper.id)}
                          >
                            {refreshingIds.has(paper.id) ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            className="p-1 rounded text-zinc-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                            onClick={(e) => handleDeletePaper(e, paper.id, paper.title)}
                            title="Delete paper"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                    {paper.authors && paper.authors.length > 0 && <span>{paper.authors.join(", ")}</span>}
                    <span>{paper.year}</span>
                    <span className="italic font-bold text-zinc-600">{paper.journal}</span>
                    <span className={`uppercase text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      paper.source === "arxiv" ? "bg-amber-50 text-amber-600" :
                      paper.source === "biorxiv" ? "bg-blue-50 text-blue-600" :
                      paper.source === "pubmed" ? "bg-cyan-50 text-cyan-600" :
                      paper.source === "openalex" ? "bg-violet-50 text-violet-600" :
                      paper.source === "manual_upload" ? "bg-emerald-50 text-emerald-600" :
                      paper.source === "crossref" ? "bg-orange-50 text-orange-600" :
                      "bg-zinc-100 text-zinc-500"
                    }`}>{paper.source === "manual_upload" ? "uploaded" : paper.source}</span>
                    {paper.doi ? (
                      <a
                        href={`https://doi.org/${paper.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-mono"
                        title={paper.doi}
                      >
                        {paper.doi}
                      </a>
                    ) : paper.url ? (
                      <a
                        href={paper.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-mono"
                        title={paper.url}
                      >
                        {paper.url.length > 50 ? paper.url.slice(0, 47) + "..." : paper.url}
                      </a>
                    ) : null}
                    {isPreprint && (
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600 text-[10px] font-medium border border-emerald-200/60">preprint</span>
                    )}
                    {paper.status === "completed" && (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        processed
                      </span>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
              );
            })()
          )}
        </CardContent>
      </Card>

      {/* Compare floating bar */}
      {compareMode && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-zinc-200 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-700">
              {comparePapers.length} paper{comparePapers.length !== 1 ? "s" : ""} selected
            </span>
            {comparePapers.length < 2 && (
              <span className="text-xs text-zinc-400">Select at least 2 to compare</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setCompareMode(false);
                setSelectedForCompare(new Set());
                setShowCompareModal(false);
              }}
              className="px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 rounded-md hover:bg-zinc-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => setShowCompareModal(true)}
              disabled={comparePapers.length < 2}
              className="px-4 py-1.5 text-sm font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:bg-zinc-200 disabled:text-zinc-400 transition-colors"
            >
              Start Compare
            </button>
          </div>
        </div>
      )}

      {/* Compare Modal */}
      {showCompareModal && comparePapers.length >= 2 && (
        <CompareModal
          papers={comparePapers}
          onClose={() => setShowCompareModal(false)}
          onRemove={(paperId) => handleToggleCompare(paperId)}
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportPaperModal
          projectId={projectId}
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            fetchPapers();
            fetchProject();
          }}
        />
      )}
    </div>
  );
}

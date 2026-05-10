"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ExternalLink, Loader2, Trash2, RefreshCw, Pencil, X, Save } from "lucide-react";
import { toast } from "sonner";
import type { PaperDetail } from "@/types";
import { TranslationPanel } from "@/components/paper/TranslationPanel";
import { AnalysisPanel } from "@/components/paper/AnalysisPanel";
import { ChatWithPaper } from "@/components/paper/ChatWithPaper";

export default function PaperDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { id: projectId, paperId } = params as { id: string; paperId: string };

  const [paper, setPaper] = useState<PaperDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    api.get(`/api/v1/papers/${paperId}`)
      .then((res) => res.json())
      .then(setPaper)
      .finally(() => setLoading(false));
  }, [paperId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await api.post(`/api/v1/papers/${paperId}/refresh`);
      if (res.ok) {
        const updated = await res.json();
        setPaper(updated);
        toast.success(`Refreshed: ${updated.title.slice(0, 50)}...`);
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to refresh");
      }
    } catch {
      toast.error("Failed to refresh, please retry");
    } finally {
      setRefreshing(false);
    }
  };

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<{
    title: string; abstract: string; authors: string; journal: string; year: string; doi: string;
  }>({ title: "", abstract: "", authors: "", journal: "", year: "", doi: "" });
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    if (!paper) return;
    setEditForm({
      title: paper.title,
      abstract: paper.abstract || "",
      authors: (paper.authors || []).join(", "),
      journal: paper.journal || "",
      year: paper.year?.toString() || "",
      doi: paper.doi || "",
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        title: editForm.title,
        abstract: editForm.abstract || null,
        authors: editForm.authors ? editForm.authors.split(",").map((s) => s.trim()).filter(Boolean) : [],
        journal: editForm.journal || null,
        year: editForm.year ? parseInt(editForm.year) : null,
        doi: editForm.doi || null,
      };
      const res = await api.patch(`/api/v1/papers/${paperId}`, body);
      if (res.ok) {
        const updated = await res.json();
        setPaper(updated);
        setEditing(false);
        toast.success("Paper updated");
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to update");
      }
    } catch {
      toast.error("Failed to update, please retry");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${paper?.title?.slice(0, 60)}"? This cannot be undone.`)) return;
    try {
      const res = await api.delete(`/api/v1/papers/${paperId}`);
      if (res.ok) {
        toast.success("Paper deleted");
        router.push(`/dashboard/project/${projectId}`);
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete, please retry");
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-zinc-500">Paper not found</p>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entities: Record<string, { label: string; items: any[] }> = {};
  if (paper.extracted_entities) {
    const e = paper.extracted_entities as Record<string, unknown>;
    if (Array.isArray(e.concepts)) entities.concepts = { label: "Concepts", items: e.concepts };
    if (Array.isArray(e.methods)) entities.methods = { label: "Methods", items: e.methods };
    if (Array.isArray(e.organisms)) entities.organisms = { label: "Organisms", items: e.organisms };
    if (Array.isArray(e.genes)) entities.genes = { label: "Genes", items: e.genes };
    if (Array.isArray(e.proteins)) entities.proteins = { label: "Proteins", items: e.proteins };
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <button
        onClick={() => router.push(`/dashboard/project/${projectId}`)}
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Back to project
      </button>

      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-xl font-bold text-zinc-900">{paper.title}</h1>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            className="p-1.5 rounded text-zinc-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
            onClick={startEdit}
            title="Edit metadata"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            className="p-1.5 rounded text-zinc-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh metadata from source"
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
          <button
            className="p-1.5 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            onClick={handleDelete}
            title="Delete paper"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6 text-sm text-zinc-500">
        {paper.authors && paper.authors.length > 0 && (
          <span>{paper.authors.join(", ")}</span>
        )}
        {paper.year && <span>({paper.year})</span>}
        {paper.journal && <span className="italic font-bold text-zinc-600">{paper.journal}</span>}
        <span className={`uppercase text-xs font-medium px-2 py-0.5 rounded ${
          paper.source === "arxiv" ? "bg-amber-50 text-amber-600" :
          paper.source === "biorxiv" ? "bg-blue-50 text-blue-600" :
          paper.source === "pubmed" ? "bg-cyan-50 text-cyan-600" :
          paper.source === "openalex" ? "bg-violet-50 text-violet-600" :
          "bg-zinc-100 text-zinc-500"
        }`}>{paper.source}</span>
        {(paper.source === "arxiv" || paper.source === "biorxiv") && (
          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 text-xs font-medium border border-emerald-200/60">
            preprint — not peer-reviewed
          </span>
        )}
        {paper.doi ? (
          <a
            href={`https://doi.org/${paper.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-600 hover:underline font-mono text-xs"
          >
            <ExternalLink className="h-3 w-3 inline mr-0.5" />
            {paper.doi}
          </a>
        ) : paper.url ? (
          <a
            href={paper.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-600 hover:underline font-mono text-xs"
          >
            <ExternalLink className="h-3 w-3 inline mr-0.5" />
            {paper.url.length > 60 ? paper.url.slice(0, 57) + "..." : paper.url}
          </a>
        ) : null}
      </div>

      {/* Abstract */}
      {paper.abstract && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-base">Abstract</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-700 leading-relaxed">{paper.abstract}</p>
          </CardContent>
        </Card>
      )}

      {/* Translation */}
      <TranslationPanel paperId={paperId} title={paper.title} abstract={paper.abstract || ""} cachedTitleCn={paper.title_cn} cachedAbstractCn={paper.abstract_cn} />

      {/* AI Analysis */}
      <AnalysisPanel title={paper.title} abstract={paper.abstract || ""} />

      {/* Chat with Paper */}
      <ChatWithPaper title={paper.title} abstract={paper.abstract || ""} />

      {/* Extracted Entities */}
      {Object.keys(entities).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Extracted Entities</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(entities).map(([key, val]) => (
                <div key={key}>
                  <h4 className="text-sm font-medium text-zinc-700 mb-2">{val.label}</h4>
                  <div className="space-y-1">
                    {val.items.slice(0, 8).map((item, i) => (
                      <span
                        key={i}
                        className="inline-block bg-emerald-50 text-emerald-700 text-xs px-2 py-1 rounded mr-1 mb-1"
                      >
                        {(item as Record<string, string>).name || (item as Record<string, string>).symbol}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 shrink-0">
              <h2 className="text-lg font-semibold text-zinc-800">Edit Paper Metadata</h2>
              <button onClick={() => setEditing(false)} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Title</label>
                <input
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Authors</label>
                <input
                  value={editForm.authors}
                  onChange={(e) => setEditForm((f) => ({ ...f, authors: e.target.value }))}
                  placeholder="Surname Forename, Surname Forename, ..."
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Journal</label>
                  <input
                    value={editForm.journal}
                    onChange={(e) => setEditForm((f) => ({ ...f, journal: e.target.value }))}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Year</label>
                  <input
                    value={editForm.year}
                    onChange={(e) => setEditForm((f) => ({ ...f, year: e.target.value }))}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">DOI</label>
                  <input
                    value={editForm.doi}
                    onChange={(e) => setEditForm((f) => ({ ...f, doi: e.target.value }))}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Abstract</label>
                <textarea
                  value={editForm.abstract}
                  onChange={(e) => setEditForm((f) => ({ ...f, abstract: e.target.value }))}
                  rows={8}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-200 shrink-0">
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-zinc-200 disabled:text-zinc-400 transition-colors flex items-center gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

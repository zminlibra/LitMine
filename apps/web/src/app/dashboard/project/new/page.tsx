"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const SOURCES = [
  { value: "arxiv", label: "arXiv" },
  { value: "pubmed", label: "PubMed" },
  { value: "biorxiv", label: "bioRxiv" },
  { value: "openalex", label: "OpenAlex" },
];

export default function NewProjectPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    description: "",
    keywords: "",
    sources: ["arxiv", "pubmed", "biorxiv", "openalex"],
    yearRangeStart: 2018,
    yearRangeEnd: 2025,
    maxPapers: 50,
  });
  const [submitting, setSubmitting] = useState(false);

  const toggleSource = (source: string) => {
    setForm((f) => ({
      ...f,
      sources: f.sources.includes(source)
        ? f.sources.filter((s) => s !== source)
        : [...f.sources, source],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Project name is required");
      return;
    }
    if (form.sources.length === 0) {
      toast.error("Select at least one source");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post("/api/v1/projects", {
        name: form.name,
        description: form.description || null,
        keywords: form.keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        sources: form.sources,
        year_range_start: form.yearRangeStart,
        year_range_end: form.yearRangeEnd,
        max_papers: form.maxPapers,
      });

      if (res.ok) {
        const data = await res.json();
        toast.success("Project created!");
        router.push(`/dashboard/project/${data.id}`);
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to create project");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <Card>
        <CardHeader>
          <CardTitle>New Literature Mining Project</CardTitle>
          <CardDescription>
            Define your research topic to start mining papers from academic databases.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Project Name *</label>
              <Input
                placeholder="e.g. CRISPR metabolic engineering in E. coli"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="Brief description of your research topic"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Keywords *</label>
              <Input
                placeholder="CRISPR-Cas9, genome editing, E. coli, metabolic engineering"
                value={form.keywords}
                onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                required
              />
              <p className="text-xs text-zinc-400">
                Separate keywords with commas. Use spaces for exact phrases (e.g. metabolic engineering, CRISPR-Cas9).
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Sources</label>
              <div className="flex gap-3">
                {SOURCES.map((src) => (
                  <label
                    key={src.value}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer text-sm ${
                      form.sources.includes(src.value)
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-zinc-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.sources.includes(src.value)}
                      onChange={() => toggleSource(src.value)}
                      className="hidden"
                    />
                    {src.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Year Start</label>
                <Input
                  type="number"
                  value={form.yearRangeStart}
                  onChange={(e) => setForm({ ...form, yearRangeStart: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Year End</label>
                <Input
                  type="number"
                  value={form.yearRangeEnd}
                  onChange={(e) => setForm({ ...form, yearRangeEnd: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Max Papers</label>
                <Input
                  type="number"
                  min={10}
                  max={200}
                  value={form.maxPapers}
                  onChange={(e) => setForm({ ...form, maxPapers: Number(e.target.value) })}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={submitting}
            >
              {submitting ? "Creating..." : "Create Project & Search"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

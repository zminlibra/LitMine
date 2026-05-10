"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2, Download, Sparkles } from "lucide-react";
import type { Report } from "@/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  callDeepSeek,
} from "@/lib/deepseek-client";
import { toast } from "sonner";

const LANG_OPTIONS = ["English", "Chinese", "Japanese", "Korean"] as const;
type Lang = (typeof LANG_OPTIONS)[number];

/* ── section color palette ── */
const SECTION_COLORS = [
  { bg: "bg-blue-50/40", border: "border-blue-200", accent: "bg-blue-500", title: "text-blue-800" },
  { bg: "bg-emerald-50/40", border: "border-emerald-200", accent: "bg-emerald-500", title: "text-emerald-800" },
  { bg: "bg-amber-50/40", border: "border-amber-200", accent: "bg-amber-500", title: "text-amber-800" },
  { bg: "bg-violet-50/40", border: "border-violet-200", accent: "bg-violet-500", title: "text-violet-800" },
  { bg: "bg-rose-50/40", border: "border-rose-200", accent: "bg-rose-500", title: "text-rose-800" },
];

/* ── split markdown into sections by ## heading ── */
interface Section {
  title: string;
  content: string;
}

function splitSections(md: string): Section[] {
  const sections: Section[] = [];
  const lines = md.split("\n");
  let current: Section | null = null;

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) {
      if (current) sections.push(current);
      current = { title: h2Match[1].trim(), content: "" };
      continue;
    }
    if (current) {
      current.content += line + "\n";
    }
  }
  if (current) sections.push(current);
  return sections;
}

/* ── detect if section 5 is the narrative review ── */
function isNarrativeSection(title: string): boolean {
  return /integrated.*review|introduction.*style|narrative/i.test(title);
}

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const reportId = params.reportId as string;

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  // Translation state
  const [contentEnglish, setContentEnglish] = useState<string | null>(null);
  const [translatedCache, setTranslatedCache] = useState<Partial<Record<Lang, string>>>({});
  const [displayLang, setDisplayLang] = useState<Lang>("English");
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    api.get(`/api/v1/reports/${reportId}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setReport(data);
          if (data.content_md) {
            setContentEnglish(data.content_md);
          }
        }
      })
      .finally(() => setLoading(false));
  }, [reportId]);

  const handleTranslate = useCallback(async (lang: Lang) => {
    if (!contentEnglish) return;
    if (lang === "English") {
      setDisplayLang("English");
      return;
    }
    if (translatedCache[lang]) {
      setDisplayLang(lang);
      return;
    }
    setTranslating(true);
    try {
      const result = await callDeepSeek([
        {
          role: "system",
          content: `You are a translator. Translate the following scientific literature review to ${lang}. Preserve ALL markdown formatting (## headers, bullet lists with -, tables, **bold**, *italic*, inline citations like [N]). Do NOT change the structure or add/remove content. Only translate the natural-language text. Output the translated text exactly in the same format.`,
        },
        { role: "user", content: contentEnglish },
      ], 0.1, 4000);
      setTranslatedCache((prev) => ({ ...prev, [lang]: result }));
      setDisplayLang(lang);
    } catch {
      toast.error("Translation failed");
    } finally {
      setTranslating(false);
    }
  }, [contentEnglish, translatedCache]);

  const displayContent = displayLang === "English"
    ? contentEnglish
    : (translatedCache[displayLang] ?? null);

  const sections = useMemo(() => {
    if (!displayContent) return [];
    return splitSections(displayContent);
  }, [displayContent]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <p className="text-zinc-500">Report not found.</p>
      </div>
    );
  }

  const handleExport = (fmt: "md" | "txt" = "md") => {
    if (!displayContent) return;
    const content = fmt === "txt"
      ? displayContent.replace(/[#*`\[\]]/g, "") // strip basic markdown for plain text
      : displayContent;
    const mime = fmt === "md" ? "text/markdown" : "text/plain";
    const ext = fmt === "md" ? ".md" : ".txt";
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.title.replace(/[/\\?%*:|"<>]/g, "-")}${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto p-8">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push(`/dashboard/project/${projectId}/report`)}
          className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to reports
        </button>
        <div className="flex items-center gap-3">
          {report.status === "completed" && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-500">Language:</label>
              <select
                value={displayLang}
                onChange={(e) => handleTranslate(e.target.value as Lang)}
                disabled={translating}
                className="px-2 py-1.5 border border-zinc-200 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
              >
                {LANG_OPTIONS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              {translating && (
                <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
              )}
            </div>
          )}
          {report.status === "completed" && (
            <select
              onChange={(e) => { if (e.target.value) handleExport(e.target.value as "md" | "txt"); e.target.value = ""; }}
              className="text-xs border border-zinc-200 rounded-lg px-3 py-2 bg-white text-zinc-700 focus:outline-none focus:border-emerald-400"
              defaultValue=""
            >
              <option value="" disabled>Export...</option>
              <option value="md">Markdown (.md)</option>
              <option value="txt">Plain Text (.txt)</option>
            </select>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">{report.title}</h1>
        <div className="flex items-center gap-3 mt-2">
          <span
            className={`text-xs px-2 py-1 rounded ${
              report.status === "completed"
                ? "bg-emerald-50 text-emerald-700"
                : report.status === "generating"
                ? "bg-amber-50 text-amber-700"
                : report.status === "failed"
                ? "bg-red-50 text-red-700"
                : "bg-zinc-100 text-zinc-600"
            }`}
          >
            {report.status}
          </span>
          {report.focus_areas && report.focus_areas.length > 0 && (
            <span className="text-xs text-zinc-500">
              Focus: {report.focus_areas.join(", ")}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      {report.status === "generating" || report.status === "pending" ? (
        <Card className="text-center py-16">
          <CardContent>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600 mb-4" />
            <p className="text-zinc-500">Generating your literature review...</p>
            <p className="text-xs text-zinc-400 mt-2">
              This typically takes 20-40 seconds depending on the number of papers.
            </p>
          </CardContent>
        </Card>
      ) : report.status === "failed" ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-8 text-center">
            <p className="text-red-700">Report generation failed.</p>
            <p className="text-sm text-red-500 mt-1">
              {report.content_md || "Unknown error occurred."}
            </p>
          </CardContent>
        </Card>
      ) : sections.length > 0 ? (
        <div className="space-y-5">
          {/* AI disclaimer */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50/50 rounded-lg border border-amber-100">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs text-amber-700">
              AI-generated review — verify before citing
            </span>
          </div>

          {/* Section cards */}
          {sections.map((section, idx) => {
            const isNarrative = isNarrativeSection(section.title);
            const colors = SECTION_COLORS[idx % SECTION_COLORS.length];

            if (isNarrative) {
              // Section 5: prose narrative with special styling
              return (
                <div key={idx} className="rounded-xl border-2 border-rose-200 bg-gradient-to-br from-rose-50/30 to-white overflow-hidden">
                  <div className="flex items-center gap-2 px-5 py-3 bg-rose-50/70 border-b border-rose-100">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    <h2 className="text-sm font-bold text-rose-800">
                      {section.title}
                    </h2>
                    <span className="text-[10px] text-rose-400 ml-auto font-medium">Ready to cite</span>
                  </div>
                  <div className="px-6 py-5">
                    <article className="report-content prose prose-zinc max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {section.content}
                      </ReactMarkdown>
                    </article>
                  </div>
                </div>
              );
            }

            // Standard section cards
            return (
              <div key={idx} className={`rounded-xl border ${colors.border} ${colors.bg} overflow-hidden`}>
                <div className="flex items-center gap-2 px-5 py-3 bg-white/60 border-b border-inherit">
                  <span className={`w-2 h-2 rounded-full ${colors.accent}`} />
                  <h2 className={`text-sm font-bold ${colors.title}`}>
                    {section.title}
                  </h2>
                </div>
                <div className="px-6 py-5">
                  <article className="report-content prose prose-zinc max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {section.content}
                    </ReactMarkdown>
                  </article>
                </div>
              </div>
            );
          })}
        </div>
      ) : displayContent ? (
        /* Fallback: render as plain prose if no sections detected */
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-50/50 border-b border-amber-100">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs text-amber-700">
              AI-generated review — verify before citing
            </span>
          </div>
          <div className="px-8 py-6">
            <article className="report-content prose prose-zinc max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
            </article>
          </div>
        </div>
      ) : (
        <Card className="text-center py-16">
          <CardContent>
            <p className="text-zinc-400">No content available.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

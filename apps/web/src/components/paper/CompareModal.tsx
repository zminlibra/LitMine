"use client";

import { useState, useCallback } from "react";
import { X, Table, Sparkles, Loader2, Copy, Check, ExternalLink } from "lucide-react";
import { callDeepSeek } from "@/lib/deepseek-client";
import type { Paper } from "@/types";
import { toast } from "sonner";

interface Props {
  papers: Paper[];
  onClose: () => void;
  onRemove: (paperId: string) => void;
}

type Tab = "basic" | "ai";

/* ── helpers ── */
function sourceBadgeClass(source: string) {
  return source === "arxiv" ? "bg-amber-50 text-amber-600" :
    source === "biorxiv" ? "bg-blue-50 text-blue-600" :
    source === "pubmed" ? "bg-cyan-50 text-cyan-600" :
    source === "openalex" ? "bg-violet-50 text-violet-600" :
    "bg-zinc-100 text-zinc-500";
}

interface ParsedSection {
  title: string;
  bullets: string[];
}

function parseAIResult(text: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const lines = text.split("\n");
  let current: ParsedSection | null = null;

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)/);
    if (h2Match) {
      if (current) sections.push(current);
      current = { title: h2Match[1].trim(), bullets: [] };
      continue;
    }
    const bulletMatch = line.match(/^([\-\*]|\d+\.)\s+(.+)/);
    if (bulletMatch && current) {
      current.bullets.push(bulletMatch[2].trim());
    }
  }
  if (current) sections.push(current);
  return sections;
}

const LANG_OPTIONS = ["English", "Chinese", "Japanese", "Korean"] as const;
type Lang = (typeof LANG_OPTIONS)[number];

const LANG_PROMPT: Record<Lang, string> = {
  English: "Output in English.",
  Chinese: "Output in Chinese (中文).",
  Japanese: "Output in Japanese (日本語).",
  Korean: "Output in Korean (한국어).",
};

function buildAIComparePrompt(papers: Paper[], lang: Lang): string {
  const paperTexts = papers.map((p, i) =>
    `Paper ${i + 1}: "${p.title}" (${p.year || "?"}, ${p.journal || "unknown"})\n` +
    `Authors: ${(p.authors || []).slice(0, 5).join(", ")}\n` +
    `Abstract: ${p.abstract || "No abstract available."}`
  ).join("\n---\n");

  return `You are a senior life-sciences researcher. Compare the following ${papers.length} papers deeply. ${LANG_PROMPT[lang]} Be concise and structured. Use markdown for formatting.

${paperTexts}

---

Output in these sections (use the exact headers). Each section MUST have at least 2 bullet points. Do NOT leave any section empty.

## High-Level Comparison
(One-paragraph overview: what question does each paper address? How do they relate or differ? 2-3 sentences, as a bullet list.)

## Methodology Comparison
(How do the experimental approaches differ? Compare chassis organisms, genetic tools, assays, computational methods. Reference each paper as **Paper 1**, **Paper 2**, etc. Use a bullet list, minimum 3 points.)

## Key Findings Comparison
(What did each paper find? Note similarities and contradictions. Reference each paper as **Paper 1**, **Paper 2**, etc. Use a bullet list, minimum 3 points.)

## Strengths & Limitations
(For each paper, give the strongest aspect and the most notable weakness. Reference each paper as **Paper 1**, **Paper 2**, etc. Use a bullet list, minimum 2 points.)

## Research Gap & Future Directions
(What gap emerges when these papers are read together? What would be a logical follow-up experiment? What specific technique or direction would bridge the gap? Use a bullet list, minimum 2 points.)`;
}

/* ── component ── */
/* ── AI result renderer ── */
// Section colors are assigned by position (index), not by title.
// This survives translation where the headers change language.
const SECTION_COLOR_KEYS = ["overview", "methods", "findings", "strengths", "gap"] as const;

const SECTION_COLORS: Record<string, { bg: string; border: string; text: string; bullet: string }> = {
  overview:  { bg: "bg-blue-50/50",    border: "border-blue-200",   text: "text-blue-900",   bullet: "bg-blue-400" },
  methods:   { bg: "bg-emerald-50/50", border: "border-emerald-200", text: "text-emerald-900", bullet: "bg-emerald-400" },
  findings:  { bg: "bg-amber-50/50",   border: "border-amber-200",  text: "text-amber-900",  bullet: "bg-amber-400" },
  strengths: { bg: "bg-violet-50/50",  border: "border-violet-200", text: "text-violet-900", bullet: "bg-violet-400" },
  gap:       { bg: "bg-rose-50/50",    border: "border-rose-200",   text: "text-rose-900",   bullet: "bg-rose-400" },
};

function AIComparisonResult({ rawText, papers, onCopy, copied }: {
  rawText: string; papers: Paper[]; onCopy: () => void; copied: boolean;
}) {
  const sections = parseAIResult(rawText);

  if (sections.length === 0) {
    return (
      <div className="whitespace-pre-wrap text-sm text-zinc-700 leading-relaxed">
        <RenderWithPills text={rawText} papers={papers} />
        <div className="mt-4"><CopyButton copied={copied} onClick={onCopy} /></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-zinc-400">AI-generated comparison — review for accuracy</span>
        <CopyButton copied={copied} onClick={onCopy} />
      </div>

      {/* ── Paper legend card ── */}
      <div className="mb-5 p-4 rounded-xl border border-zinc-200 bg-zinc-50">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Papers Compared</h3>
        <div className="space-y-1.5">
          {papers.map((p, i) => (
            <div key={p.id} className="flex items-start gap-2 text-sm">
              <span className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                P{i + 1}
              </span>
              <span className="text-zinc-700">{p.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section cards ── */}
      <div className="grid grid-cols-1 gap-4">
        {sections.map((section, idx) => {
          const colorKey = SECTION_COLOR_KEYS[idx] || "overview";
          const colors = SECTION_COLORS[colorKey] || SECTION_COLORS.overview;

          return (
            <div
              key={section.title}
              className={`rounded-xl border ${colors.border} ${colors.bg} p-5`}
            >
              <h3 className={`text-sm font-bold ${colors.text} mb-3 flex items-center gap-2`}>
                <span className={`w-1.5 h-1.5 rounded-full ${colors.bullet}`} />
                {section.title}
              </h3>
              <ul className="space-y-2.5">
                {section.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2 text-sm text-zinc-700 leading-relaxed">
                    <span className={`w-1 h-1 rounded-full ${colors.bullet} mt-2 shrink-0`} />
                    <span>
                      <RenderWithPills text={b} papers={papers} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Pill component ── */
function PaperPill({ n }: { n: number }) {
  return (
    <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold align-middle">
      P{n}
    </span>
  );
}

/* ── markdown + Paper pills → JSX fragments ── */
const PAPER_REF_PATTERNS = [
  /\*\*Paper (\d+)\*\*/g,
  /\*\*论文(\d+)\*\*/g,
  /\*\*論文(\d+)\*\*/g,
  /\*\*논문 (\d+)\*\*/g,
  /\[P(\d+)\]/g,       // [P1] backward compat
];

function RenderWithPills({ text, papers }: { text: string; papers: Paper[] }) {
  const pillMarkers: { idx: number; pill: React.ReactNode }[] = [];
  let withPills = text;

  for (const pattern of PAPER_REF_PATTERNS) {
    withPills = withPills.replace(pattern, (_full, num: string) => {
      const idx = pillMarkers.length;
      pillMarkers.push({ idx, pill: <PaperPill key={`pill-${idx}`} n={parseInt(num, 10)} /> });
      return `__PILL_${idx}__`;
    });
  }

  // Step 2: render remaining markdown (bold, italic, code)
  const parts: React.ReactNode[] = [];
  const regex = /(__PILL_(\d+)__)|(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(withPills)) !== null) {
    if (match.index > last) {
      parts.push(withPills.slice(last, match.index));
    }
    if (match[1]) {
      // Pill placeholder
      const pillIdx = parseInt(match[2], 10);
      const pill = pillMarkers.find((p) => p.idx === pillIdx);
      if (pill) parts.push(pill.pill);
      else parts.push(match[1]);
    } else if (match[3]) {
      parts.push(<strong key={match.index} className="font-semibold text-zinc-900">{match[4]}</strong>);
    } else if (match[5]) {
      parts.push(<em key={match.index} className="italic">{match[6]}</em>);
    } else if (match[7]) {
      parts.push(<code key={match.index} className="px-1 py-0.5 bg-zinc-200/60 rounded text-[12px] font-mono">{match[8]}</code>);
    }
    last = match.index + match[0].length;
  }
  if (last < withPills.length) {
    parts.push(withPills.slice(last));
  }

  return parts.length > 0 ? <>{parts}</> : <>{text}</>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">{children}</span>;
}

function CopyButton({ copied, onClick }: { copied: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function CompareModal({ papers, onClose, onRemove }: Props) {
  const [tab, setTab] = useState<Tab>("basic");
  const [expandedPaper, setExpandedPaper] = useState<string | null>(null);
  // Per-paper abstract translation state
  const [abstractTrans, setAbstractTrans] = useState<Partial<Record<string, Partial<Record<Lang, string>>>>>({});
  const [abstractTransLoading, setAbstractTransLoading] = useState<string | null>(null);
  const [abstractActiveLang, setAbstractActiveLang] = useState<Record<string, Lang>>({});
  const [aiLang, setAiLang] = useState<Lang>("English");
  // Always keep English original; displayLang tracks what the user is viewing
  const [aiResultEnglish, setAiResultEnglish] = useState<string | null>(null);
  const [translatedCache, setTranslatedCache] = useState<Partial<Record<Lang, string>>>({});
  const [displayLang, setDisplayLang] = useState<Lang>("English");
  const [aiLoading, setAiLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [copied, setCopied] = useState(false);

  // The currently shown result
  const aiResult = displayLang === "English"
    ? aiResultEnglish
    : (translatedCache[displayLang] ?? null);

  /* ── AI comparison ── */
  const startAICompare = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      // Always request in English for a clean canonical copy
      const result = await callDeepSeek([
        { role: "user", content: buildAIComparePrompt(papers, "English") },
      ], 0.4, 3000);
      setAiResultEnglish(result);
      setTranslatedCache({});
      setDisplayLang("English");
      // If user wanted non-English, auto-translate after analysis
      if (aiLang !== "English") {
        setTranslating(true);
        const translated = await callDeepSeek([
          { role: "system", content: `Translate the following text to ${aiLang}. Preserve ALL markdown formatting (**bold**, *italic*, bullet lists, ## headers, **Paper N** references). Only translate natural-language text.` },
          { role: "user", content: result },
        ], 0.1, 2000);
        setTranslatedCache({ [aiLang]: translated });
        setDisplayLang(aiLang);
        setTranslating(false);
      }
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg === "DEEPSEEK_QUOTA_EXHAUSTED") {
        setAiError("DeepSeek quota exhausted. Please top up or try later.");
      } else {
        setAiError(msg);
      }
    } finally {
      setAiLoading(false);
      setTranslating(false);
    }
  }, [papers, aiLang]);

  const handleSaveKey = () => {
    setShowKeyInput(false);
    startAICompare();
  };

  const handleTranslate = async (lang: Lang) => {
    setAiLang(lang);
    // English: just show the cached original, no translation needed
    if (lang === "English") {
      setDisplayLang("English");
      return;
    }
    // Already cached: instant switch
    if (translatedCache[lang]) {
      setDisplayLang(lang);
      return;
    }
    // Need to translate
    setTranslating(true);
    try {
      const result = await callDeepSeek([
        {
          role: "system",
          content: `You are a translator. Translate the following text to ${lang}. Preserve ALL markdown formatting (**bold**, *italic*, bullet lists with -, ## headers, **Paper N** references). Do NOT change the structure or add/remove content. Only translate the natural-language text. Output the translated text exactly in the same format.`,
        },
        { role: "user", content: aiResultEnglish! },
      ], 0.1, 2000);
      setTranslatedCache((prev) => ({ ...prev, [lang]: result }));
      setDisplayLang(lang);
    } catch {
      toast.error("Translation failed");
    } finally {
      setTranslating(false);
    }
  };

  /* ── translate a single paper's abstract ── */
  const translateAbstract = async (lang: Lang, paperId: string) => {
    const cached = abstractTrans[paperId]?.[lang];
    if (cached) return cached;
    setAbstractTransLoading(paperId);
    try {
      const paper = papers.find((p) => p.id === paperId);
      if (!paper?.abstract) return null;
      const result = await callDeepSeek([
        { role: "system", content: `Translate the following academic abstract to ${lang}. Keep all technical terms and gene/protein names in their original form. Output only the translated abstract, no preamble.` },
        { role: "user", content: paper.abstract },
      ], 0.1, 1500);
      const translated = result.trim();
      setAbstractTrans((prev) => ({
        ...prev,
        [paperId]: { ...(prev[paperId] || {}), [lang]: translated },
      }));
      return translated;
    } catch {
      toast.error("Translation failed");
      return null;
    } finally {
      setAbstractTransLoading(null);
    }
  };

  const handleCopy = async () => {
    if (!aiResult) return;
    await navigator.clipboard.writeText(aiResult);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[95vw] max-w-7xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-200 shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-zinc-800">Compare {papers.length} Papers</h2>
            {/* tabs */}
            <div className="flex items-center gap-1 bg-zinc-100 rounded-lg p-0.5">
              <button
                onClick={() => setTab("basic")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === "basic" ? "bg-white text-emerald-700 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                <Table className="h-3.5 w-3.5" /> Basic Info
              </button>
              <button
                onClick={() => setTab("ai")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === "ai" ? "bg-white text-emerald-700 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" /> AI Deep Compare
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* ── AI Tab ── */}
          {tab === "ai" && (
            <div>
              {aiLoading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mb-3" />
                  <p className="text-sm text-zinc-500">
                    {translating ? "Translating to your language..." : "DeepSeek is analyzing and comparing papers..."}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">This usually takes 10-20 seconds</p>
                </div>
              ) : aiError ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <p className="text-sm text-red-600">{aiError}</p>
                  <button
                    onClick={startAICompare}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ) : aiResult ? (
                <div>
                  <div className="flex items-center justify-end gap-3 mb-4">
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
                    {translating ? (
                      <span className="flex items-center gap-1 text-xs text-zinc-500">
                        <Loader2 className="h-3 w-3 animate-spin" /> Translating...
                      </span>
                    ) : (
                      <button
                        onClick={startAICompare}
                        className="px-3 py-1.5 text-zinc-500 hover:text-zinc-700 text-xs font-medium hover:bg-zinc-100 rounded-lg transition-colors"
                        title="Re-run full analysis"
                      >
                        Re-analyze
                      </button>
                    )}
                  </div>
                  <AIComparisonResult
                    rawText={aiResult}
                    papers={papers}
                    onCopy={() => handleCopy()}
                    copied={copied}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Sparkles className="h-10 w-10 text-emerald-300 mb-1" />
                  <p className="text-sm text-zinc-600">Deep AI-powered comparison across methodology, findings, and limitations</p>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-zinc-500">Language:</label>
                    <select
                      value={aiLang}
                      onChange={(e) => setAiLang(e.target.value as Lang)}
                      className="px-2 py-1.5 border border-zinc-200 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {LANG_OPTIONS.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={startAICompare}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
                  >
                    Start AI Comparison
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Basic Info Tab ── */}
          {tab === "basic" && (
            <div className="space-y-6">
              {/* Summary row — compact cards side by side */}
              <div className={`grid gap-4 ${papers.length <= 2 ? "grid-cols-2" : papers.length === 3 ? "grid-cols-3" : "grid-cols-2 lg:grid-cols-4"}`}>
                {papers.map((paper, pi) => (
                  <div
                    key={paper.id}
                    onClick={() => setExpandedPaper(expandedPaper === paper.id ? null : paper.id)}
                    className={`relative group rounded-xl border transition-all cursor-pointer ${
                      expandedPaper === paper.id
                        ? "border-emerald-400 bg-emerald-50/30 shadow-md"
                        : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"
                    }`}
                  >
                    {/* Compact card */}
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <PaperPill n={pi + 1} />
                        <button
                          onClick={(e) => { e.stopPropagation(); onRemove(paper.id); }}
                          className="p-0.5 rounded text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                          title="Remove"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <h4 className="text-sm font-semibold text-zinc-800 leading-snug line-clamp-3 mb-2">
                        {paper.title}
                      </h4>
                      <div className="flex items-center gap-2 mb-2">
                        {paper.journal && (
                          <span className="text-xs text-zinc-500 italic font-medium line-clamp-1">{paper.journal}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`uppercase text-[10px] font-medium px-1.5 py-0.5 rounded ${sourceBadgeClass(paper.source)}`}>
                          {paper.source}
                        </span>
                        {paper.year && <span className="text-xs text-zinc-400">{paper.year}</span>}
                      </div>
                      {paper.url && (
                        <a
                          href={paper.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 mt-3 text-xs text-emerald-600 hover:text-emerald-700 hover:underline font-medium"
                        >
                          <ExternalLink className="h-3 w-3" /> View original
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Expanded detail card */}
              {expandedPaper && (
                (() => {
                  const paper = papers.find((p) => p.id === expandedPaper);
                  if (!paper) return null;
                  const pi = papers.indexOf(paper);
                  const abstractTransForPaper = abstractTrans[paper.id] || {};
                  const activeLang = abstractActiveLang[paper.id] || "English";
                  const displayAbstract = activeLang === "English"
                    ? (paper.abstract || null)
                    : (abstractTransForPaper[activeLang] ?? null);
                  return (
                    <div className="rounded-xl border border-emerald-200 bg-white shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 bg-emerald-50/50 border-b border-emerald-200">
                        <div className="flex items-center gap-2.5">
                          <PaperPill n={pi + 1} />
                          <h4 className="text-sm font-semibold text-zinc-800">{paper.title}</h4>
                        </div>
                        <button onClick={() => setExpandedPaper(null)} className="p-1 rounded text-zinc-400 hover:text-zinc-600 transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="p-5 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Authors</Label>
                            <p className="text-sm text-zinc-600 leading-relaxed">
                              {paper.authors?.length ? paper.authors.join(", ") : <span className="text-zinc-400 italic">—</span>}
                            </p>
                          </div>
                          <div>
                            <Label>Journal / Year</Label>
                            <p className="text-sm text-zinc-600">
                              {paper.journal || "—"} {paper.year ? `(${paper.year})` : ""}
                            </p>
                          </div>
                          <div>
                            <Label>Source</Label>
                            <span className={`inline-block uppercase text-[11px] font-medium px-2 py-0.5 rounded ${sourceBadgeClass(paper.source)}`}>
                              {paper.source}
                            </span>
                          </div>
                          <div>
                            <Label>DOI</Label>
                            {paper.doi ? (
                              <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer"
                                className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline font-mono break-all">
                                {paper.doi}
                              </a>
                            ) : <span className="text-sm text-zinc-400 italic">—</span>}
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <Label>Abstract</Label>
                            <div className="flex items-center gap-1.5">
                              <select
                                value={activeLang}
                                onChange={async (e) => {
                                  const lang = e.target.value as Lang;
                                  setAbstractActiveLang((prev) => ({ ...prev, [paper.id]: lang }));
                                  if (lang !== "English" && !abstractTransForPaper[lang]) {
                                    await translateAbstract(lang, paper.id);
                                  }
                                }}
                                className="px-1.5 py-0.5 border border-zinc-200 rounded text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              >
                                {LANG_OPTIONS.map((l) => (
                                  <option key={l} value={l}>{l.slice(0, 2).toUpperCase()}</option>
                                ))}
                              </select>
                              {abstractTransLoading === paper.id && (
                                <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-zinc-600 leading-relaxed">
                            {displayAbstract || <span className="text-zinc-400 italic">No abstract available</span>}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

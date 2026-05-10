"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2, X } from "lucide-react";
import { callDeepSeek } from "@/lib/deepseek-client";
import type { AIAnalysisResult } from "@/types";
import { toast } from "sonner";

const SECTIONS: { key: keyof AIAnalysisResult; label: string; colorKey: string }[] = [
  { key: "summary", label: "Summary", colorKey: "blue" },
  { key: "coreContribution", label: "Core Contribution", colorKey: "emerald" },
  { key: "methodology", label: "Methodology", colorKey: "amber" },
  { key: "keyResults", label: "Key Results", colorKey: "violet" },
  { key: "keyTakeaways", label: "Key Takeaways", colorKey: "rose" },
  { key: "limitations", label: "Limitations", colorKey: "slate" },
  { key: "deepInsights", label: "Deep Insights", colorKey: "cyan" },
];

const COLOR_STYLES: Record<string, { bg: string; border: string; text: string; bullet: string }> = {
  blue:    { bg: "bg-blue-50/60",    border: "border-blue-200",   text: "text-blue-700",   bullet: "bg-blue-400" },
  emerald: { bg: "bg-emerald-50/60", border: "border-emerald-200",text: "text-emerald-700",bullet: "bg-emerald-400" },
  amber:   { bg: "bg-amber-50/60",   border: "border-amber-200",  text: "text-amber-700",  bullet: "bg-amber-400" },
  violet:  { bg: "bg-violet-50/60",  border: "border-violet-200", text: "text-violet-700", bullet: "bg-violet-400" },
  rose:    { bg: "bg-rose-50/60",    border: "border-rose-200",   text: "text-rose-700",   bullet: "bg-rose-400" },
  slate:   { bg: "bg-slate-50/60",   border: "border-slate-200",  text: "text-slate-700",  bullet: "bg-slate-400" },
  cyan:    { bg: "bg-cyan-50/60",    border: "border-cyan-200",   text: "text-cyan-700",   bullet: "bg-cyan-400" },
};

interface Props {
  title: string;
  abstract: string;
}

const LANG_NAMES: Record<string, string> = {
  "Chinese": "Chinese",
  "Japanese": "Japanese",
  "Korean": "Korean",
  "Spanish": "Spanish",
  "Italian": "Italian",
  "English": "English",
};

const LANG_LABELS: Record<string, string> = {
  "Chinese": "中文",
  "Japanese": "日本語",
  "Korean": "한국어",
  "Spanish": "Español",
  "Italian": "Italiano",
  "English": "English",
};

type Lang = keyof typeof LANG_LABELS;

function buildPrompt(title: string, abstract: string): { system: string; user: string } {
  return {
    system:
      "You are a senior researcher in the life sciences with expertise in deep academic analysis. Provide precise, direct, and professional analysis in English. No filler or boilerplate. All seven sections are mandatory.",
    user: `Analyze the following paper and output strictly in the seven-section format below, each preceded by "### ":

### Summary
(Summarize the paper's core finding or conclusion in one sentence, under 50 words)

### Core Contribution
(What problem does this study solve? What new method or finding does it present? 1-3 sentences, under 120 words. Do NOT use phrases like "this paper proposes...")

### Methodology
(What key experimental methods, genetic engineering approaches, chassis organisms, instruments, or computational tools were used? Under 150 words)

### Key Results
(Core data, performance metrics, yield/efficiency improvements, comparisons with existing methods. Under 150 words)

### Key Takeaways
(3-5 most important findings or conclusions, each as one sentence, numbered 1. 2. 3. format. Under 200 words)

### Limitations
(Study shortcomings: methodological limitations, scale restrictions, unresolved questions, application constraints. Under 120 words)

### Deep Insights
(Impact on the field, potential applications, future research directions or outlook. Under 150 words)

Paper Title: ${title}
${abstract ? `Abstract: ${abstract}` : "(No abstract available, analyze based on title only)"}

Output strictly in the seven-section format above. No preface, conclusion, or other content.`,
  };
}

function parseAnalysis(raw: string): AIAnalysisResult {
  const result: AIAnalysisResult = {
    summary: "",
    coreContribution: "",
    methodology: "",
    keyResults: "",
    keyTakeaways: "",
    limitations: "",
    deepInsights: "",
  };

  const labels: Record<string, keyof AIAnalysisResult> = {
    "Summary": "summary",
    "Core Contribution": "coreContribution",
    "Methodology": "methodology",
    "Key Results": "keyResults",
    "Key Takeaways": "keyTakeaways",
    "Limitations": "limitations",
    "Deep Insights": "deepInsights",
  };

  for (const [label, key] of Object.entries(labels)) {
    const pattern = new RegExp(`###\\s*${label}\\s*\\n([\\s\\S]*?)(?=\\n###\\s|$)`, "i");
    const match = raw.match(pattern);
    if (match) {
      result[key] = match[1].trim();
    }
  }

  if (Object.values(result).every((v) => !v)) {
    result.summary = raw.slice(0, 300).trim();
  }

  return result;
}

async function translateInsight(english: AIAnalysisResult, lang: Lang): Promise<AIAnalysisResult> {
  if (lang === "English") return english;
  const langName = LANG_NAMES[lang];

  // Combine all sections with clear delimiters that won't be translated
  const parts = SECTIONS.map((s, i) => `===SEC${i}===\n${english[s.key] || ""}`);
  const text = parts.join("\n\n");

  const translated = await callDeepSeek(
    [
      {
        role: "system",
        content: `Translate the following academic analysis to ${langName}. The text is divided by ===SEC0===, ===SEC1===, etc. markers. You MUST keep these markers EXACTLY as-is — do NOT translate or modify them. Translate only the content between markers. Keep all technical terms in original form.`,
      },
      { role: "user", content: text },
    ],
    0.1,
    4000,
  );

  // Parse sections back using markers
  const parsed: AIAnalysisResult = { ...english };
  for (let i = 0; i < SECTIONS.length; i++) {
    const marker = `===SEC${i}===`;
    const nextMarker = i < SECTIONS.length - 1 ? `===SEC${i + 1}===` : null;
    const start = translated.indexOf(marker);
    if (start !== -1) {
      const contentStart = start + marker.length;
      const end = nextMarker ? translated.indexOf(nextMarker) : translated.length;
      parsed[SECTIONS[i].key] = translated.slice(contentStart, end).trim();
    }
  }

  return parsed;
}

function renderMarkdown(text: string): React.ReactNode[] {
  // Render simple markdown: **bold**, *italic*, and combine consecutive text nodes
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/^(.*?)\*(.+?)\*/);

    if (boldMatch && (!italicMatch || boldMatch.index! <= italicMatch.index!)) {
      if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
      parts.push(<strong key={key++} className="font-semibold text-zinc-900">{boldMatch[2]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
    } else if (italicMatch) {
      if (italicMatch[1]) parts.push(<span key={key++}>{italicMatch[1]}</span>);
      parts.push(<em key={key++}>{italicMatch[2]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
    } else {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }
  }
  return parts;
}

function InsightItem({
  label,
  content,
  colorKey = "emerald",
}: {
  label: string;
  content: string;
  colorKey?: string;
}) {
  if (!content) return null;

  const colors = COLOR_STYLES[colorKey] || COLOR_STYLES.emerald;

  const lines = content.split("\n").filter(Boolean);
  const isList =
    lines.length >= 2 &&
    lines.every((l) => /^\s*(?:\d+[.)]\s|[-•]\s)/.test(l.trimStart()));

  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} p-5`}>
      <h3 className={`text-sm font-bold ${colors.text} mb-3 flex items-center gap-2`}>
        <span className={`w-1.5 h-1.5 rounded-full ${colors.bullet}`} />
        {label}
      </h3>
      {isList ? (
        <ul className="space-y-1.5">
          {lines.map((line, i) => (
            <li key={i} className="text-sm text-zinc-700 leading-relaxed flex gap-2">
              <span className={`w-1 h-1 rounded-full ${colors.bullet} mt-2 shrink-0`} />
              <span>{renderMarkdown(line.replace(/^\s*(?:\d+[.)]\s|[-•]\s)/, ""))}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-line">{renderMarkdown(content)}</p>
      )}
    </div>
  );
}

function SkeletonLoader() {
  return (
    <div className="rounded-xl border border-emerald-200 bg-gradient-to-b from-emerald-50/60 to-white p-6 mb-6 animate-pulse">
      <div className="flex items-center gap-2 mb-5">
        <Loader2 className="h-5 w-5 text-emerald-500 animate-spin" />
        <h3 className="text-lg font-semibold text-zinc-800">Analyzing...</h3>
      </div>
      <div className="space-y-4">
        {SECTIONS.map((s) => (
          <div key={s.key} className={`rounded-xl border ${COLOR_STYLES[s.colorKey].border} ${COLOR_STYLES[s.colorKey].bg} p-5`}>
            <div className={`h-3 rounded w-28 mb-2 ${COLOR_STYLES[s.colorKey].bullet} opacity-40`} />
            <div className="h-3 bg-zinc-200 rounded w-full mb-1.5" />
            <div className="h-3 bg-zinc-200 rounded w-5/6 mb-1.5" />
            <div className="h-3 bg-zinc-200 rounded w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnalysisPanel({ title, abstract }: Props) {
  // English = canonical, always kept. displayLang = what user is viewing.
  const [englishResult, setEnglishResult] = useState<AIAnalysisResult | null>(null);
  const [translatedCache, setTranslatedCache] = useState<Partial<Record<Lang, AIAnalysisResult>>>({});
  const [displayLang, setDisplayLang] = useState<Lang>("English");
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayResult: AIAnalysisResult | null =
    displayLang === "English" ? englishResult : (translatedCache[displayLang] ?? englishResult);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setEnglishResult(null);
    setTranslatedCache({});
    try {
      const { system, user } = buildPrompt(title, abstract);
      const content = await callDeepSeek([{ role: "system", content: system }, { role: "user", content: user }], 0.5, 3000);
      const parsed = parseAnalysis(content);
      setEnglishResult(parsed);

      // If user chose non-English, auto-translate after analysis
      if (displayLang !== "English") {
        setTranslating(true);
        try {
          const translated = await translateInsight(parsed, displayLang);
          setTranslatedCache({ [displayLang]: translated });
        } catch { toast.error("Auto-translation failed"); }
        setTranslating(false);
      }
    } catch (e: unknown) {
      const msg = (e as Error).message || "";
      if (msg === "DEEPSEEK_QUOTA_EXHAUSTED") { setError("API quota exhausted."); }
      else { setError(`Analysis failed: ${msg.slice(0, 120)}`); }
    } finally {
      setLoading(false);
    }
  };

  const handleLangChange = async (lang: Lang) => {
    setDisplayLang(lang);
    if (lang === "English") return;
    if (translatedCache[lang] || !englishResult) return;
    setTranslating(true);
    try {
      const translated = await translateInsight(englishResult, lang);
      setTranslatedCache((prev) => ({ ...prev, [lang]: translated }));
    } catch {
      toast.error("Translation failed");
      setDisplayLang("English");
    } finally {
      setTranslating(false);
    }
  };

  const handleReset = () => {
    setEnglishResult(null);
    setTranslatedCache({});
  };

  // --- Loading ---
  if (loading) return <SkeletonLoader />;

  // --- Result ---
  if (displayResult) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/40 to-white p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-500" />
            <h3 className="text-lg font-semibold text-zinc-800">AI Analysis</h3>
          </div>
          <button onClick={handleReset} className="p-1.5 rounded text-zinc-400 hover:text-zinc-500" title="Reset analysis">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</p>}
        <div className="space-y-4">
          {SECTIONS.map((s) => (
            <InsightItem key={s.key} label={s.label} content={displayResult[s.key]} colorKey={s.colorKey} />
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center gap-3">
          <select value={displayLang} onChange={(e) => handleLangChange(e.target.value as Lang)}
            disabled={translating}
            className="text-xs border border-zinc-200 rounded-lg px-2 py-1.5 bg-white text-zinc-600 focus:outline-none focus:border-emerald-400 disabled:opacity-50">
            {Object.entries(LANG_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {translating ? (
            <span className="flex items-center gap-1 text-xs text-zinc-500"><Loader2 className="h-3 w-3 animate-spin" /> Translating...</span>
          ) : (
            <button onClick={handleAnalyze}
              className="text-xs font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors">
              Re-analyze
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- Default ---
  return (
    <div className="rounded-xl border border-emerald-200 bg-gradient-to-b from-emerald-50/60 to-white p-6 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-5 w-5 text-emerald-500" />
        <h3 className="text-lg font-semibold text-zinc-800">AI Analysis</h3>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</p>}
      <p className="text-sm text-zinc-500 mb-4">
        Analyze this paper across 7 dimensions. Powered by DeepSeek AI.
      </p>
      <div className="flex items-center gap-3">
        <select value={displayLang} onChange={(e) => setDisplayLang(e.target.value as Lang)}
          className="text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-white text-zinc-700 focus:outline-none focus:border-emerald-400">
          {Object.entries(LANG_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button onClick={handleAnalyze}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" /> Analyze
        </button>
      </div>
    </div>
  );
}

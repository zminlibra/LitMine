"use client";

import { useState } from "react";
import { Languages, Loader2, Check } from "lucide-react";
import { callDeepSeek } from "@/lib/deepseek-client";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

const LANGUAGES: Record<string, string> = {
  "Chinese": "Chinese",
  "Japanese": "Japanese",
  "Korean": "Korean",
  "Spanish": "Spanish",
  "Italian": "Italian",
};

const LANG_LABELS: Record<string, string> = {
  "Chinese": "中文",
  "Japanese": "日本語",
  "Korean": "한국어",
  "Spanish": "Español",
  "Italian": "Italiano",
};

type Lang = keyof typeof LANG_LABELS;

interface Props {
  paperId: string;
  title: string;
  abstract: string;
  cachedTitleCn?: string | null;
  cachedAbstractCn?: string | null;
}

async function translateText(text: string, lang: Lang): Promise<string> {
  if (lang === "English") return text;
  const langName = LANGUAGES[lang];
  const content = await callDeepSeek(
    [
      {
        role: "system",
        content: `You are an academic translator. Translate the following text to ${langName}. Keep ALL technical terms, gene/protein/species names in original form. Output ONLY the translation.`,
      },
      { role: "user", content: text },
    ],
    0.1,
    2000,
  );
  return content.trim();
}

export function TranslationPanel({ paperId, title, abstract, cachedTitleCn, cachedAbstractCn }: Props) {
  const [displayLang, setDisplayLang] = useState<Lang>(
    cachedTitleCn && cachedAbstractCn ? "Chinese" : "English"
  );
  const [englishTitle] = useState(title);
  const [englishAbstract] = useState(abstract);

  // Translations by language: partial<Record<Lang, {title, abstract}>>
  const [cache, setCache] = useState<Partial<Record<Lang, { title: string; abstract: string }>>>(() => {
    if (cachedTitleCn && cachedAbstractCn) {
      return { Chinese: { title: cachedTitleCn, abstract: cachedAbstractCn } };
    }
    return {};
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayTranslation = displayLang === "English"
    ? { title: englishTitle, abstract: englishAbstract }
    : cache[displayLang] ?? cache.Chinese ?? null;

  const handleTranslate = async (lang: Lang) => {
    setDisplayLang(lang);
    if (lang === "English") return;
    if (cache[lang]) return;

    setLoading(true);
    setError(null);
    try {
      const [ttl, abs] = await Promise.all([
        translateText(englishTitle, lang),
        translateText(englishAbstract, lang),
      ]);
      setCache((prev) => ({ ...prev, [lang]: { title: ttl, abstract: abs } }));

      // Persist Chinese to backend
      if (lang === "Chinese") {
        try {
          await api.post(`/api/v1/papers/${paperId}/translation`, {
            title_cn: ttl,
            abstract_cn: abs,
          });
        } catch { /* non-blocking */ }
      }
    } catch (e: unknown) {
      const msg = (e as Error).message || "";
      if (msg === "DEEPSEEK_QUOTA_EXHAUSTED") {
        setError("API quota exhausted.");
      } else {
        toast.error(`Translation failed: ${msg.slice(0, 100)}`);
      }
      setDisplayLang("English");
    } finally {
      setLoading(false);
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="rounded-xl border border-indigo-100 bg-gradient-to-b from-indigo-50/40 to-white p-6 mb-6 animate-pulse">
        <div className="flex items-center gap-2 mb-4">
          <Loader2 className="h-5 w-5 text-indigo-500 animate-spin" />
          <h3 className="text-lg font-semibold text-zinc-800">Translating...</h3>
          <span className="text-xs text-indigo-400 bg-indigo-100 px-2 py-0.5 rounded-full font-medium ml-2">{LANG_LABELS[displayLang] || displayLang}</span>
        </div>
        <div className="space-y-3">
          <div><div className="h-4 bg-indigo-100 rounded w-2/3 mb-2" /><div className="h-3 bg-zinc-100 rounded w-1/2 mb-1" /><div className="h-3 bg-zinc-100 rounded w-full mb-1" /><div className="h-3 bg-zinc-100 rounded w-5/6" /></div>
          <div><div className="h-3 bg-indigo-100 rounded w-1/4 mb-2" /><div className="h-3 bg-zinc-100 rounded w-full mb-1" /><div className="h-3 bg-zinc-100 rounded w-full mb-1" /><div className="h-3 bg-zinc-100 rounded w-4/5" /></div>
        </div>
      </div>
    );
  }

  // Result or default
  return (
    <div className="rounded-xl border border-indigo-100 bg-gradient-to-b from-indigo-50/40 to-white p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {displayTranslation && displayLang !== "English" ? (
            <Check className="h-5 w-5 text-indigo-500" />
          ) : (
            <Languages className="h-5 w-5 text-indigo-500" />
          )}
          <h3 className="text-lg font-semibold text-zinc-800">Translation</h3>
          {displayLang !== "English" && (
            <span className="text-xs text-indigo-400 bg-indigo-100 px-2 py-0.5 rounded-full font-medium">{LANG_LABELS[displayLang]}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={displayLang}
            onChange={(e) => handleTranslate(e.target.value as Lang)}
            className="text-xs border border-zinc-200 rounded-lg px-2 py-1.5 bg-white text-zinc-600 focus:outline-none focus:border-indigo-400"
          >
            <option value="English">Original (EN)</option>
            {Object.entries(LANG_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</p>}

      {displayTranslation ? (
        <div className="space-y-3">
          <div><p className="text-sm font-semibold italic text-zinc-800">{displayTranslation.title}</p></div>
          {displayTranslation.abstract && (
            <div>
              <p className="text-[11px] font-medium text-indigo-400 uppercase tracking-wide mb-1">Translated Abstract</p>
              <p className="text-sm text-zinc-600 leading-relaxed">{displayTranslation.abstract}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Select a language to translate.</p>
      )}
    </div>
  );
}

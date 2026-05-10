"use client";

import { X, ExternalLink } from "lucide-react";
import type { GraphNode } from "@/types";

interface Props {
  node: GraphNode | null;
  onClose: () => void;
  onViewPaper: (paperId: string) => void;
}

export default function GraphSidebar({ node, onClose, onViewPaper }: Props) {
  if (!node) {
    return (
      <div className="w-72 shrink-0 border-l border-zinc-200 bg-white p-4 flex items-center justify-center">
        <p className="text-sm text-zinc-400 text-center">
          Click a paper node to see details
        </p>
      </div>
    );
  }

  const title = (node.properties?.title as string) || node.label || "";
  const authors = (node.properties?.authors as string[]) || [];
  const year = node.properties?.year as number | undefined;
  const source = node.properties?.source as string | undefined;

  return (
    <div className="w-72 shrink-0 border-l border-zinc-200 bg-white p-4 overflow-y-auto">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-800 line-clamp-3 flex-1">
          {title}
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded text-zinc-400 hover:text-zinc-600 shrink-0 ml-1"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {authors.length > 0 && (
        <p className="text-xs text-zinc-500 mb-1">{authors.join(", ")}</p>
      )}

      <div className="flex items-center gap-2 mb-3 text-xs text-zinc-400">
        {year && <span>{year}</span>}
        {source && (
          <span className={`uppercase font-medium px-1.5 py-0.5 rounded ${
            source === "arxiv" ? "bg-amber-50 text-amber-600" :
            source === "biorxiv" ? "bg-blue-50 text-blue-600" :
            source === "pubmed" ? "bg-cyan-50 text-cyan-600" :
            source === "openalex" ? "bg-violet-50 text-violet-600" :
            "bg-zinc-100 text-zinc-500"
          }`}>{source}</span>
        )}
      </div>

      <button
        onClick={() => onViewPaper(node.id)}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
      >
        <ExternalLink className="h-3.5 w-3.5" /> View Paper Details
      </button>
    </div>
  );
}

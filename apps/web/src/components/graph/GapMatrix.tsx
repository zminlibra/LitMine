"use client";

import { useMemo, useState, useCallback } from "react";
import { CircleDot } from "lucide-react";
import type { GapItem } from "@/types";

interface GapMatrixProps {
  gaps: GapItem[];
  paperCount?: number;
}

/** Laplace-smoothed gap score: 1 - (co_occurrence + 1) / (min(a_papers, b_papers) + 1)
 *  Matches the backend formula. Never saturates at 1.0,
 *  differentiates pairs with identical zero co-occurrence but different paper volume. */
function computeOpportunity(gap: GapItem): number {
  const minCount = Math.min(gap.concept_a_papers, gap.concept_b_papers);
  if (minCount <= 0) return 1;
  return 1 - (gap.co_occurrence + 1) / (minCount + 1);
}

export default function GapMatrix({ gaps, paperCount }: GapMatrixProps) {
  const [selectedCell, setSelectedCell] = useState<{
    conceptA: string;
    conceptB: string;
    gap: GapItem;
  } | null>(null);

  const { concepts, matrix } = useMemo(() => {
    if (!gaps || gaps.length === 0) return { concepts: [] as string[], matrix: [] };

    // Extract unique concepts from both concept_a and concept_b
    const conceptSet = new Set<string>();
    const gapMap = new Map<string, GapItem>();

    for (const gap of gaps) {
      conceptSet.add(gap.concept_a);
      conceptSet.add(gap.concept_b);
      const key = `${gap.concept_a}::${gap.concept_b}`;
      gapMap.set(key, gap);
    }

    // Take top 8 concepts by how many gaps they appear in
    const conceptFreq = new Map<string, number>();
    for (const gap of gaps) {
      conceptFreq.set(gap.concept_a, (conceptFreq.get(gap.concept_a) ?? 0) + 1);
      conceptFreq.set(gap.concept_b, (conceptFreq.get(gap.concept_b) ?? 0) + 1);
    }

    const topConcepts = Array.from(conceptSet)
      .sort((a, b) => (conceptFreq.get(b) ?? 0) - (conceptFreq.get(a) ?? 0))
      .slice(0, 8);

    // Build matrix rows
    const rows = topConcepts.map((conceptA) => ({
      conceptA,
      cells: topConcepts.map((conceptB) => {
        const keyAB = `${conceptA}::${conceptB}`;
        const keyBA = `${conceptB}::${conceptA}`;
        const gap = gapMap.get(keyAB) ?? gapMap.get(keyBA);
        if (gap) {
          return {
            exists: true as const,
            opportunity: gap.gap_score ?? computeOpportunity(gap),
            gap,
          };
        }
        return {
          exists: false as const,
          opportunity: 0,
          gap: null,
        };
      }),
    }));

    return { concepts: topConcepts, matrix: rows };
  }, [gaps]);

  const handleCellClick = useCallback(
    (conceptA: string, conceptB: string, gap: GapItem | null) => {
      if (!gap) return;
      if (
        selectedCell?.conceptA === conceptA &&
        selectedCell?.conceptB === conceptB
      ) {
        setSelectedCell(null);
        return;
      }
      setSelectedCell({ conceptA, conceptB, gap });
    },
    [selectedCell],
  );

  if (!gaps || gaps.length === 0) {
    const isInsufficientData = paperCount !== undefined && paperCount < 5;
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-amber-200 bg-amber-50/50">
        <CircleDot className="h-10 w-10 text-amber-300" />
        <p className="text-sm text-amber-700 font-medium">
          {isInsufficientData ? "Insufficient data" : "No research gaps identified"}
        </p>
        <p className="text-xs text-amber-600">
          {isInsufficientData
            ? "Add more papers (≥5) to enable gap analysis."
            : "Try adding papers from different research areas to surface gaps."}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      {/* Scrollable matrix */}
      <div className="overflow-x-auto rounded-lg border border-emerald-100 dark:border-emerald-800/50">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="bg-emerald-50/80 p-2 dark:bg-emerald-950/40" />
              {concepts.map((concept) => (
                <th
                  key={concept}
                  className="max-w-32 bg-emerald-50/80 px-2 py-1.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                  title={concept}
                >
                  <span className="line-clamp-2">{concept}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, rowIdx) => (
              <tr key={row.conceptA}>
                <td
                  className="max-w-32 bg-emerald-50/80 px-2 py-1.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                  title={row.conceptA}
                >
                  <span className="line-clamp-2">{row.conceptA}</span>
                </td>
                {row.cells.map((cell, colIdx) => {
                  const conceptB = concepts[colIdx];
                  const isSame = row.conceptA === conceptB;
                  const opportunity = cell.opportunity;

                  // Build background color: opacity 0 = no gap, opacity 1 = highest opportunity
                  const isSelected =
                    selectedCell?.conceptA === row.conceptA &&
                    selectedCell?.conceptB === conceptB;
                  const alpha = isSame ? 0 : opportunity;

                  let bgStyle: React.CSSProperties = {};
                  if (isSame) {
                    bgStyle = { backgroundColor: "rgba(0,0,0,0.03)" };
                  } else if (cell.exists) {
                    // HSL continuous gradient: blue (low) → green → yellow → red (high)
                    const hue = 220 - alpha * 220;
                    bgStyle = { backgroundColor: `hsl(${hue}, 75%, 50%)` };
                  }

                  const textColor = cell.exists && opportunity > 0.4 ? "text-white" : "text-zinc-700";
                  const cellContent = cell.exists ? (
                    <span className={`text-center text-xs tabular-nums ${textColor}`}>
                      {cell.gap!.concept_a_papers} | {cell.gap!.concept_b_papers}
                    </span>
                  ) : (
                    <span className="text-center text-xs text-gray-300 dark:text-gray-600">
                      &middot;
                    </span>
                  );

                  return (
                    <td
                      key={`${row.conceptA}-${conceptB}`}
                      className={`border p-2 text-center transition-all hover:shadow-md ${
                        isSelected
                          ? "shadow-[inset_0_0_0_2px_white,0_8px_16px_-4px_rgba(0,0,0,0.2)] ring-[6px] ring-emerald-500 scale-105 z-10 relative"
                          : "border-zinc-200/50"
                      } ${
                        cell.exists ? "cursor-pointer" : "cursor-default"
                      }`}
                      style={bgStyle}
                      onClick={() =>
                        handleCellClick(row.conceptA, conceptB, cell.gap)
                      }
                    >
                      {cellContent}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Color scale legend */}
      <div className="flex items-end gap-1.5">
        <span className="text-[10px] text-zinc-400 pb-2.5">0%</span>
        <div className="relative w-52">
          <div className="h-3 w-full rounded-full overflow-hidden" style={{
            background: "linear-gradient(to right, hsl(220,75%,50%), hsl(140,75%,50%), hsl(55,75%,50%), hsl(0,75%,50%))",
          }} />
          {[20,40,60,80].map((pct) => (
            <div key={pct} className="absolute top-0 -translate-x-1/2" style={{ left: `${pct}%` }}>
              <span className="text-[10px] text-zinc-400 leading-none block -mt-3.5">{pct}</span>
              <div className="h-3 w-px bg-white/70" />
            </div>
          ))}
        </div>
        <span className="text-[10px] text-zinc-400 pb-2.5">100%</span>
      </div>

      {/* Detail popover */}
      {selectedCell && selectedCell.gap && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/50">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              {selectedCell.conceptA} &harr; {selectedCell.conceptB}
            </h4>
            <button
              type="button"
              onClick={() => setSelectedCell(null)}
              className="text-emerald-500 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-200"
              aria-label="Close detail"
            >
              <CircleDot className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                &ldquo;{selectedCell.conceptA}&rdquo; papers
              </span>
              <p className="text-lg font-bold tabular-nums text-emerald-800 dark:text-emerald-200">
                {selectedCell.gap.concept_a_papers}
              </p>
            </div>
            <div>
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                &ldquo;{selectedCell.conceptB}&rdquo; papers
              </span>
              <p className="text-lg font-bold tabular-nums text-emerald-800 dark:text-emerald-200">
                {selectedCell.gap.concept_b_papers}
              </p>
            </div>
          </div>
          <div className="mt-2 space-y-1 text-xs text-emerald-700 dark:text-emerald-400">
            <p>
              Gap opportunity score:{" "}
              <span className="font-semibold">
                {((selectedCell.gap.gap_score ?? computeOpportunity(selectedCell.gap)) * 100).toFixed(0)}%
              </span>
            </p>
            <p>Co-occurring papers: {selectedCell.gap.co_occurrence ?? "—"}</p>
            <p>A larger score suggests a more underexplored intersection.</p>
          </div>
        </div>
      )}
    </div>
  );
}

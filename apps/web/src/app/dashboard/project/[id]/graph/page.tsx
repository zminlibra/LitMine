"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { ArrowLeft, Loader2, BarChart3, Grid3X3 } from "lucide-react";
import dynamic from "next/dynamic";
import type { HotspotItem, GapItem } from "@/types";

const HotspotBarChart = dynamic(() => import("@/components/graph/HotspotBarChart"), { ssr: false });
const GapMatrix = dynamic(() => import("@/components/graph/GapMatrix"), { ssr: false });

type ViewMode = "hotspot" | "gaps";

const VIEW_MODES: { key: ViewMode; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { key: "hotspot", label: "Hotspots", icon: BarChart3, description: "What is everyone working on?" },
  { key: "gaps", label: "Research Gaps", icon: Grid3X3, description: "Where are the underexplored areas?" },
];

export default function GraphPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [viewMode, setViewMode] = useState<ViewMode>("hotspot");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [hotspots, setHotspots] = useState<HotspotItem[]>([]);
  const [gaps, setGaps] = useState<GapItem[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [hotspotRes, gapRes] = await Promise.all([
          api.get(`/api/v1/projects/${projectId}/graph/hotspots`),
          api.get(`/api/v1/projects/${projectId}/graph/gaps`),
        ]);

        if (hotspotRes.ok) {
          const hd = await hotspotRes.json();
          setHotspots(hd.hotspots || []);
        }
        if (gapRes.ok) {
          const gd = await gapRes.json();
          setGaps(Array.isArray(gd) ? gd : []);
        }
      } catch {
        setError("Failed to load analytics. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-zinc-500">{error}</p>
      </div>
    );
  }

  const currentMode = VIEW_MODES.find((m) => m.key === viewMode);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/dashboard/project/${projectId}`)}
            className="text-zinc-400 hover:text-zinc-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold text-zinc-800">Research Analytics</h1>
        </div>

        <div className="flex items-center gap-1 bg-zinc-100 rounded-lg p-1">
          {VIEW_MODES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setViewMode(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === key
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {currentMode && (
          <p className="text-sm text-zinc-500 mb-6">{currentMode.description}</p>
        )}

        {viewMode === "hotspot" && (
          <section>
            <h2 className="text-base font-semibold text-zinc-800 mb-4">Research Hotspots</h2>
            {hotspots.length > 0 ? (
              <HotspotBarChart hotspots={hotspots} />
            ) : (
              <p className="text-sm text-zinc-400">Not enough data yet. Add more papers to see hotspot trends.</p>
            )}
          </section>
        )}

        {viewMode === "gaps" && (
          <section>
            <h2 className="text-base font-semibold text-zinc-800 mb-4">Research Gap Matrix</h2>
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              Gaps identified by automated term co-occurrence analysis. Some gaps may reflect data coverage limitations rather than true research opportunities.
            </p>
            {gaps.length > 0 ? (
              <GapMatrix gaps={gaps} />
            ) : (
              <p className="text-sm text-zinc-400">Not enough data to identify gaps. Add more papers to enable gap analysis.</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

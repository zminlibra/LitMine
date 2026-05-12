"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { BarChart3 } from "lucide-react";
import type { HotspotItem } from "@/types";

interface HotspotBarChartProps {
  hotspots: HotspotItem[];
}

// Color cells by trend: blue (cooling/stable) → emerald → amber → red (surging)
function trendColor(trend: number): string {
  if (trend <= 0.05) return "rgb(59,130,246)";    // blue — cooling
  if (trend <= 0.15) return "rgb(16,185,129)";    // green — stable
  if (trend <= 0.30) return "rgb(245,158,11)";    // amber — warming
  return "rgb(239,68,68)";                         // red — surging
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: HotspotItem }>;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const { name, frequency, recent_freq, avg_year, trend } = payload[0].payload;
  const label = trend >= 0.3 ? "Surging" : trend >= 0.15 ? "Warming" : trend >= 0.05 ? "Stable" : "Cooling";
  return (
    <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2 shadow-md">
      <p className="text-sm font-semibold text-zinc-900">{name}</p>
      <div className="text-xs text-zinc-600 mt-1 space-y-0.5">
        <p>Total: {frequency} papers ({recent_freq} recent)</p>
        <p>Avg year: {avg_year.toFixed(1)}</p>
        <p className="font-medium" style={{ color: trendColor(trend) }}>
          Trend: {label} ({(trend * 100).toFixed(0)}%)
        </p>
      </div>
    </div>
  );
}

export default function HotspotBarChart({ hotspots }: HotspotBarChartProps) {
  const data = useMemo(() => {
    if (!hotspots || hotspots.length === 0) return [];
    return [...hotspots]
      .sort((a, b) => (b.trend ?? 0) - (a.trend ?? 0))
      .slice(0, 12);
  }, [hotspots]);

  if (!hotspots || hotspots.length === 0) {
    return (
      <div className="flex h-[300px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-amber-200 bg-amber-50/50">
        <BarChart3 className="h-10 w-10 text-amber-300" />
        <p className="text-sm text-amber-700 font-medium">Insufficient data</p>
        <p className="text-xs text-amber-600">Add more papers (≥5) to enable trend analysis.</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Legend */}
      <div className="flex items-center gap-3 mb-3 text-[11px] text-zinc-500">
        <span>Sorted by trend momentum</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background: "rgb(59,130,246)"}} />Cooling</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background: "rgb(16,185,129)"}} />Stable</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background: "rgb(245,158,11)"}} />Warming</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background: "rgb(239,68,68)"}} />Surging</span>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 40, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
          <XAxis type="number" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={{ stroke: "#e5e7eb" }} tickLine={false} />
          <YAxis type="category" dataKey="name" width={180} interval={0}
            tick={{ fontSize: 12, fill: "#374151", width: 170 }}
            axisLine={false} tickLine={false}
            tickFormatter={(v: string) => v.length > 28 ? v.slice(0, 26) + "..." : v}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(5, 150, 105, 0.06)" }} />
          <Bar dataKey="frequency" radius={[0, 6, 6, 0]} barSize={20}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={trendColor(entry.trend ?? 0)} />
            ))}
            <LabelList dataKey="frequency" position="right"
              style={{ fontSize: 12, fill: "#374151", fontWeight: 500 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

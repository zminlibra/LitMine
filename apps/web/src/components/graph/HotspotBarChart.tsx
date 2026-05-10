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

const EMERALD_GRADIENT_ID = "emeraldGradient";

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: HotspotItem }>;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const { name, frequency, avg_year } = payload[0].payload;
  return (
    <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2 shadow-md dark:border-emerald-800 dark:bg-emerald-950">
      <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
        {name}
      </p>
      <p className="text-xs text-emerald-700 dark:text-emerald-400">
        Frequency: {frequency}
      </p>
      <p className="text-xs text-emerald-600 dark:text-emerald-500">
        Avg. Year: {avg_year.toFixed(1)}
      </p>
    </div>
  );
}

export default function HotspotBarChart({ hotspots }: HotspotBarChartProps) {
  const data = useMemo(() => {
    if (!hotspots || hotspots.length === 0) return [];
    return [...hotspots]
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 15);
  }, [hotspots]);

  if (!hotspots || hotspots.length === 0) {
    return (
      <div className="flex h-[300px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30">
        <BarChart3 className="h-10 w-10 text-emerald-300 dark:text-emerald-700" />
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          No hotspot data available
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 40, left: 20, bottom: 5 }}
        >
          <defs>
            <linearGradient
              id={EMERALD_GRADIENT_ID}
              x1="0"
              y1="0"
              x2="1"
              y2="0"
            >
              <stop offset="0%" stopColor="#064e3b" stopOpacity={0.85} />
              <stop offset="50%" stopColor="#059669" stopOpacity={0.85} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0.85} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={false}
            stroke="#d1d5db"
          />
          <XAxis
            type="number"
            tick={{ fontSize: 12, fill: "#6b7280" }}
            axisLine={{ stroke: "#d1d5db" }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fontSize: 12, fill: "#374151" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(5, 150, 105, 0.08)" }}
          />
          <Bar dataKey="frequency" radius={[0, 6, 6, 0]} barSize={20}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={`url(#${EMERALD_GRADIENT_ID})`} />
            ))}
            <LabelList
              dataKey="frequency"
              position="right"
              style={{
                fontSize: 12,
                fill: "#065f46",
                fontWeight: 500,
              }}
              formatter={(value) => `${value}`}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

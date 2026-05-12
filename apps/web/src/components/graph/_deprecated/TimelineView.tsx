"use client";

import { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Clock } from "lucide-react";
import type { MethodEvolutionItem } from "@/types";

interface TimelineViewProps {
  methodTimeline: MethodEvolutionItem[];
}

interface BubbleData {
  x: number;
  y: number;
  z: number;
  method: string;
  evolvedFrom: string | null;
  firstUse: number;
  adoptionCount: number;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: BubbleData }>;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const { method, firstUse, adoptionCount, evolvedFrom } = payload[0].payload;
  return (
    <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2 shadow-md dark:border-emerald-800 dark:bg-emerald-950">
      <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
        {method}
      </p>
      <p className="text-xs text-emerald-700 dark:text-emerald-400">
        First use: {firstUse}
      </p>
      <p className="text-xs text-emerald-700 dark:text-emerald-400">
        Adoption count: {adoptionCount}
      </p>
      {evolvedFrom && (
        <p className="text-xs text-emerald-600 dark:text-emerald-500">
          Evolved from: {evolvedFrom}
        </p>
      )}
    </div>
  );
}

export default function TimelineView({ methodTimeline }: TimelineViewProps) {
  const chartData: BubbleData[] = useMemo(() => {
    if (!methodTimeline || methodTimeline.length === 0) return [];
    return methodTimeline.map((item) => ({
      x: item.first_use,
      y: item.adoption_count,
      z: Math.max(item.adoption_count, 1),
      method: item.method,
      evolvedFrom: item.evolved_from,
      firstUse: item.first_use,
      adoptionCount: item.adoption_count,
    }));
  }, [methodTimeline]);

  if (!methodTimeline || methodTimeline.length === 0) {
    return (
      <div className="flex h-[300px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30">
        <Clock className="h-10 w-10 text-emerald-300 dark:text-emerald-700" />
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          No method timeline data available
        </p>
      </div>
    );
  }

  const minYear = Math.min(...chartData.map((d) => d.x));
  const maxYear = Math.max(...chartData.map((d) => d.x));
  const maxAdoption = Math.max(...chartData.map((d) => d.y));
  const xDomainPadding = Math.max((maxYear - minYear) * 0.1, 1);

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <defs>
            <radialGradient id="bubbleGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#059669" stopOpacity={0.9} />
              <stop offset="70%" stopColor="#047857" stopOpacity={0.75} />
              <stop offset="100%" stopColor="#064e3b" stopOpacity={0.6} />
            </radialGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
          <XAxis
            type="number"
            dataKey="x"
            name="First Use Year"
            domain={[minYear - xDomainPadding, maxYear + xDomainPadding]}
            tick={{ fontSize: 12, fill: "#6b7280" }}
            tickCount={Math.min(10, maxYear - minYear + 1)}
            tickFormatter={(value: number) => value.toString()}
            label={{
              value: "First Use Year",
              position: "insideBottomRight",
              offset: -10,
              style: { fontSize: 12, fill: "#6b7280" },
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Adoption Count"
            domain={[0, maxAdoption * 1.15]}
            tick={{ fontSize: 12, fill: "#6b7280" }}
            tickLine={false}
            label={{
              value: "Adoption Count",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 12, fill: "#6b7280" },
            }}
          />
          <ZAxis type="number" dataKey="z" range={[20, 400]} />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ strokeDasharray: "3 3" }}
          />
          <Scatter
            data={chartData}
            fill="url(#bubbleGradient)"
            stroke="#047857"
            strokeWidth={0.5}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

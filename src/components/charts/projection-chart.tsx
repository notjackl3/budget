"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useMoney } from "@/components/currency-provider";
import type { ScenarioPoint } from "@/lib/projection";

const SCENARIO_LABEL: Record<string, string> = {
  bestCents: "Best",
  averageCents: "Average",
  worstCents: "Worst",
  contributedCents: "Money in",
};

/**
 * Projected portfolio value over the horizon. The shaded band spans the worst→
 * best scenarios; the solid line is the average. X axis is years from now.
 */
export function ProjectionChart({ data }: { data: ScenarioPoint[] }) {
  const money = useMoney();
  // Recharts draws a range Area from a [low, high] tuple.
  const rows = data.map((p) => ({
    year: p.year,
    band: [p.worstCents, p.bestCents] as [number, number],
    averageCents: p.averageCents,
    bestCents: p.bestCents,
    worstCents: p.worstCents,
    contributedCents: p.contributedCents,
  }));

  return (
    <div className="space-y-2">
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="projectionBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.22} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="year"
          tickFormatter={(y: number) => (y === 0 ? "now" : `${y}y`)}
          tickLine={false}
          axisLine={false}
          fontSize={11}
          minTickGap={16}
          stroke="hsl(var(--muted-foreground))"
        />
        <YAxis
          hide
          domain={["auto", "auto"]}
        />
        <Tooltip
          cursor={{ stroke: "hsl(var(--border))" }}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--popover))",
            fontSize: 12,
          }}
          labelFormatter={(y: number) => (y === 0 ? "Today" : `In ${y} year${y === 1 ? "" : "s"}`)}
          formatter={(v: number | number[], name: string) => {
            if (name === "band") return [null, null] as unknown as [string, string];
            return [money(v as number), SCENARIO_LABEL[name] ?? name];
          }}
        />
        <Area
          type="monotone"
          dataKey="band"
          stroke="none"
          fill="url(#projectionBand)"
          isAnimationActive={false}
          activeDot={false}
        />
        <Line
          type="monotone"
          dataKey="worstCents"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth={1}
          strokeDasharray="3 3"
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="bestCents"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth={1}
          strokeDasharray="3 3"
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="averageCents"
          stroke="hsl(var(--primary))"
          strokeWidth={2.5}
          dot={false}
          isAnimationActive={false}
        />
        {/* Money put in (principal + contributions, no growth) — the flat
            reference line so growth is visible against what you invested. */}
        <Line
          type="monotone"
          dataKey="contributedCents"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <LegendItem className="bg-primary" label="Projected (average)" />
        <LegendItem className="bg-muted-foreground" label="Money in" />
        <LegendItem dashed label="Worst / best range" />
      </div>
    </div>
  );
}

function LegendItem({
  label,
  className,
  dashed,
}: {
  label: string;
  className?: string;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {dashed ? (
        <span className="h-0 w-4 border-t border-dashed border-muted-foreground" />
      ) : (
        <span className={`h-0.5 w-4 rounded-full ${className ?? ""}`} />
      )}
      {label}
    </span>
  );
}

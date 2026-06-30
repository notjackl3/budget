"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useMoney } from "@/components/currency-provider";
import type { DaySpend } from "@/lib/aggregate";

/**
 * Day-by-day spending for a single month as a line (with a soft area fill),
 * zero-filled across every calendar day, so quiet stretches and spending spikes
 * read at a glance. Ticks are thinned to every 5th day for a 28–31 day axis.
 */
export function DailySpend({ data }: { data: DaySpend[] }) {
  const money = useMoney();

  if (data.every((d) => d.totalCents === 0)) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No spending this month yet.
      </div>
    );
  }

  const total = data.reduce((a, d) => a + d.totalCents, 0);
  const daysWithSpend = data.filter((d) => d.totalCents > 0).length;
  const busiest = data.reduce((a, d) => (d.totalCents > a.totalCents ? d : a));

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}>
          <defs>
            <linearGradient id="dailySpendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.22} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="dayOfMonth"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            stroke="hsl(var(--muted-foreground))"
            interval={0}
            tickFormatter={(d: number) => (d % 5 === 0 || d === 1 ? String(d) : "")}
          />
          <YAxis hide />
          <Tooltip
            cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3" }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--popover))",
              fontSize: 12,
            }}
            formatter={(v: number) => [money(v), "Spent"]}
            labelFormatter={(d) => `Day ${d}`}
          />
          <Area
            type="monotone"
            dataKey="totalCents"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#dailySpendFill)"
            dot={false}
            activeDot={{ r: 3.5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>
          Spent on{" "}
          <span className="font-medium text-foreground">{daysWithSpend}</span> day
          {daysWithSpend === 1 ? "" : "s"}
        </span>
        <span>
          Busiest day{" "}
          <span className="font-medium text-foreground">
            {busiest.dayOfMonth}
          </span>{" "}
          · <span className="tabular">{money(busiest.totalCents)}</span>
        </span>
        <span>
          Daily avg{" "}
          <span className="tabular font-medium text-foreground">
            {money(Math.round(total / data.length))}
          </span>
        </span>
      </div>
    </div>
  );
}

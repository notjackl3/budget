"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useMoney } from "@/components/currency-provider";
import { monthShortLabel } from "@/lib/dates";

export interface TrendDatum {
  month: string; // YYYY-MM
  totalCents: number;
}

export function MonthTrend({
  data,
  activeMonth,
}: {
  data: TrendDatum[];
  activeMonth?: string;
}) {
  const money = useMoney();
  const chartData = data.map((d) => ({
    ...d,
    label: monthShortLabel(d.month).replace(/ \d{4}$/, ""),
  }));

  if (data.every((d) => d.totalCents === 0)) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
        No data for this year yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          stroke="hsl(var(--muted-foreground))"
        />
        <YAxis hide />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))" }}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--popover))",
            fontSize: 12,
          }}
          formatter={(v: number) => [money(v), "Spent"]}
        />
        <Bar dataKey="totalCents" radius={[4, 4, 0, 0]}>
          {chartData.map((d) => (
            <Cell
              key={d.month}
              fill={
                d.month === activeMonth
                  ? "hsl(var(--primary))"
                  : "hsl(var(--primary) / 0.25)"
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

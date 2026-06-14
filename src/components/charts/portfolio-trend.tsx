"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useMoney } from "@/components/currency-provider";

export interface PortfolioPoint {
  date: string; // "YYYY-MM-DD"
  totalCents: number;
}

export function PortfolioTrend({ data }: { data: PortfolioPoint[] }) {
  const money = useMoney();

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => d.slice(5)}
          tickLine={false}
          axisLine={false}
          fontSize={11}
          minTickGap={24}
          stroke="hsl(var(--muted-foreground))"
        />
        <YAxis hide domain={["auto", "auto"]} />
        <Tooltip
          cursor={{ stroke: "hsl(var(--border))" }}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--popover))",
            fontSize: 12,
          }}
          formatter={(v: number) => [money(v), "Value"]}
        />
        <Area
          type="monotone"
          dataKey="totalCents"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#portfolioFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

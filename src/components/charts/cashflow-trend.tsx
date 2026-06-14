"use client";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { useMoney } from "@/components/currency-provider";
import { monthShortLabel } from "@/lib/dates";
import type { CashflowDatum } from "@/lib/aggregate";

/**
 * Income vs spending, month by month. Two bars per month make the comparison
 * immediate: green when you earned more than you spent, the spend bar taller
 * when you didn't.
 */
export function CashflowTrend({
  data,
  activeMonth,
}: {
  data: CashflowDatum[];
  activeMonth?: string;
}) {
  const money = useMoney();
  const chartData = data.map((d) => ({
    ...d,
    label: monthShortLabel(d.month).replace(/ \d{4}$/, ""),
  }));

  if (data.every((d) => d.incomeCents === 0 && d.spendCents === 0)) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No data for this year yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
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
          formatter={(v: number, name) => [
            money(v),
            name === "incomeCents" ? "Income" : "Spent",
          ]}
          labelFormatter={(_, payload) => {
            const d = payload?.[0]?.payload as CashflowDatum | undefined;
            if (!d) return "";
            const net = d.netCents;
            return `${monthShortLabel(d.month)} · net ${net >= 0 ? "+" : "-"}${money(Math.abs(net))}`;
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
          formatter={(v) => (v === "incomeCents" ? "Income" : "Spent")}
        />
        <Bar
          dataKey="incomeCents"
          name="incomeCents"
          fill="hsl(152 60% 45%)"
          radius={[4, 4, 0, 0]}
          maxBarSize={22}
        >
          {chartData.map((d) => (
            <Cell
              key={d.month}
              opacity={!activeMonth || d.month === activeMonth ? 1 : 0.5}
            />
          ))}
        </Bar>
        <Bar
          dataKey="spendCents"
          name="spendCents"
          fill="hsl(var(--primary))"
          radius={[4, 4, 0, 0]}
          maxBarSize={22}
        >
          {chartData.map((d) => (
            <Cell
              key={d.month}
              opacity={!activeMonth || d.month === activeMonth ? 1 : 0.5}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

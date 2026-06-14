"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useMoney } from "@/components/currency-provider";

export interface DonutDatum {
  name: string;
  value: number; // cents
  color: string;
}

export function CategoryDonut({
  data,
  totalCents,
}: {
  data: DonutDatum[];
  totalCents: number;
}) {
  const money = useMoney();

  if (data.length === 0 || totalCents === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        No spending yet this month.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <div className="relative h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={84}
              paddingAngle={1.5}
              strokeWidth={0}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="tabular text-lg font-semibold">
            {money(totalCents)}
          </span>
        </div>
      </div>
      <ul className="flex-1 space-y-1.5">
        {data.slice(0, 6).map((d) => {
          const pct = Math.round((d.value / totalCents) * 100);
          return (
            <li key={d.name} className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <span className="flex-1 truncate">{d.name}</span>
              <span className="tabular text-muted-foreground">{pct}%</span>
              <span className="tabular w-20 text-right font-medium">
                {money(d.value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

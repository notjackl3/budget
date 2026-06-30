"use client";

import * as React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useMoney } from "@/components/currency-provider";
import { cn } from "@/lib/utils";

export interface DonutDatum {
  name: string;
  value: number; // cents
  color: string;
}

export function CategoryDonut({ data }: { data: DonutDatum[] }) {
  const money = useMoney();
  // Categories the user has toggled off. They stay in the legend (so they can be
  // switched back on) but drop out of the ring and the recomputed total.
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());

  const toggle = (name: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        No spending yet this month.
      </div>
    );
  }

  const visible = data.filter((d) => !hidden.has(d.name));
  const shownTotal = visible.reduce((a, d) => a + d.value, 0);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <div className="relative h-[180px] w-[180px] shrink-0">
        {shownTotal > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={visible}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={84}
                paddingAngle={1.5}
                strokeWidth={0}
                isAnimationActive={false}
              >
                {visible.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full border border-dashed text-xs text-muted-foreground">
            all hidden
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">
            {hidden.size > 0 ? "Shown" : "Total"}
          </span>
          <span className="tabular text-lg font-semibold">{money(shownTotal)}</span>
        </div>
      </div>
      <ul className="flex-1 space-y-1.5">
        {data.map((d) => {
          const off = hidden.has(d.name);
          const pct =
            shownTotal > 0 && !off ? Math.round((d.value / shownTotal) * 100) : 0;
          return (
            <li key={d.name}>
              <button
                type="button"
                onClick={() => toggle(d.name)}
                aria-pressed={!off}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-sm transition-colors hover:bg-muted/50",
                  off && "opacity-40",
                )}
                title={off ? `Show ${d.name}` : `Hide ${d.name}`}
              >
                <span
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-full",
                    off && "ring-1 ring-inset ring-muted-foreground/40",
                  )}
                  style={{ backgroundColor: off ? "transparent" : d.color }}
                />
                <span className={cn("flex-1 truncate", off && "line-through")}>
                  {d.name}
                </span>
                <span className="tabular text-muted-foreground">
                  {off ? "—" : `${pct}%`}
                </span>
                <span className="tabular w-20 text-right font-medium">
                  {money(d.value)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

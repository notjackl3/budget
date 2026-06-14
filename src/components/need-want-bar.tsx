"use client";

import { useMoney } from "@/components/currency-provider";

export function NeedWantBar({
  needsCents,
  wantsCents,
  comfortCents = 0,
  unspecifiedCents,
}: {
  needsCents: number;
  wantsCents: number;
  comfortCents?: number;
  unspecifiedCents: number;
}) {
  const money = useMoney();
  const total = needsCents + wantsCents + comfortCents + unspecifiedCents;
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="bg-emerald-500"
          style={{ width: `${pct(needsCents)}%` }}
          title="Needs"
        />
        <div
          className="bg-amber-500"
          style={{ width: `${pct(wantsCents)}%` }}
          title="Wants"
        />
        <div
          className="bg-sky-500"
          style={{ width: `${pct(comfortCents)}%` }}
          title="Comfort"
        />
        <div
          className="bg-muted-foreground/30"
          style={{ width: `${pct(unspecifiedCents)}%` }}
          title="Unspecified"
        />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <Legend color="bg-emerald-500" label="Needs" value={money(needsCents)} pct={pct(needsCents)} />
        <Legend color="bg-amber-500" label="Wants" value={money(wantsCents)} pct={pct(wantsCents)} />
        {comfortCents > 0 && (
          <Legend color="bg-sky-500" label="Comfort" value={money(comfortCents)} pct={pct(comfortCents)} />
        )}
        {unspecifiedCents > 0 && (
          <Legend
            color="bg-muted-foreground/30"
            label="Unspecified"
            value={money(unspecifiedCents)}
            pct={pct(unspecifiedCents)}
          />
        )}
      </div>
    </div>
  );
}

function Legend({
  color,
  label,
  value,
  pct,
}: {
  color: string;
  label: string;
  value: string;
  pct: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular font-medium">{value}</span>
      <span className="tabular text-xs text-muted-foreground">
        {Math.round(pct)}%
      </span>
    </div>
  );
}

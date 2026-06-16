"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mail, Plus, RotateCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useMoney } from "@/components/currency-provider";
import { syncGmailNow } from "@/app/actions";
import type { IngestItem } from "@/lib/ingest";

const RANGES = [
  { value: "sync", label: "Since last sync" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last year" },
];

type Result = { scanned: number; created: IngestItem[]; duplicates: IngestItem[] };

/**
 * Manual "check email for new transactions" control on the weekly review.
 * Lets the user choose how far back to look, fetches (incremental + deduped),
 * and shows both what was newly added and what was already in the database.
 */
export function FetchEmailsPanel() {
  const router = useRouter();
  const { toast } = useToast();
  const money = useMoney();
  const [range, setRange] = React.useState("sync");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Result | null>(null);

  async function run() {
    setBusy(true);
    try {
      const daysBack = range === "sync" ? undefined : Number(range);
      const r = await syncGmailNow(daysBack);
      setResult(r);
      toast({
        title: r.created.length
          ? `Fetched ${r.created.length} new transaction${r.created.length === 1 ? "" : "s"}`
          : "No new transactions",
        description: `Scanned ${r.scanned} email${r.scanned === 1 ? "" : "s"}${
          r.duplicates.length ? `; ${r.duplicates.length} already processed` : ""
        }.`,
        variant: "success",
      });
      router.refresh();
    } catch (err) {
      toast({
        title: "Fetch failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Check email for new transactions</span>
          <div className="ml-auto flex items-center gap-2">
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={run} disabled={busy}>
              <RotateCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {busy ? "Checking…" : "Fetch"}
            </Button>
          </div>
        </div>

        {result && (
          <div className="space-y-3 border-t pt-3">
            <ItemList
              title={`Added (${result.created.length})`}
              tone="new"
              items={result.created}
              money={money}
              empty="No new transactions found."
            />
            {result.duplicates.length > 0 && (
              <ItemList
                title={`Already processed (${result.duplicates.length})`}
                tone="dup"
                items={result.duplicates}
                money={money}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ItemList({
  title,
  tone,
  items,
  money,
  empty,
}: {
  title: string;
  tone: "new" | "dup";
  items: IngestItem[];
  money: (cents: number) => string;
  empty?: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {items.length === 0 ? (
        empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null
      ) : (
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li
              key={`${it.date}-${it.description}-${i}`}
              className={
                "flex items-center justify-between gap-3 rounded-md px-2 py-1 text-sm " +
                (tone === "dup" ? "text-muted-foreground" : "")
              }
            >
              <span className="flex items-center gap-2 truncate">
                {tone === "new" ? (
                  <Plus className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                )}
                <span className="truncate">{it.description}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{it.date}</span>
              </span>
              <span className="shrink-0 tabular-nums">{money(it.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useMoney } from "@/components/currency-provider";
import { PortfolioTrend, type PortfolioPoint } from "@/components/charts/portfolio-trend";
import {
  createHolding,
  updateHolding,
  deleteHolding,
  refreshQuotes,
  searchSymbols,
} from "@/app/actions";
import type { SymbolMatch } from "@/lib/investments";
import { centsToDecimalString } from "@/lib/money";

export interface HoldingRowDTO {
  id: string;
  symbol: string;
  name: string | null;
  shares: number;
  avgCostCents: number | null;
  currency: string;
  account: string | null;
  priceCents: number | null;
  changePct: number | null;
  marketValueBaseCents: number | null;
  gainBaseCents: number | null;
  gainPct: number | null;
}

export interface PortfolioTotalsDTO {
  marketValueCents: number;
  costCents: number;
  gainCents: number;
  gainPct: number | null;
  unpricedCount: number;
}

const CURRENCIES = ["CAD", "USD"];

/** Format a native-currency cent amount with its 3-letter code. */
function fmtNative(cents: number, currency: string): string {
  const v = (cents / 100).toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${v} ${currency}`;
}

function fmtPct(pct: number | null): string {
  if (pct == null) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function gainClass(cents: number | null): string {
  if (cents == null || cents === 0) return "text-muted-foreground";
  return cents > 0 ? "text-emerald-600" : "text-red-600";
}

export function InvestmentsView({
  holdings,
  totals,
  base,
  lastUpdated,
  snapshots,
}: {
  holdings: HoldingRowDTO[];
  totals: PortfolioTotalsDTO;
  base: string;
  lastUpdated: string | null;
  snapshots: PortfolioPoint[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const money = useMoney();
  const [refreshing, setRefreshing] = React.useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await refreshQuotes();
      router.refresh();
      toast({
        title:
          res.updated > 0
            ? `Updated ${res.updated} price${res.updated === 1 ? "" : "s"}` +
              (res.failed > 0 ? `, ${res.failed} failed` : "")
            : "No prices could be fetched",
        variant: res.updated > 0 ? "success" : "error",
      });
    } catch {
      toast({ title: "Price refresh failed", variant: "error" });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Portfolio value */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Portfolio value</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {lastUpdated
                ? `Prices as of ${lastUpdated}`
                : "Prices not fetched yet"}
              {totals.unpricedCount > 0 &&
                ` · ${totals.unpricedCount} unpriced`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh prices
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <p className="tabular text-3xl font-semibold">
              {money(totals.marketValueCents)}
            </p>
            {totals.costCents > 0 && (
              <div
                className={`flex items-center gap-1 text-sm font-medium ${gainClass(totals.gainCents)}`}
              >
                {totals.gainCents >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span className="tabular">{money(totals.gainCents)}</span>
                <span className="tabular">({fmtPct(totals.gainPct)})</span>
              </div>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            All values in {base}.
            {totals.costCents > 0 &&
              ` Cost basis ${money(totals.costCents)}.`}
          </p>
        </CardContent>
      </Card>

      {/* Value over time */}
      {snapshots.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Value over time</CardTitle>
          </CardHeader>
          <CardContent>
            <PortfolioTrend data={snapshots} />
          </CardContent>
        </Card>
      )}

      {/* Holdings */}
      <Card>
        <CardHeader>
          <CardTitle>Holdings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {holdings.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No holdings yet. Add a ticker below, then hit “Refresh prices”.
            </p>
          ) : (
            <div className="space-y-3">
              {holdings.map((h) => (
                <HoldingRow
                  key={h.id}
                  holding={h}
                  base={base}
                  portfolioTotalCents={totals.marketValueCents}
                />
              ))}
            </div>
          )}
          <AddHolding />
        </CardContent>
      </Card>
    </div>
  );
}

function HoldingRow({
  holding: h,
  base,
  portfolioTotalCents,
}: {
  holding: HoldingRowDTO;
  base: string;
  portfolioTotalCents: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const money = useMoney();

  const [shares, setShares] = React.useState(String(h.shares));
  const [avgCost, setAvgCost] = React.useState(
    h.avgCostCents != null ? centsToDecimalString(h.avgCostCents) : "",
  );
  const [account, setAccount] = React.useState(h.account ?? "");

  async function persist(patch: Parameters<typeof updateHolding>[1]) {
    try {
      await updateHolding(h.id, patch);
      router.refresh();
    } catch {
      toast({ title: "Could not save", variant: "error" });
    }
  }

  async function remove() {
    try {
      await deleteHolding(h.id);
      router.refresh();
      toast({ title: `Removed ${h.symbol}`, variant: "success" });
    } catch {
      toast({ title: "Could not remove", variant: "error" });
    }
  }

  return (
    <div className="glass rounded-xl p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{h.symbol}</span>
            {h.currency !== base && (
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {h.currency}
              </span>
            )}
          </div>
          {h.name && (
            <p className="truncate text-xs text-muted-foreground">{h.name}</p>
          )}
        </div>
        <div className="text-right">
          <p className="tabular font-semibold">
            {h.marketValueBaseCents != null
              ? money(h.marketValueBaseCents)
              : "—"}
          </p>
          <p className="text-xs tabular text-muted-foreground">
            {h.marketValueBaseCents != null && portfolioTotalCents > 0
              ? `${((h.marketValueBaseCents / portfolioTotalCents) * 100).toFixed(1)}% of portfolio`
              : "—"}
          </p>
          <p className={`text-xs tabular ${gainClass(h.gainBaseCents)}`}>
            {h.gainBaseCents != null
              ? `${money(h.gainBaseCents)} (${fmtPct(h.gainPct)})`
              : h.priceCents != null
                ? "no cost set"
                : "unpriced"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="w-24 space-y-1">
          <Label className="text-xs">Shares</Label>
          <Input
            inputMode="decimal"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            onBlur={() =>
              parseFloat(shares) !== h.shares && persist({ shares })
            }
            className="h-8 text-right tabular"
          />
        </div>
        <div className="w-28 space-y-1">
          <Label className="text-xs">Avg cost / share</Label>
          <Input
            inputMode="decimal"
            value={avgCost}
            onChange={(e) => setAvgCost(e.target.value)}
            onBlur={() => persist({ avgCost })}
            placeholder="optional"
            className="h-8 text-right tabular"
          />
        </div>
        <div className="w-24 space-y-1">
          <Label className="text-xs">Currency</Label>
          <Select
            value={h.currency}
            onValueChange={(v) => persist({ currency: v })}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[6rem] flex-1 space-y-1">
          <Label className="text-xs">Account</Label>
          <Input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            onBlur={() => account !== (h.account ?? "") && persist({ account })}
            placeholder="e.g. WS TFSA"
            className="h-8"
          />
        </div>
        <div className="space-y-1 text-right">
          <Label className="text-xs">Last price</Label>
          <p className="tabular text-sm leading-8">
            {h.priceCents != null ? fmtNative(h.priceCents, h.currency) : "—"}
            {h.changePct != null && (
              <span className={`ml-1 text-xs ${gainClass(h.changePct)}`}>
                {fmtPct(h.changePct)}
              </span>
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={remove}
          aria-label={`Remove ${h.symbol}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function AddHolding() {
  const router = useRouter();
  const { toast } = useToast();
  // A picked match locks in the validated symbol/name/currency from the market.
  const [picked, setPicked] = React.useState<SymbolMatch | null>(null);
  const [shares, setShares] = React.useState("");
  const [account, setAccount] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setPicked(null);
    setShares("");
    setAccount("");
  }

  async function add() {
    if (!picked) return;
    setSaving(true);
    try {
      await createHolding({
        symbol: picked.symbol,
        name: picked.name,
        shares: shares || 0,
        avgCost: null,
        currency: picked.currency,
        account: account.trim() || null,
      });
      reset();
      router.refresh();
      toast({ title: `Added ${picked.symbol}`, variant: "success" });
    } catch (e) {
      toast({
        title: "Could not add holding",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-t pt-4">
      <div className="min-w-[14rem] flex-1 space-y-1">
        <Label className="text-xs">Stock</Label>
        <TickerCombobox
          picked={picked}
          onPick={setPicked}
          onEnter={add}
        />
      </div>
      <div className="w-24 space-y-1">
        <Label className="text-xs">Shares</Label>
        <Input
          inputMode="decimal"
          value={shares}
          onChange={(e) => setShares(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="0"
          className="h-9 text-right tabular"
        />
      </div>
      <div className="min-w-[6rem] flex-1 space-y-1">
        <Label className="text-xs">Account</Label>
        <Input
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          placeholder="optional"
          className="h-9"
        />
      </div>
      <Button onClick={add} disabled={saving || !picked}>
        <Plus className="h-4 w-4" /> Add
      </Button>
    </div>
  );
}

/**
 * Free-text ticker search with a dropdown of real market matches, so a holding
 * can only be added for a symbol the market actually knows. Debounced; picking
 * a row locks in the validated symbol + currency.
 */
function TickerCombobox({
  picked,
  onPick,
  onEnter,
}: {
  picked: SymbolMatch | null;
  onPick: (m: SymbolMatch | null) => void;
  onEnter: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SymbolMatch[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const reqId = React.useRef(0);

  // Debounced search; ignore stale responses via a request id.
  React.useEffect(() => {
    const q = query.trim();
    if (picked || q.length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      const matches = await searchSymbols(q);
      if (id !== reqId.current) return; // a newer keystroke superseded this
      setResults(matches);
      setActive(0);
      setOpen(true);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, picked]);

  // Close the dropdown on outside click.
  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(m: SymbolMatch) {
    onPick(m);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  // A locked-in pick: show it as a removable chip-style field.
  if (picked) {
    return (
      <div className="flex h-9 items-center justify-between gap-2 rounded-md border bg-card px-3 text-sm">
        <span className="min-w-0 truncate">
          <span className="font-semibold">{picked.symbol}</span>
          <span className="ml-1 text-muted-foreground">{picked.currency}</span>
          <span className="ml-2 truncate text-xs text-muted-foreground">
            {picked.name}
          </span>
        </span>
        <button
          type="button"
          onClick={() => onPick(null)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Clear stock"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || results.length === 0) {
            if (e.key === "Enter") onEnter();
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Search name or ticker (e.g. QQQ)"
        className="h-9"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-[22rem] max-w-[80vw] overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {loading && results.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              No matches.
            </p>
          ) : (
            results.map((m, i) => (
              <button
                key={`${m.symbol}-${i}`}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(m)}
                className={`flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-sm ${
                  i === active ? "bg-accent" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="font-semibold">{m.symbol}</span>
                  <span className="ml-2 truncate text-xs text-muted-foreground">
                    {m.name}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {[m.exchange, m.type].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

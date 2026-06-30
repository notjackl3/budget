"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Lock,
  Unlock,
  RefreshCw,
  TrendingUp,
  Sparkles,
  ChevronDown,
  Plus,
  Trash2,
} from "lucide-react";
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
import { ProjectionChart } from "@/components/charts/projection-chart";
import {
  rebalance,
  blendReturn,
  projectScenarios,
  scenarioReturns,
  scheduleMonthlyContribution,
  contributionScheduleFn,
  INVESTMENT_KEY,
  type Bucket,
  type ScenarioKey,
  type ContribSegment,
  type ContribUnit,
  type InvestPlan,
} from "@/lib/projection";
import type { ReturnStats } from "@/lib/investments";
import { dollarsToCents, centsToDecimalString } from "@/lib/money";
import { monthShortLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { MonthSpend } from "@/lib/projection";
import {
  setBuckets as setBucketsAction,
  setBucket as setBucketAction,
  setInvestmentAllocations,
  saveBudgetPlan,
  refreshReturnStats,
} from "@/app/actions";

export interface ProjectionCategory {
  id: string;
  name: string;
  color: string | null;
  recentMonths: MonthSpend[];
}
export interface ProjectionHoldingDTO {
  symbol: string;
  name: string | null;
  currency: string;
}
export interface ReturnStatDTO {
  symbol: string;
  annualReturn: number;
  annualVol: number;
  months: number;
}

const HORIZONS = [5, 10, 15, 20, 30];
const SCENARIOS: { key: ScenarioKey; label: string }[] = [
  { key: "worst", label: "Worst" },
  { key: "average", label: "Average" },
  { key: "best", label: "Best" },
];

function fmtPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

export function ProjectionView({
  monthlyIncomeCents,
  portfolioValueCents,
  categories,
  initialBuckets,
  holdings,
  initialAllocations,
  returnStats,
  horizonYears,
  scenario,
  investContribCents,
  initialPlan,
  currentMonth,
  base,
}: {
  monthlyIncomeCents: number;
  portfolioValueCents: number;
  categories: ProjectionCategory[];
  initialBuckets: Bucket[];
  holdings: ProjectionHoldingDTO[];
  initialAllocations: { symbol: string; percent: number }[];
  returnStats: ReturnStatDTO[];
  horizonYears: number;
  scenario: string;
  investContribCents: number | null;
  initialPlan: InvestPlan | null;
  currentMonth: string;
  base: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const money = useMoney();

  const [buckets, setBuckets] = React.useState<Bucket[]>(initialBuckets);
  const [horizon, setHorizon] = React.useState(horizonYears);
  const [activeScenario, setActiveScenario] = React.useState<ScenarioKey>(
    (scenario as ScenarioKey) ?? "average",
  );
  const [refreshing, setRefreshing] = React.useState(false);

  // Allocation percents per symbol. Default to an even split when nothing saved.
  const [alloc, setAlloc] = React.useState<Record<string, number>>(() => {
    if (initialAllocations.length > 0) {
      return Object.fromEntries(initialAllocations.map((a) => [a.symbol, a.percent]));
    }
    if (holdings.length === 0) return {};
    const even = Math.round((100 / holdings.length) * 10) / 10;
    return Object.fromEntries(holdings.map((h) => [h.symbol, even]));
  });

  const bucketMap = React.useMemo(
    () => new Map(buckets.map((b) => [b.key, b])),
    [buckets],
  );
  const investBucket = bucketMap.get(INVESTMENT_KEY) ?? {
    key: INVESTMENT_KEY,
    amountCents: 0,
    locked: false,
  };
  // What the allocator budgets to investing each month (the slider value).
  const budgetedInvestCents = investBucket.amountCents;
  const spendCents = monthlyIncomeCents - budgetedInvestCents;

  // ----- Contribution plan: starting-amount override + schedule segments -----
  // Seeded from the saved plan, else a single "budgeted invest, monthly, forever"
  // segment so the projection matches the allocator out of the box.
  const [startOverride, setStartOverride] = React.useState<number | null>(
    initialPlan ? initialPlan.startCents : null,
  );
  const [segments, setSegments] = React.useState<ContribSegment[]>(() => {
    if (initialPlan && initialPlan.segments.length > 0) return initialPlan.segments;
    return [
      {
        amountCents: investContribCents ?? budgetedInvestCents,
        unit: "month",
        every: 1,
        startMonth: null,
        endMonth: null,
      },
    ];
  });

  // Effective starting balance: the override if set, else today's portfolio value.
  const effectiveStartCents = startOverride ?? portfolioValueCents;
  // This calendar month's contribution under the schedule — used for labels.
  const currentContribCents = React.useMemo(
    () => Math.round(scheduleMonthlyContribution(segments, currentMonth)),
    [segments, currentMonth],
  );
  const contributionForMonth = React.useMemo(
    () => contributionScheduleFn(segments, currentMonth),
    [segments, currentMonth],
  );

  async function persistPlan(
    nextStart: number | null = startOverride,
    nextSegs: ContribSegment[] = segments,
  ) {
    try {
      await saveBudgetPlan({
        investPlanJson: JSON.stringify({ startCents: nextStart, segments: nextSegs }),
      });
    } catch {
      toast({ title: "Could not save contribution plan", variant: "error" });
    }
  }

  // These run from event handlers, so `segments` from closure is current. We
  // compute the next array, set it, then persist — never persisting inside the
  // state updater (that fires during render and triggers a router update).
  function updateSegment(i: number, patch: Partial<ContribSegment>) {
    const next = segments.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    setSegments(next);
    void persistPlan(undefined, next);
  }
  function addSegment() {
    const last = segments[segments.length - 1];
    const next: ContribSegment[] = [
      ...segments,
      {
        amountCents: 0,
        unit: "month",
        every: 1,
        // Chain a new period onto the end of the previous one when it's bounded.
        startMonth: last?.endMonth ?? null,
        endMonth: null,
      },
    ];
    setSegments(next);
    void persistPlan(undefined, next);
  }
  function removeSegment(i: number) {
    const next = segments.filter((_, idx) => idx !== i);
    setSegments(next);
    void persistPlan(undefined, next);
  }

  const statsBySymbol = React.useMemo<Record<string, ReturnStats>>(
    () =>
      Object.fromEntries(
        returnStats.map((s) => [
          s.symbol,
          { annualReturn: s.annualReturn, annualVol: s.annualVol, months: s.months },
        ]),
      ),
    [returnStats],
  );

  const allocList = React.useMemo(
    () => Object.entries(alloc).map(([symbol, percent]) => ({ symbol, percent })),
    [alloc],
  );
  const blended = React.useMemo(
    () => blendReturn(allocList, statsBySymbol),
    [allocList, statsBySymbol],
  );

  const projection = React.useMemo(() => {
    if (!blended) return null;
    return projectScenarios({
      startCents: effectiveStartCents,
      monthlyContributionCents: 0,
      stats: blended,
      years: horizon,
      contributionForMonth,
    });
  }, [blended, effectiveStartCents, contributionForMonth, horizon]);

  const returns = blended ? scenarioReturns(blended) : null;

  // ----- persistence helpers -----
  async function persistBuckets(next: Bucket[]) {
    try {
      await setBucketsAction(
        next.map((b) => ({ key: b.key, amountCents: b.amountCents, locked: b.locked })),
      );
    } catch {
      toast({ title: "Could not save budget", variant: "error" });
    }
  }

  function onBucketChange(key: string, newAmountCents: number) {
    setBuckets((prev) => rebalance(prev, key, newAmountCents, monthlyIncomeCents));
  }
  function commitBuckets() {
    void persistBuckets(buckets);
  }

  async function toggleLock(key: string) {
    const cur = bucketMap.get(key);
    const locked = !(cur?.locked ?? false);
    setBuckets((prev) =>
      prev.map((b) => (b.key === key ? { ...b, locked } : b)),
    );
    try {
      await setBucketAction(key, { locked });
    } catch {
      toast({ title: "Could not save lock", variant: "error" });
    }
  }

  async function persistAlloc(next: Record<string, number>) {
    try {
      await setInvestmentAllocations(
        Object.entries(next).map(([symbol, percent]) => ({ symbol, percent })),
      );
    } catch {
      toast({ title: "Could not save allocation", variant: "error" });
    }
  }

  async function changeHorizon(years: number) {
    setHorizon(years);
    try {
      await saveBudgetPlan({ horizonYears: years });
    } catch {
      /* non-critical */
    }
  }
  async function changeScenario(s: ScenarioKey) {
    setActiveScenario(s);
    try {
      await saveBudgetPlan({ scenario: s });
    } catch {
      /* non-critical */
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await refreshReturnStats();
      router.refresh();
      toast({
        title:
          res.updated > 0
            ? `Updated ${res.updated} ticker${res.updated === 1 ? "" : "s"}` +
              (res.failed > 0 ? `, ${res.failed} without enough history` : "")
            : "No historical data could be fetched",
        variant: res.updated > 0 ? "success" : "error",
      });
    } catch {
      toast({ title: "Refresh failed", variant: "error" });
    } finally {
      setRefreshing(false);
    }
  }

  const allocTotal = allocList.reduce((a, x) => a + x.percent, 0);
  const horizonEnd = projection?.[projection.length - 1];

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>This month</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Income" value={money(monthlyIncomeCents)} />
            <Stat label="Budgeted spend" value={money(spendCents)} />
            <Stat
              label="To invest"
              value={money(budgetedInvestCents)}
              accent
            />
            <Stat label="Portfolio now" value={money(portfolioValueCents)} />
          </div>
        </CardContent>
      </Card>

      {/* Allocator */}
      <Card>
        <CardHeader>
          <CardTitle>Allocate your income</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Lower one category and the rest (including Investment) rebalance to keep
            the total at {money(monthlyIncomeCents)}. Lock a row to pin it.
          </p>
        </CardHeader>
        <CardContent className="space-y-1">
          {categories.map((c) => {
            const b = bucketMap.get(c.id);
            return (
              <AllocatorRow
                key={c.id}
                label={c.name}
                color={c.color}
                amountCents={b?.amountCents ?? 0}
                locked={b?.locked ?? false}
                maxCents={monthlyIncomeCents}
                onChange={(v) => onBucketChange(c.id, v)}
                onCommit={commitBuckets}
                onToggleLock={() => toggleLock(c.id)}
                recentMonths={c.recentMonths}
              />
            );
          })}
          <div className="my-2 border-t" />
          <AllocatorRow
            label="Investment"
            color="hsl(var(--primary))"
            amountCents={investBucket.amountCents}
            locked={investBucket.locked}
            maxCents={monthlyIncomeCents}
            onChange={(v) => onBucketChange(INVESTMENT_KEY, v)}
            onCommit={commitBuckets}
            onToggleLock={() => toggleLock(INVESTMENT_KEY)}
            emphasize
          />
        </CardContent>
      </Card>

      {/* Investment split */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Where the investment goes</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Split this month&apos;s {money(currentContribCents)} across holdings.
              Returns come from each ticker&apos;s past ~5 years.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Refresh returns
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {holdings.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No holdings yet. Add some on the{" "}
              <a href="/investments" className="text-primary underline-offset-2 hover:underline">
                Investments
              </a>{" "}
              page first.
            </p>
          ) : (
            <>
              {holdings.map((h) => {
                const stat = statsBySymbol[h.symbol];
                return (
                  <div key={h.symbol} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold">{h.symbol}</span>
                      {h.name && (
                        <span className="ml-2 truncate text-xs text-muted-foreground">
                          {h.name}
                        </span>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {stat
                          ? `${fmtPct(stat.annualReturn)}/yr · ±${(stat.annualVol * 100).toFixed(0)}% vol`
                          : "no history yet — hit Refresh returns"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        inputMode="decimal"
                        value={String(alloc[h.symbol] ?? 0)}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setAlloc((prev) => ({
                            ...prev,
                            [h.symbol]: Number.isFinite(v) ? v : 0,
                          }));
                        }}
                        onBlur={() => persistAlloc(alloc)}
                        className="h-8 w-16 text-right tabular"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between border-t pt-2 text-xs">
                <span className="text-muted-foreground">
                  Total {allocTotal.toFixed(0)}%
                  {Math.abs(allocTotal - 100) > 0.5 && " (normalized to 100%)"}
                </span>
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => {
                    if (holdings.length === 0) return;
                    const even = Math.round((100 / holdings.length) * 10) / 10;
                    const next = Object.fromEntries(
                      holdings.map((h) => [h.symbol, even]),
                    );
                    setAlloc(next);
                    void persistAlloc(next);
                  }}
                >
                  Split evenly
                </button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Investment plan: starting amount + contribution schedule */}
      <Card>
        <CardHeader>
          <CardTitle>Your investment plan</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Set what you start with and how much you add over time. Add a period to
            invest a set amount every few weeks or months — bounded to a date range
            or running indefinitely.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Starting amount */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Starting amount</Label>
              <div className="relative mt-1 w-40">
                <MoneyInput
                  valueCents={effectiveStartCents}
                  onCommit={(c) => {
                    setStartOverride(c);
                    void persistPlan(c, segments);
                  }}
                  className="h-9 pl-6 tabular"
                />
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {startOverride === null ? (
                <>Using your current portfolio value, {money(portfolioValueCents)}.</>
              ) : (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => {
                    setStartOverride(null);
                    void persistPlan(null, segments);
                  }}
                >
                  Use my portfolio ({money(portfolioValueCents)})
                </button>
              )}
            </p>
          </div>

          {/* Schedule segments */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Contributions</Label>
            {segments.length === 0 && (
              <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                No contributions — the projection grows the starting amount only.
              </p>
            )}
            {segments.map((seg, i) => (
              <SegmentRow
                key={i}
                seg={seg}
                currentMonth={currentMonth}
                onChange={(patch) => updateSegment(i, patch)}
                onRemove={() => removeSegment(i)}
              />
            ))}
            <Button variant="outline" size="sm" onClick={addSegment}>
              <Plus className="h-4 w-4" /> Add a period
            </Button>
          </div>

          <p className="border-t pt-3 text-xs text-muted-foreground">
            This month that works out to{" "}
            <span className="tabular font-medium text-foreground">
              {money(currentContribCents)}
            </span>{" "}
            invested.
          </p>
        </CardContent>
      </Card>

      {/* Projection */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Projection
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {money(effectiveStartCents)} to start, following your contribution plan.
            </p>
          </div>
          <Select value={String(horizon)} onValueChange={(v) => changeHorizon(Number(v))}>
            <SelectTrigger className="h-8 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HORIZONS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y} years
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-4">
          {!projection || !returns ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              <Sparkles className="mx-auto mb-2 h-5 w-5 opacity-50" />
              Allocate to at least one holding with price history, then hit
              &ldquo;Refresh returns&rdquo; to see the projection.
            </p>
          ) : (
            <>
              {/* Scenario endpoints */}
              <div className="grid grid-cols-3 gap-3">
                {SCENARIOS.map((s) => {
                  const end = projection[projection.length - 1];
                  const value =
                    s.key === "best"
                      ? end.bestCents
                      : s.key === "worst"
                        ? end.worstCents
                        : end.averageCents;
                  // Earned = projected value minus the money actually put in.
                  const earned = value - end.contributedCents;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => changeScenario(s.key)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-colors",
                        activeScenario === s.key
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/40",
                      )}
                    >
                      <p className="text-xs text-muted-foreground">
                        {s.label} · {fmtPct(returns[s.key])}/yr
                      </p>
                      <p className="tabular text-lg font-semibold">{money(value)}</p>
                      <p
                        className={cn(
                          "text-xs tabular",
                          earned >= 0 ? "text-emerald-600" : "text-red-600",
                        )}
                      >
                        {earned >= 0 ? "+" : "−"}
                        {money(Math.abs(earned))} earned
                      </p>
                    </button>
                  );
                })}
              </div>
              <ProjectionChart data={projection} />
              <p className="text-center text-xs text-muted-foreground">
                In {horizon} years, around{" "}
                <span className="font-medium text-foreground">
                  {horizonEnd ? money(horizonEnd.averageCents) : "—"}
                </span>{" "}
                on average from {horizonEnd ? money(horizonEnd.contributedCents) : "—"}{" "}
                invested. All values in {base}; the band spans worst→best (±1 std dev
                of historical returns).
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const UNITS: { value: ContribUnit; label: string }[] = [
  { value: "week", label: "weeks" },
  { value: "month", label: "months" },
];

const MONTH_OPTS = [
  { v: "01", l: "Jan" },
  { v: "02", l: "Feb" },
  { v: "03", l: "Mar" },
  { v: "04", l: "Apr" },
  { v: "05", l: "May" },
  { v: "06", l: "Jun" },
  { v: "07", l: "Jul" },
  { v: "08", l: "Aug" },
  { v: "09", l: "Sep" },
  { v: "10", l: "Oct" },
  { v: "11", l: "Nov" },
  { v: "12", l: "Dec" },
];

/**
 * Month + year dropdowns for one bound of a contribution segment. A `null` value
 * is the open-ended state — "Now" for the start, "Forever" for the end — chosen
 * via the first option in the month list. Picking a real month enables the year
 * (defaulting to the current year); the year list runs from now out 30 years.
 */
function MonthYearPicker({
  value,
  onChange,
  kind,
  currentMonth,
}: {
  value: string | null; // "YYYY-MM" or null
  onChange: (v: string | null) => void;
  kind: "from" | "to";
  currentMonth: string; // "YYYY-MM"
}) {
  const sentinel = kind === "from" ? "now" : "forever";
  const sentinelLabel = kind === "from" ? "Now" : "Forever";
  const curYear = Number(currentMonth.slice(0, 4));
  const years = Array.from({ length: 31 }, (_, i) => curYear + i);

  const month = value ? value.slice(5, 7) : sentinel;
  const year = value ? value.slice(0, 4) : "";

  function pickMonth(m: string) {
    if (m === sentinel) onChange(null);
    else onChange(`${year || curYear}-${m}`);
  }
  function pickYear(y: string) {
    onChange(`${y}-${value ? value.slice(5, 7) : "01"}`);
  }

  return (
    <div className="flex items-center gap-1">
      <Select value={month} onValueChange={pickMonth}>
        <SelectTrigger className="h-8 w-[5.25rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={sentinel}>{sentinelLabel}</SelectItem>
          {MONTH_OPTS.map((o) => (
            <SelectItem key={o.v} value={o.v}>
              {o.l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={year || undefined} onValueChange={pickYear} disabled={!value}>
        <SelectTrigger className="h-8 w-[4.75rem]">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** One row of the contribution schedule: $X every Y weeks/months, over a date
 *  range (null "from" = now, null "to" = forever). */
function SegmentRow({
  seg,
  currentMonth,
  onChange,
  onRemove,
}: {
  seg: ContribSegment;
  currentMonth: string;
  onChange: (patch: Partial<ContribSegment>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-2.5 text-sm">
      <div className="relative w-28">
        <MoneyInput
          valueCents={seg.amountCents}
          onCommit={(c) => onChange({ amountCents: c })}
          className="h-8 pl-5 tabular"
        />
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          $
        </span>
      </div>
      <span className="text-muted-foreground">every</span>
      <Input
        inputMode="numeric"
        value={String(seg.every)}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          onChange({ every: Number.isFinite(v) && v > 0 ? v : 1 });
        }}
        className="h-8 w-14 text-right tabular"
        aria-label="Every N periods"
      />
      <Select
        value={seg.unit}
        onValueChange={(v) => onChange({ unit: v as ContribUnit })}
      >
        <SelectTrigger className="h-8 w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {UNITS.map((u) => (
            <SelectItem key={u.value} value={u.value}>
              {u.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">from</span>
        <MonthYearPicker
          kind="from"
          currentMonth={currentMonth}
          value={seg.startMonth}
          onChange={(v) => onChange({ startMonth: v })}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">to</span>
        <MonthYearPicker
          kind="to"
          currentMonth={currentMonth}
          value={seg.endMonth}
          onChange={(v) => onChange({ endMonth: v })}
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="ml-auto shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        aria-label="Remove this contribution period"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Dollar input with local text state, committing parsed cents on blur / Enter. */
function MoneyInput({
  valueCents,
  onCommit,
  className,
}: {
  valueCents: number;
  onCommit: (cents: number) => void;
  className?: string;
}) {
  const [text, setText] = React.useState(centsToDecimalString(valueCents));
  React.useEffect(() => {
    setText(centsToDecimalString(valueCents));
  }, [valueCents]);

  function commit() {
    const cents = dollarsToCents(text);
    if (cents !== valueCents) onCommit(cents);
  }

  return (
    <Input
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={className}
    />
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="eyebrow text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular text-xl font-semibold", accent && "text-primary")}>
        {value}
      </p>
    </div>
  );
}

function AllocatorRow({
  label,
  color,
  amountCents,
  locked,
  maxCents,
  onChange,
  onCommit,
  onToggleLock,
  emphasize,
  recentMonths,
}: {
  label: string;
  color: string | null;
  amountCents: number;
  locked: boolean;
  maxCents: number;
  onChange: (cents: number) => void;
  onCommit: () => void;
  onToggleLock: () => void;
  emphasize?: boolean;
  recentMonths?: MonthSpend[];
}) {
  const money = useMoney();
  // Local text state for the dollar input so typing isn't clobbered by re-renders.
  const [text, setText] = React.useState(centsToDecimalString(amountCents));
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    setText(centsToDecimalString(amountCents));
  }, [amountCents]);

  const pct = maxCents > 0 ? Math.round((amountCents / maxCents) * 100) : 0;
  const expandable = recentMonths !== undefined;

  return (
    <div>
      <div className="flex items-center gap-3 py-1.5">
        <button
          type="button"
          onClick={onToggleLock}
          className={cn(
            "shrink-0 text-muted-foreground transition-colors hover:text-foreground",
            locked && "text-primary",
          )}
          aria-label={locked ? `Unlock ${label}` : `Lock ${label}`}
        >
          {locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
        </button>
        <div className="flex w-32 shrink-0 items-center gap-1.5">
          {expandable ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="flex min-w-0 items-center gap-1.5 text-left transition-colors hover:text-foreground"
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Show"} recent ${label} spending`}
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-180",
                )}
              />
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: color ?? "hsl(var(--muted-foreground))" }}
              />
              <span className="truncate text-sm">{label}</span>
            </button>
          ) : (
            <>
              <span className="w-3.5 shrink-0" />
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: color ?? "hsl(var(--muted-foreground))" }}
              />
              <span className={cn("truncate text-sm", emphasize && "font-semibold")}>
                {label}
              </span>
            </>
          )}
        </div>
        <input
          type="range"
          min={0}
          max={maxCents}
          step={100}
          value={amountCents}
          disabled={locked}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerUp={onCommit}
          onKeyUp={onCommit}
          className={cn(
            "h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary",
            locked && "cursor-not-allowed opacity-50",
          )}
          aria-label={`${label} budget`}
        />
        <span className="w-10 shrink-0 text-right text-xs tabular text-muted-foreground">
          {pct}%
        </span>
        <div className="relative w-24 shrink-0">
          <Input
            inputMode="decimal"
            value={text}
            disabled={locked}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              const cents = dollarsToCents(text);
              if (cents !== amountCents) {
                onChange(cents);
                onCommit();
              }
            }}
            className="h-8 pl-5 text-right tabular"
            aria-label={`${label} amount`}
          />
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            $
          </span>
        </div>
      </div>
      {expandable && open && (
        <RecentSpend label={label} months={recentMonths!} />
      )}
    </div>
  );
}

/** The expandable per-category recent-spend panel: a mini bar per month.
 * Mirrors the allocator row's exact column grid (lock w-4 · gap-3 · label w-32 ·
 * gap-3 · track flex-1 · gap-3 · pct w-10 · gap-3 · input w-24) so each month's
 * bar lines up edge-to-edge with the slider above it. */
function RecentSpend({ label, months }: { label: string; months: MonthSpend[] }) {
  const money = useMoney();
  if (months.length === 0) {
    return (
      <p className="pb-2 pl-7 pt-0.5 text-xs text-muted-foreground">
        No {label.toLowerCase()} spending in the last few months.
      </p>
    );
  }
  const max = Math.max(...months.map((m) => m.totalCents), 1);
  const avg = Math.round(months.reduce((a, m) => a + m.totalCents, 0) / months.length);
  return (
    <div className="space-y-1 pb-2 pt-0.5">
      {months.map((m) => (
        <div key={m.month} className="flex items-center gap-3 text-xs">
          {/* lock spacer */}
          <span className="w-4 shrink-0" />
          {/* month label — same column as the category label */}
          <span className="w-32 shrink-0 truncate text-muted-foreground">
            {monthShortLabel(m.month)}
          </span>
          {/* bar — same flex-1 track as the slider */}
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/60"
              style={{ width: `${Math.round((m.totalCents / max) * 100)}%` }}
            />
          </div>
          {/* pct spacer */}
          <span className="w-10 shrink-0" />
          {/* amount — same column as the dollar input */}
          <span className="w-24 shrink-0 text-right tabular text-muted-foreground">
            {money(m.totalCents)}
          </span>
        </div>
      ))}
      <p className="pl-7 pt-0.5 text-[11px] text-muted-foreground">
        Avg {money(avg)}/mo over {months.length} month{months.length === 1 ? "" : "s"}.
      </p>
    </div>
  );
}

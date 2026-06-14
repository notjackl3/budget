// Pure helpers for the Projection page: seed category budgets from real spend,
// rebalance a fixed income pot across buckets, blend per-ticker historical
// returns by allocation, and compound a monthly contribution forward. No IO —
// all of this is unit-testable. Money is integer cents throughout.

import type { AggExpense } from "./aggregate";
import { isIncome } from "./aggregate";
import { monthKey } from "./dates";
import type { ReturnStats } from "./investments";

/** The literal key of the investment-contribution bucket (vs. a categoryId). */
export const INVESTMENT_KEY = "investment";

/**
 * Average monthly spend per category over the most recent `months` calendar
 * months that have any spending, as a map of categoryId -> cents. Income rows
 * (negatives) are excluded. Uncategorized spend is dropped (it has no slider).
 * The denominator is the number of distinct months observed (capped at
 * `months`), so a partial history still yields a sensible average rather than
 * dividing by a fixed 3.
 */
export function averageMonthlySpendByCategory(
  expenses: AggExpense[],
  months = 3,
): Record<string, number> {
  const spend = expenses.filter((e) => !isIncome(e) && e.categoryId);
  if (spend.length === 0) return {};

  // The most-recent `months` month keys present in the data.
  const monthsSeen = [...new Set(spend.map((e) => monthKey(e.date)))].sort();
  const recent = new Set(monthsSeen.slice(-months));
  const divisor = Math.max(1, recent.size);

  const totals: Record<string, number> = {};
  for (const e of spend) {
    if (!recent.has(monthKey(e.date))) continue;
    const id = e.categoryId as string;
    totals[id] = (totals[id] ?? 0) + e.amountCents;
  }
  for (const id of Object.keys(totals)) {
    totals[id] = Math.round(totals[id] / divisor);
  }
  return totals;
}

export interface MonthSpend {
  month: string; // "YYYY-MM"
  totalCents: number;
}

/**
 * Per-category spend for each of the most recent `months` months that have any
 * spending, oldest → newest, with gaps inside the window filled as zero. Powers
 * the per-category "recent spending" dropdown on the projection allocator.
 * Income (negatives) and uncategorized rows are excluded.
 */
export function recentMonthlySpendByCategory(
  expenses: AggExpense[],
  months = 6,
): Record<string, MonthSpend[]> {
  const spend = expenses.filter((e) => !isIncome(e) && e.categoryId);
  if (spend.length === 0) return {};

  const window = [...new Set(spend.map((e) => monthKey(e.date)))]
    .sort()
    .slice(-months);
  const windowSet = new Set(window);

  // categoryId -> month -> cents
  const totals: Record<string, Record<string, number>> = {};
  for (const e of spend) {
    const m = monthKey(e.date);
    if (!windowSet.has(m)) continue;
    const id = e.categoryId as string;
    (totals[id] ??= {})[m] = (totals[id][m] ?? 0) + e.amountCents;
  }

  const out: Record<string, MonthSpend[]> = {};
  for (const id of Object.keys(totals)) {
    out[id] = window.map((m) => ({ month: m, totalCents: totals[id][m] ?? 0 }));
  }
  return out;
}

export interface Bucket {
  key: string; // categoryId, or INVESTMENT_KEY
  amountCents: number;
  locked: boolean;
}

/**
 * Rebalance the pot after the user sets `editedKey` to `newAmount`. The edited
 * bucket is clamped to [0, total]. The resulting delta is absorbed by the
 * *other unlocked* buckets, distributed proportionally to their current amounts
 * (evenly if they're all zero), and clamped so none goes negative. Locked
 * buckets and the edited bucket never move. The returned buckets always sum to
 * `totalCents` (any rounding remainder lands on the largest absorber), unless
 * locks make that impossible — then the edited bucket is capped to whatever
 * headroom the unlocked buckets allow.
 */
export function rebalance(
  buckets: Bucket[],
  editedKey: string,
  newAmount: number,
  totalCents: number,
): Bucket[] {
  const others = buckets.filter((b) => b.key !== editedKey && !b.locked);
  const lockedSum = buckets
    .filter((b) => b.key !== editedKey && b.locked)
    .reduce((a, b) => a + b.amountCents, 0);

  // The edited bucket can take at most whatever isn't pinned by locks, and the
  // others can collectively shrink only to zero — so cap the new value.
  const maxForEdited = Math.max(0, totalCents - lockedSum);
  const target = Math.max(0, Math.min(Math.round(newAmount), maxForEdited));

  // How much the unlocked others must collectively become.
  const othersTarget = Math.max(0, totalCents - lockedSum - target);
  const othersCurrent = others.reduce((a, b) => a + b.amountCents, 0);

  const newAmounts = new Map<string, number>();
  newAmounts.set(editedKey, target);

  if (others.length > 0) {
    if (othersCurrent > 0) {
      // Proportional to current share.
      let assigned = 0;
      others.forEach((b, i) => {
        const share =
          i === others.length - 1
            ? othersTarget - assigned // last one soaks the rounding remainder
            : Math.round((b.amountCents / othersCurrent) * othersTarget);
        const v = Math.max(0, share);
        newAmounts.set(b.key, v);
        assigned += v;
      });
    } else {
      // All zero -> split evenly.
      const each = Math.floor(othersTarget / others.length);
      let assigned = 0;
      others.forEach((b, i) => {
        const v = i === others.length - 1 ? othersTarget - assigned : each;
        newAmounts.set(b.key, Math.max(0, v));
        assigned += v;
      });
    }
  }

  return buckets.map((b) =>
    newAmounts.has(b.key) ? { ...b, amountCents: newAmounts.get(b.key)! } : b,
  );
}

/**
 * Adjust a bucket set so it sums exactly to `totalCents` (the income pot). Any
 * slack is absorbed by the investment bucket first; if income can't cover the
 * non-investment buckets, investment goes to zero and the rest are scaled down
 * proportionally. Used to build the initial state from seeded/saved buckets
 * before the user starts dragging (the live `rebalance` keeps it balanced after).
 */
export function reconcileToIncome(
  buckets: Bucket[],
  totalCents: number,
): Bucket[] {
  const sum = buckets.reduce((a, b) => a + b.amountCents, 0);
  if (sum === totalCents) return buckets;

  const nonInvSum = buckets
    .filter((b) => b.key !== INVESTMENT_KEY)
    .reduce((a, b) => a + b.amountCents, 0);

  // Common case: income covers spending — investment soaks up the difference.
  if (nonInvSum <= totalCents) {
    const target = totalCents - nonInvSum;
    const hasInv = buckets.some((b) => b.key === INVESTMENT_KEY);
    const out = buckets.map((b) =>
      b.key === INVESTMENT_KEY ? { ...b, amountCents: target } : b,
    );
    if (!hasInv) {
      out.push({ key: INVESTMENT_KEY, amountCents: target, locked: false });
    }
    return out;
  }

  // Over-budget: zero investment and scale spending buckets down to fit.
  let assigned = 0;
  const nonInv = buckets.filter((b) => b.key !== INVESTMENT_KEY);
  const scaled = new Map<string, number>();
  nonInv.forEach((b, i) => {
    const v =
      i === nonInv.length - 1
        ? totalCents - assigned
        : Math.round((b.amountCents / nonInvSum) * totalCents);
    scaled.set(b.key, Math.max(0, v));
    assigned += Math.max(0, v);
  });
  return buckets.map((b) =>
    b.key === INVESTMENT_KEY
      ? { ...b, amountCents: 0 }
      : { ...b, amountCents: scaled.get(b.key) ?? b.amountCents },
  );
}

export interface Allocation {
  symbol: string;
  percent: number; // 0..100
}

/**
 * Blend per-ticker return stats into a single portfolio expectation, weighting
 * by the allocation percentages (normalized to sum 1; tickers without stats are
 * dropped and the rest re-normalized). Volatility is combined as the weighted
 * average of per-ticker vols — a deliberate simplification that ignores
 * cross-correlation, which is fine for a personal long-term forecast. Returns
 * null if nothing usable is allocated.
 */
export function blendReturn(
  allocations: Allocation[],
  statsBySymbol: Record<string, ReturnStats>,
): ReturnStats | null {
  const usable = allocations
    .map((a) => ({ a, s: statsBySymbol[a.symbol] }))
    .filter((x) => x.s && x.a.percent > 0) as {
    a: Allocation;
    s: ReturnStats;
  }[];
  const totalPct = usable.reduce((sum, x) => sum + x.a.percent, 0);
  if (totalPct <= 0) return null;

  let annualReturn = 0;
  let annualVol = 0;
  let months = Infinity;
  for (const { a, s } of usable) {
    const w = a.percent / totalPct;
    annualReturn += w * s.annualReturn;
    annualVol += w * s.annualVol;
    months = Math.min(months, s.months);
  }
  return { annualReturn, annualVol, months: Number.isFinite(months) ? months : 0 };
}

export interface ProjectionPoint {
  year: number;
  valueCents: number;
}

/**
 * Compound a starting balance plus a fixed monthly contribution forward,
 * emitting one point per year (year 0 = today through year `years`). The annual
 * return is converted to an equivalent monthly rate so contributions made
 * mid-year still earn a partial year of growth.
 */
export function projectValue(opts: {
  startCents: number;
  monthlyContributionCents: number;
  annualReturn: number;
  years: number;
}): ProjectionPoint[] {
  const { startCents, monthlyContributionCents, annualReturn, years } = opts;
  const monthlyRate = (1 + annualReturn) ** (1 / 12) - 1;
  const points: ProjectionPoint[] = [{ year: 0, valueCents: Math.round(startCents) }];
  let value = startCents;
  for (let m = 1; m <= years * 12; m++) {
    value = value * (1 + monthlyRate) + monthlyContributionCents;
    if (m % 12 === 0) points.push({ year: m / 12, valueCents: Math.round(value) });
  }
  return points;
}

export type ScenarioKey = "best" | "average" | "worst";

/**
 * Best / average / worst annual returns from a blended expectation: average is
 * the mean, best/worst are ±1 annualized standard deviation (~68% band). The
 * worst case is floored so a high-vol holding can't project an absurd total
 * wipeout — a long-run portfolio loss worse than ~5%/yr isn't a useful planning
 * assumption.
 */
export function scenarioReturns(
  stats: ReturnStats,
  worstFloor = -0.05,
): Record<ScenarioKey, number> {
  return {
    best: stats.annualReturn + stats.annualVol,
    average: stats.annualReturn,
    worst: Math.max(worstFloor, stats.annualReturn - stats.annualVol),
  };
}

export interface ScenarioPoint {
  year: number;
  bestCents: number;
  averageCents: number;
  worstCents: number;
  /** Money actually put in by this year: starting balance + contributions, no
   *  growth. The flat reference line ("what you paid in"). */
  contributedCents: number;
}

/** Build the combined best/average/worst series for the projection chart. */
export function projectScenarios(opts: {
  startCents: number;
  monthlyContributionCents: number;
  stats: ReturnStats;
  years: number;
}): ScenarioPoint[] {
  const returns = scenarioReturns(opts.stats);
  const run = (annualReturn: number) =>
    projectValue({
      startCents: opts.startCents,
      monthlyContributionCents: opts.monthlyContributionCents,
      annualReturn,
      years: opts.years,
    });
  const best = run(returns.best);
  const average = run(returns.average);
  const worst = run(returns.worst);
  return average.map((p, i) => ({
    year: p.year,
    bestCents: best[i].valueCents,
    averageCents: p.valueCents,
    worstCents: worst[i].valueCents,
    contributedCents:
      opts.startCents + p.year * 12 * opts.monthlyContributionCents,
  }));
}

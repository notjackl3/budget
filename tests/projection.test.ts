import { describe, it, expect } from "vitest";
import {
  averageMonthlySpendByCategory,
  recentMonthlySpendByCategory,
  rebalance,
  reconcileToIncome,
  blendReturn,
  projectValue,
  scenarioReturns,
  projectScenarios,
  INVESTMENT_KEY,
  type Bucket,
} from "@/lib/projection";
import type { AggExpense } from "@/lib/aggregate";
import type { ReturnStats } from "@/lib/investments";

function agg(partial: Partial<AggExpense>): AggExpense {
  return {
    date: new Date("2026-06-01"),
    amountCents: 1000,
    needWant: null,
    categoryId: "c1",
    reviewed: false,
    recurring: false,
    ...partial,
  };
}

function sum(buckets: Bucket[]): number {
  return buckets.reduce((a, b) => a + b.amountCents, 0);
}

describe("averageMonthlySpendByCategory", () => {
  it("averages over the distinct months observed, ignoring income", () => {
    const expenses: AggExpense[] = [
      agg({ date: new Date("2026-04-10"), categoryId: "groc", amountCents: 30000 }),
      agg({ date: new Date("2026-05-10"), categoryId: "groc", amountCents: 50000 }),
      agg({ date: new Date("2026-06-10"), categoryId: "groc", amountCents: 40000 }),
      // income (negative) must be excluded
      agg({ date: new Date("2026-06-15"), categoryId: "groc", amountCents: -100000 }),
      // uncategorized must be dropped
      agg({ date: new Date("2026-06-12"), categoryId: null, amountCents: 9999 }),
    ];
    const res = averageMonthlySpendByCategory(expenses, 3);
    // (30000 + 50000 + 40000) / 3 months
    expect(res.groc).toBe(40000);
    expect(res.null).toBeUndefined();
  });

  it("only counts the most recent N months", () => {
    const expenses: AggExpense[] = [
      agg({ date: new Date("2026-01-10"), categoryId: "g", amountCents: 99999 }),
      agg({ date: new Date("2026-05-10"), categoryId: "g", amountCents: 20000 }),
      agg({ date: new Date("2026-06-10"), categoryId: "g", amountCents: 30000 }),
    ];
    // window of 2 months -> only May + June, divided by 2
    expect(averageMonthlySpendByCategory(expenses, 2).g).toBe(25000);
  });
});

describe("recentMonthlySpendByCategory", () => {
  it("returns per-category monthly totals over the recent window, newest last", () => {
    const expenses: AggExpense[] = [
      agg({ date: new Date("2026-04-10"), categoryId: "g", amountCents: 10000 }),
      agg({ date: new Date("2026-06-10"), categoryId: "g", amountCents: 30000 }),
      agg({ date: new Date("2026-06-20"), categoryId: "g", amountCents: 5000 }),
      agg({ date: new Date("2026-06-10"), categoryId: "x", amountCents: 7000 }),
      agg({ date: new Date("2026-06-15"), categoryId: "g", amountCents: -9999 }), // income excluded
    ];
    const res = recentMonthlySpendByCategory(expenses, 6);
    // window = [2026-04, 2026-06] (May has no spend so isn't in the present-months set)
    expect(res.g).toEqual([
      { month: "2026-04", totalCents: 10000 },
      { month: "2026-06", totalCents: 35000 },
    ]);
    // x only spent in June -> zero-filled for the earlier window month
    expect(res.x).toEqual([
      { month: "2026-04", totalCents: 0 },
      { month: "2026-06", totalCents: 7000 },
    ]);
  });

  it("limits to the most recent N months", () => {
    const expenses: AggExpense[] = [
      agg({ date: new Date("2026-01-10"), categoryId: "g", amountCents: 1 }),
      agg({ date: new Date("2026-05-10"), categoryId: "g", amountCents: 2 }),
      agg({ date: new Date("2026-06-10"), categoryId: "g", amountCents: 3 }),
    ];
    const res = recentMonthlySpendByCategory(expenses, 2);
    expect(res.g.map((m) => m.month)).toEqual(["2026-05", "2026-06"]);
  });
});

describe("rebalance", () => {
  const total = 100000;
  const base: Bucket[] = [
    { key: "a", amountCents: 40000, locked: false },
    { key: "b", amountCents: 30000, locked: false },
    { key: INVESTMENT_KEY, amountCents: 30000, locked: false },
  ];

  it("conserves the total when one bucket changes", () => {
    const out = rebalance(base, "a", 10000, total);
    expect(sum(out)).toBe(total);
    expect(out.find((b) => b.key === "a")!.amountCents).toBe(10000);
  });

  it("distributes the freed amount proportionally to other unlocked buckets", () => {
    // lower a by 30k (40k -> 10k). b and investment share 30k:30k = 50/50.
    const out = rebalance(base, "a", 10000, total);
    const b = out.find((x) => x.key === "b")!.amountCents;
    const inv = out.find((x) => x.key === INVESTMENT_KEY)!.amountCents;
    expect(b).toBe(45000);
    expect(inv).toBe(45000);
  });

  it("never moves a locked bucket", () => {
    const locked: Bucket[] = [
      { key: "a", amountCents: 40000, locked: false },
      { key: "b", amountCents: 30000, locked: true },
      { key: INVESTMENT_KEY, amountCents: 30000, locked: false },
    ];
    const out = rebalance(locked, "a", 10000, total);
    expect(out.find((x) => x.key === "b")!.amountCents).toBe(30000); // pinned
    expect(out.find((x) => x.key === INVESTMENT_KEY)!.amountCents).toBe(60000);
    expect(sum(out)).toBe(total);
  });

  it("caps an increase at the headroom left by locks", () => {
    const locked: Bucket[] = [
      { key: "a", amountCents: 40000, locked: false },
      { key: "b", amountCents: 30000, locked: true },
      { key: INVESTMENT_KEY, amountCents: 30000, locked: false },
    ];
    // try to push a to 100k; b is locked at 30k, so a can be at most 70k.
    const out = rebalance(locked, "a", 100000, total);
    expect(out.find((x) => x.key === "a")!.amountCents).toBe(70000);
    expect(out.find((x) => x.key === INVESTMENT_KEY)!.amountCents).toBe(0);
    expect(sum(out)).toBe(total);
  });

  it("splits evenly when other buckets are all zero", () => {
    const zeros: Bucket[] = [
      { key: "a", amountCents: 100000, locked: false },
      { key: "b", amountCents: 0, locked: false },
      { key: INVESTMENT_KEY, amountCents: 0, locked: false },
    ];
    const out = rebalance(zeros, "a", 60000, total);
    expect(out.find((x) => x.key === "b")!.amountCents).toBe(20000);
    expect(out.find((x) => x.key === INVESTMENT_KEY)!.amountCents).toBe(20000);
    expect(sum(out)).toBe(total);
  });
});

describe("reconcileToIncome", () => {
  it("puts the slack into investment when income covers spending", () => {
    const buckets: Bucket[] = [
      { key: "a", amountCents: 30000, locked: false },
      { key: INVESTMENT_KEY, amountCents: 0, locked: false },
    ];
    const out = reconcileToIncome(buckets, 100000);
    expect(out.find((b) => b.key === INVESTMENT_KEY)!.amountCents).toBe(70000);
    expect(sum(out)).toBe(100000);
  });

  it("adds an investment bucket if missing", () => {
    const buckets: Bucket[] = [{ key: "a", amountCents: 30000, locked: false }];
    const out = reconcileToIncome(buckets, 100000);
    expect(out.find((b) => b.key === INVESTMENT_KEY)?.amountCents).toBe(70000);
    expect(sum(out)).toBe(100000);
  });

  it("scales spending down and zeroes investment when over budget", () => {
    const buckets: Bucket[] = [
      { key: "a", amountCents: 80000, locked: false },
      { key: "b", amountCents: 80000, locked: false },
      { key: INVESTMENT_KEY, amountCents: 10000, locked: false },
    ];
    const out = reconcileToIncome(buckets, 100000);
    expect(out.find((b) => b.key === INVESTMENT_KEY)!.amountCents).toBe(0);
    expect(sum(out)).toBe(100000);
    // a and b were equal, so each ~50k after scaling
    expect(out.find((b) => b.key === "a")!.amountCents).toBe(50000);
    expect(out.find((b) => b.key === "b")!.amountCents).toBe(50000);
  });
});

describe("blendReturn", () => {
  const stats: Record<string, ReturnStats> = {
    AAA: { annualReturn: 0.1, annualVol: 0.2, months: 60 },
    BBB: { annualReturn: 0.04, annualVol: 0.05, months: 36 },
  };

  it("weights by allocation percent and normalizes", () => {
    const out = blendReturn(
      [
        { symbol: "AAA", percent: 50 },
        { symbol: "BBB", percent: 50 },
      ],
      stats,
    )!;
    expect(out.annualReturn).toBeCloseTo(0.07, 10);
    expect(out.annualVol).toBeCloseTo(0.125, 10);
    expect(out.months).toBe(36); // min across used tickers
  });

  it("drops tickers without stats and re-normalizes", () => {
    const out = blendReturn(
      [
        { symbol: "AAA", percent: 50 },
        { symbol: "ZZZ", percent: 50 }, // no stats
      ],
      stats,
    )!;
    expect(out.annualReturn).toBeCloseTo(0.1, 10); // 100% AAA after dropping ZZZ
  });

  it("returns null when nothing usable is allocated", () => {
    expect(blendReturn([{ symbol: "ZZZ", percent: 100 }], stats)).toBeNull();
    expect(blendReturn([], stats)).toBeNull();
  });
});

describe("projectValue", () => {
  it("compounds a lump sum with no contributions", () => {
    const pts = projectValue({
      startCents: 100000,
      monthlyContributionCents: 0,
      annualReturn: 0.1,
      years: 1,
    });
    expect(pts[0]).toEqual({ year: 0, valueCents: 100000 });
    // 10% over a year via monthly compounding ≈ 110000
    expect(pts[1].valueCents).toBe(110000);
  });

  it("adds monthly contributions with zero return", () => {
    const pts = projectValue({
      startCents: 0,
      monthlyContributionCents: 1000,
      annualReturn: 0,
      years: 2,
    });
    expect(pts[1].valueCents).toBe(12000);
    expect(pts[2].valueCents).toBe(24000);
  });

  it("emits one point per year plus year 0", () => {
    const pts = projectValue({
      startCents: 0,
      monthlyContributionCents: 100,
      annualReturn: 0.05,
      years: 10,
    });
    expect(pts).toHaveLength(11);
    expect(pts.map((p) => p.year)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("scenarioReturns / projectScenarios", () => {
  const stats: ReturnStats = { annualReturn: 0.08, annualVol: 0.1, months: 60 };

  it("centers on average with ±1 std dev bands", () => {
    const r = scenarioReturns(stats);
    expect(r.average).toBeCloseTo(0.08, 10);
    expect(r.best).toBeCloseTo(0.18, 10);
    expect(r.worst).toBeCloseTo(-0.02, 10); // above the -5% floor
  });

  it("floors the worst case", () => {
    const r = scenarioReturns({ annualReturn: 0.05, annualVol: 0.5, months: 60 });
    expect(r.worst).toBe(-0.05); // would be -0.45 without the floor
  });

  it("orders best >= average >= worst at the horizon", () => {
    const series = projectScenarios({
      startCents: 100000,
      monthlyContributionCents: 50000,
      stats,
      years: 10,
    });
    const end = series[series.length - 1];
    expect(end.bestCents).toBeGreaterThanOrEqual(end.averageCents);
    expect(end.averageCents).toBeGreaterThanOrEqual(end.worstCents);
  });

  it("tracks money put in (start + contributions, no growth)", () => {
    const series = projectScenarios({
      startCents: 100000,
      monthlyContributionCents: 50000,
      stats,
      years: 10,
    });
    expect(series[0].contributedCents).toBe(100000); // year 0 = just the start
    // year 10: 100000 + 10*12*50000
    expect(series[series.length - 1].contributedCents).toBe(100000 + 120 * 50000);
    // growth means the average ends up well above what was put in
    const end = series[series.length - 1];
    expect(end.averageCents).toBeGreaterThan(end.contributedCents);
  });
});

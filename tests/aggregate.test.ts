import { describe, it, expect } from "vitest";
import {
  sumCents,
  categoryBreakdown,
  needWantSplit,
  monthlySummary,
  spendByMonth,
  spendByMonthForYear,
  incomeByMonthForYear,
  cashflowByMonthForYear,
  type AggExpense,
} from "@/lib/aggregate";

function exp(partial: Partial<AggExpense>): AggExpense {
  return {
    date: new Date("2026-06-01"),
    amountCents: 1000,
    needWant: null,
    categoryId: "c1",
    categoryName: "Groceries",
    categoryColor: "#16a34a",
    reviewed: false,
    recurring: false,
    ...partial,
  };
}

const sample: AggExpense[] = [
  exp({ date: new Date("2026-06-02"), amountCents: 4500, needWant: "Need", categoryId: "groc", categoryName: "Groceries" }),
  exp({ date: new Date("2026-06-10"), amountCents: 2000, needWant: "Want", categoryId: "eat", categoryName: "Eating Out" }),
  exp({ date: new Date("2026-06-15"), amountCents: 3000, needWant: "Want", categoryId: "eat", categoryName: "Eating Out" }),
  exp({ date: new Date("2026-06-20"), amountCents: 1500, needWant: null, categoryId: null, categoryName: null }),
  exp({ date: new Date("2026-05-05"), amountCents: 9999, needWant: "Need", categoryId: "groc", categoryName: "Groceries" }),
];

describe("sumCents", () => {
  it("sums amounts", () => {
    expect(sumCents(sample)).toBe(4500 + 2000 + 3000 + 1500 + 9999);
  });
  it("returns 0 for empty input", () => {
    expect(sumCents([])).toBe(0);
  });
});

describe("categoryBreakdown", () => {
  const june = sample.filter((e) => e.date.getMonth() === 5);
  const breakdown = categoryBreakdown(june);

  it("groups by category and sorts descending by total", () => {
    expect(breakdown[0].name).toBe("Eating Out");
    expect(breakdown[0].totalCents).toBe(5000);
    expect(breakdown[0].count).toBe(2);
  });

  it("buckets null category as Uncategorized", () => {
    const uncat = breakdown.find((b) => b.categoryId === null);
    expect(uncat?.name).toBe("Uncategorized");
    expect(uncat?.totalCents).toBe(1500);
  });
});

describe("needWantSplit", () => {
  it("splits needs, wants, and unspecified", () => {
    const june = sample.filter((e) => e.date.getMonth() === 5);
    const split = needWantSplit(june);
    expect(split.needsCents).toBe(4500);
    expect(split.wantsCents).toBe(5000);
    expect(split.comfortCents).toBe(0);
    expect(split.unspecifiedCents).toBe(1500);
  });

  it("buckets Comfort separately from Need/Want", () => {
    const split = needWantSplit([
      exp({ needWant: "Need", amountCents: 100 }),
      exp({ needWant: "Want", amountCents: 200 }),
      exp({ needWant: "Comfort", amountCents: 300 }),
      exp({ needWant: "Comfort", amountCents: 400 }),
      exp({ needWant: null, amountCents: 500 }),
    ]);
    expect(split.needsCents).toBe(100);
    expect(split.wantsCents).toBe(200);
    expect(split.comfortCents).toBe(700);
    expect(split.unspecifiedCents).toBe(500);
  });

  it("splits eating-out per meal by the threshold, ignoring its stored flag", () => {
    const split = needWantSplit(
      [
        // cheap meal: fully a Need (under the $15 floor)
        exp({ categorySlug: "eating-out", amountCents: 1200, needWant: "Want" }),
        // pricey meal: $15 Need floor + $10 Comfort excess
        exp({ categorySlug: "eating-out", amountCents: 2500, needWant: "Want" }),
        // non-food rideshare Comfort counts in full
        exp({ categorySlug: "comfort", amountCents: 1300, needWant: "Comfort" }),
      ],
      1500,
    );
    expect(split.foodNeedCents).toBe(1200 + 1500);
    expect(split.foodComfortCents).toBe(1000);
    // Need floor flows into needs; food excess + rideshare into comfort.
    expect(split.needsCents).toBe(2700);
    expect(split.comfortCents).toBe(1000 + 1300);
    expect(split.wantsCents).toBe(0);
  });
});

describe("monthlySummary", () => {
  const summary = monthlySummary(sample, "2026-06");

  it("computes totals scoped to the month", () => {
    expect(summary.totalCents).toBe(4500 + 2000 + 3000 + 1500);
    expect(summary.count).toBe(4);
    expect(summary.needsCents).toBe(4500);
    expect(summary.wantsCents).toBe(5000);
  });

  it("identifies the biggest category", () => {
    expect(summary.biggestCategory?.name).toBe("Eating Out");
    expect(summary.biggestCategory?.totalCents).toBe(5000);
  });

  it("excludes other months", () => {
    const may = monthlySummary(sample, "2026-05");
    expect(may.totalCents).toBe(9999);
    expect(may.count).toBe(1);
  });
});

describe("spendByMonth", () => {
  it("aggregates per month ascending", () => {
    const series = spendByMonth(sample);
    expect(series).toEqual([
      { month: "2026-05", totalCents: 9999 },
      { month: "2026-06", totalCents: 11000 },
    ]);
  });
});

describe("spendByMonthForYear", () => {
  it("returns 12 months, filling gaps with 0", () => {
    const series = spendByMonthForYear(sample, 2026);
    expect(series).toHaveLength(12);
    expect(series.find((s) => s.month === "2026-06")?.totalCents).toBe(11000);
    expect(series.find((s) => s.month === "2026-01")?.totalCents).toBe(0);
  });
});

// Income rows are negative amounts; the helpers flip them to positive money-in.
const withIncome: AggExpense[] = [
  ...sample,
  exp({ date: new Date("2026-06-10"), amountCents: -500000, incomeType: "Salary", needWant: null }),
  exp({ date: new Date("2026-05-15"), amountCents: -2000, incomeType: "Refund", needWant: null }),
];

describe("incomeByMonthForYear", () => {
  it("flips negatives to positive money-in and fills 12 months", () => {
    const series = incomeByMonthForYear(withIncome, 2026);
    expect(series).toHaveLength(12);
    expect(series.find((s) => s.month === "2026-06")?.totalCents).toBe(500000);
    expect(series.find((s) => s.month === "2026-05")?.totalCents).toBe(2000);
    expect(series.find((s) => s.month === "2026-01")?.totalCents).toBe(0);
  });
});

describe("cashflowByMonthForYear", () => {
  it("pairs income and spend per month and computes net", () => {
    const series = cashflowByMonthForYear(withIncome, 2026);
    const june = series.find((s) => s.month === "2026-06");
    expect(june).toEqual({
      month: "2026-06",
      incomeCents: 500000,
      spendCents: 11000,
      netCents: 489000,
    });
    // A month with more spend than income nets negative.
    const may = series.find((s) => s.month === "2026-05");
    expect(may?.netCents).toBe(2000 - 9999);
  });
});

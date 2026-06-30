import { describe, it, expect } from "vitest";
import {
  annualIncomeCents,
  monthlyIncomeCents,
  incomeTotals,
  isCadence,
  cadenceLabel,
  jobActiveInMonth,
  jobIncomeForMonth,
  jobIncomeByMonthForYear,
} from "../src/lib/income";

describe("annualIncomeCents — cadence normalization", () => {
  it("annualizes each fixed cadence by its periods/year", () => {
    expect(annualIncomeCents({ payCents: 500000, cadence: "monthly" })).toBe(6_000_000);
    expect(annualIncomeCents({ payCents: 100000, cadence: "weekly" })).toBe(5_200_000);
    expect(annualIncomeCents({ payCents: 200000, cadence: "biweekly" })).toBe(5_200_000);
    expect(annualIncomeCents({ payCents: 250000, cadence: "semimonthly" })).toBe(6_000_000);
    expect(annualIncomeCents({ payCents: 8_000_000, cadence: "annual" })).toBe(8_000_000);
  });

  it("annualizes hourly pay by hours/week * 52", () => {
    // $20.00/hr * 40h * 52 = $41,600
    expect(
      annualIncomeCents({ payCents: 2000, cadence: "hourly", hoursPerWeek: 40 }),
    ).toBe(4_160_000);
  });

  it("hourly with no hours set earns nothing", () => {
    expect(annualIncomeCents({ payCents: 2000, cadence: "hourly" })).toBe(0);
    expect(
      annualIncomeCents({ payCents: 2000, cadence: "hourly", hoursPerWeek: null }),
    ).toBe(0);
  });

  it("unknown cadence and non-finite pay degrade to 0", () => {
    expect(annualIncomeCents({ payCents: 1000, cadence: "lunar" })).toBe(0);
    expect(annualIncomeCents({ payCents: NaN, cadence: "monthly" })).toBe(0);
  });
});

describe("monthlyIncomeCents", () => {
  it("is the annual figure over 12", () => {
    expect(monthlyIncomeCents({ payCents: 6_000_000, cadence: "annual" })).toBe(500_000);
    expect(monthlyIncomeCents({ payCents: 500000, cadence: "monthly" })).toBe(500_000);
  });
});

describe("incomeTotals", () => {
  it("sums active jobs and skips paused ones", () => {
    const totals = incomeTotals([
      { payCents: 500000, cadence: "monthly", active: true }, // $5k/mo
      { payCents: 2000, cadence: "hourly", hoursPerWeek: 10, active: true }, // $200/wk -> $10,400/yr
      { payCents: 999999, cadence: "monthly", active: false }, // paused -> excluded
    ]);
    expect(totals.annualCents).toBe(6_000_000 + 1_040_000);
    expect(totals.monthlyCents).toBe(Math.round((6_000_000 + 1_040_000) / 12));
  });

  it("treats a missing active flag as active", () => {
    const totals = incomeTotals([{ payCents: 100000, cadence: "monthly" }]);
    expect(totals.annualCents).toBe(1_200_000);
  });
});

describe("jobActiveInMonth — start/end window", () => {
  const job = { payCents: 100000, cadence: "monthly", startDate: "2026-03-01", endDate: "2026-08-31" };
  it("is active only within [start, end] at month granularity", () => {
    expect(jobActiveInMonth(job, "2026-02")).toBe(false); // before start
    expect(jobActiveInMonth(job, "2026-03")).toBe(true); // start month
    expect(jobActiveInMonth(job, "2026-06")).toBe(true);
    expect(jobActiveInMonth(job, "2026-08")).toBe(true); // end month
    expect(jobActiveInMonth(job, "2026-09")).toBe(false); // after end
  });
  it("open-ended on either side when a bound is missing", () => {
    expect(jobActiveInMonth({ payCents: 1, cadence: "monthly" }, "2020-01")).toBe(true);
    expect(jobActiveInMonth({ payCents: 1, cadence: "monthly", startDate: "2026-05-01" }, "2030-12")).toBe(true);
  });
  it("a paused job still counts within a defined window (finished past job)", () => {
    // Pausing a bounded job doesn't erase the months it actually earned.
    expect(jobActiveInMonth({ ...job, active: false }, "2026-06")).toBe(true);
    expect(jobActiveInMonth({ ...job, active: false }, "2026-09")).toBe(false); // still after end
  });
  it("a paused open-ended job (no end date) earns nothing", () => {
    expect(
      jobActiveInMonth(
        { payCents: 1, cadence: "monthly", startDate: "2026-01-01", active: false },
        "2026-06",
      ),
    ).toBe(false);
  });
});

describe("jobIncomeForMonth / jobIncomeByMonthForYear", () => {
  const jobs = [
    { payCents: 500000, cadence: "monthly", startDate: "2026-01-01", endDate: null }, // $5k all year
    { payCents: 120000, cadence: "monthly", startDate: "2026-04-15", endDate: "2026-06-30" }, // $1.2k Apr–Jun
  ];
  it("sums monthly pay of jobs active that month", () => {
    expect(jobIncomeForMonth(jobs, "2026-03")).toBe(500000);
    expect(jobIncomeForMonth(jobs, "2026-05")).toBe(620000);
    expect(jobIncomeForMonth(jobs, "2026-07")).toBe(500000);
  });
  it("produces a 12-month series", () => {
    const series = jobIncomeByMonthForYear(jobs, 2026);
    expect(series).toHaveLength(12);
    expect(series.find((s) => s.month === "2026-05")?.totalCents).toBe(620000);
    expect(series.find((s) => s.month === "2026-12")?.totalCents).toBe(500000);
  });
});

describe("cadence helpers", () => {
  it("validates cadence values", () => {
    expect(isCadence("monthly")).toBe(true);
    expect(isCadence("hourly")).toBe(true);
    expect(isCadence("fortnightly")).toBe(false);
    expect(isCadence(42)).toBe(false);
  });
  it("labels cadences, falling back to the raw value", () => {
    expect(cadenceLabel("biweekly")).toBe("Every 2 weeks");
    expect(cadenceLabel("mystery")).toBe("mystery");
  });
});

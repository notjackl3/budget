import { describe, it, expect } from "vitest";
import {
  taxFromGrossNet,
  netFromGrossRate,
  resolveTriad,
} from "../src/lib/tax";
import { incomeTotals } from "../src/lib/income";

describe("taxFromGrossNet", () => {
  it("derives tax and effective rate from a gross/net pair", () => {
    const { taxCents, rate } = taxFromGrossNet(100_000, 73_000);
    expect(taxCents).toBe(27_000);
    expect(rate).toBeCloseTo(0.27, 5);
  });

  it("returns zero tax when gross is unknown", () => {
    expect(taxFromGrossNet(null, 50_000)).toEqual({ taxCents: 0, rate: 0 });
    expect(taxFromGrossNet(undefined, 50_000)).toEqual({ taxCents: 0, rate: 0 });
  });

  it("returns zero tax when gross is not greater than net", () => {
    expect(taxFromGrossNet(50_000, 50_000)).toEqual({ taxCents: 0, rate: 0 });
    expect(taxFromGrossNet(40_000, 50_000)).toEqual({ taxCents: 0, rate: 0 });
  });
});

describe("netFromGrossRate", () => {
  it("computes take-home from gross and a rate", () => {
    expect(netFromGrossRate(100_000, 0.27)).toBe(73_000);
    expect(netFromGrossRate(217_600, 0)).toBe(217_600);
  });

  it("clamps out-of-range rates to [0, 1]", () => {
    expect(netFromGrossRate(100_000, 1.5)).toBe(0);
    expect(netFromGrossRate(100_000, -0.5)).toBe(100_000);
    expect(netFromGrossRate(100_000, NaN)).toBe(100_000);
  });

  it("round-trips with taxFromGrossNet (within rounding)", () => {
    const net = netFromGrossRate(123_456, 0.3);
    const { rate } = taxFromGrossNet(123_456, net);
    expect(rate).toBeCloseTo(0.3, 3);
  });
});

describe("resolveTriad — fill any two of Gross/Net/Tax", () => {
  it("derives tax from gross + net", () => {
    const r = resolveTriad("3000", "2176", "", ["net", "gross"]);
    expect(r.grossCents).toBe(300_000);
    expect(r.netCents).toBe(217_600);
    expect(r.taxCents).toBe(82_400);
    expect(r.tax).toBe("824.00");
  });

  it("derives net from gross + tax", () => {
    const r = resolveTriad("3000", "", "824", ["tax", "gross"]);
    expect(r.grossCents).toBe(300_000);
    expect(r.netCents).toBe(217_600);
    expect(r.net).toBe("2176.00");
  });

  it("derives gross from net + tax", () => {
    const r = resolveTriad("", "2176", "824", ["tax", "net"]);
    expect(r.grossCents).toBe(300_000);
    expect(r.gross).toBe("3000.00");
    expect(r.netCents).toBe(217_600);
  });

  it("treats a single value as take-home with no tax", () => {
    const r = resolveTriad("", "2176", "", ["net"]);
    expect(r.grossCents).toBeNull();
    expect(r.netCents).toBe(217_600);
    expect(r.tax).toBe("");
  });

  it("uses the two most-recently-edited fields when all three are filled", () => {
    // Started gross+net (tax was 824), then edited tax to 900 most recently.
    // Priority [tax, net, gross] => trust net + tax, recompute gross.
    const r = resolveTriad("3000", "2176", "900", ["tax", "net", "gross"]);
    expect(r.netCents).toBe(217_600);
    expect(r.grossCents).toBe(307_600); // 2176 + 900
  });

  it("tolerates thousands separators in any field", () => {
    const r = resolveTriad("2,816.66", "2,176.00", "", ["net", "gross"]);
    expect(r.grossCents).toBe(281_666);
    expect(r.netCents).toBe(217_600);
    expect(r.taxCents).toBe(64_066);
  });
});

describe("incomeTotals — gross and tax", () => {
  it("sums gross and derives tax for jobs that carry a gross amount", () => {
    const t = incomeTotals([
      { payCents: 200_000, grossCents: 300_000, cadence: "monthly" },
      { payCents: 100_000, grossCents: 130_000, cadence: "monthly" },
    ]);
    expect(t.annualCents).toBe(3_600_000); // net: (2000+1000)*12
    expect(t.grossAnnualCents).toBe(5_160_000); // gross: (3000+1300)*12
    expect(t.taxAnnualCents).toBe(1_560_000);
    expect(t.monthlyCents).toBe(300_000);
    expect(t.grossMonthlyCents).toBe(430_000);
    expect(t.taxMonthlyCents).toBe(130_000);
  });

  it("treats jobs without gross as gross = net (zero tax)", () => {
    const t = incomeTotals([
      { payCents: 200_000, cadence: "monthly" },
      { payCents: 100_000, grossCents: 130_000, cadence: "monthly" },
    ]);
    expect(t.grossAnnualCents).toBe(3_960_000); // (2000 + 1300) * 12
    expect(t.taxAnnualCents).toBe(360_000); // only the second job is taxed
  });

  it("excludes paused jobs from every total", () => {
    const t = incomeTotals([
      { payCents: 200_000, grossCents: 300_000, cadence: "monthly", active: false },
    ]);
    expect(t.annualCents).toBe(0);
    expect(t.grossAnnualCents).toBe(0);
    expect(t.taxAnnualCents).toBe(0);
  });
});

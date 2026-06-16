import { describe, it, expect } from "vitest";
import {
  parseAmountToCents,
  dollarsToCents,
  centsToDecimalString,
  formatMoney,
} from "@/lib/money";

describe("parseAmountToCents", () => {
  it("parses plain amounts", () => {
    expect(parseAmountToCents("41.39")).toBe(4139);
    expect(parseAmountToCents("1,363.85")).toBe(136385);
    expect(parseAmountToCents("0.00")).toBe(0);
  });

  it("treats a trailing minus as a credit", () => {
    expect(parseAmountToCents("41.39-")).toBe(-4139);
    expect(parseAmountToCents("-41.39")).toBe(-4139);
  });

  it("avoids floating-point drift", () => {
    expect(parseAmountToCents("0.10")).toBe(10);
    expect(parseAmountToCents("105.94")).toBe(10594);
  });
});

describe("dollarsToCents", () => {
  it("rounds to nearest cent", () => {
    expect(dollarsToCents(12.34)).toBe(1234);
    expect(dollarsToCents("9.005")).toBe(901);
    expect(dollarsToCents("")).toBe(0);
  });

  it("collapses non-finite input to 0 (never reaches an Int column)", () => {
    expect(dollarsToCents(Infinity)).toBe(0);
    expect(dollarsToCents(-Infinity)).toBe(0);
    expect(dollarsToCents(NaN)).toBe(0);
    expect(dollarsToCents("not money")).toBe(0);
    expect(dollarsToCents("1e500")).toBe(0); // overflows to Infinity
  });

  it("handles negatives and large values", () => {
    expect(dollarsToCents(-42.5)).toBe(-4250);
    expect(dollarsToCents(1_000_000)).toBe(100_000_000);
  });

  it("tolerates thousands separators", () => {
    expect(dollarsToCents("2,816.66")).toBe(281666);
    expect(dollarsToCents("1,000,000")).toBe(100_000_000);
  });
});

describe("parseAmountToCents edge cases", () => {
  it("returns 0 for unparseable input", () => {
    expect(parseAmountToCents("")).toBe(0);
    expect(parseAmountToCents("   ")).toBe(0);
    expect(parseAmountToCents("abc")).toBe(0);
  });

  it("ignores currency symbols and whitespace", () => {
    expect(parseAmountToCents(" $1,234.56 ")).toBe(123456);
    expect(parseAmountToCents("C$10.00")).toBe(1000);
  });
});

describe("centsToDecimalString", () => {
  it("formats with two decimals", () => {
    expect(centsToDecimalString(136385)).toBe("1363.85");
    expect(centsToDecimalString(5)).toBe("0.05");
  });
});

describe("formatMoney", () => {
  it("formats CAD with grouping", () => {
    expect(formatMoney(136385)).toBe("C$1,363.85");
    expect(formatMoney(4139, "C$")).toBe("C$41.39");
  });
  it("formats negatives with a leading minus", () => {
    expect(formatMoney(-500)).toBe("-C$5.00");
  });
  it("respects a custom symbol", () => {
    expect(formatMoney(10000, "$")).toBe("$100.00");
  });
});

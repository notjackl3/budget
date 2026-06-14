import { describe, it, expect } from "vitest";
import {
  parseYahooChart,
  parseFxRate,
  parseYahooSearch,
  guessCurrency,
  toBaseCents,
  valueHolding,
  portfolioTotals,
} from "../src/lib/investments";

// A trimmed Yahoo v8 chart payload, shaped like the real response.
const yahooPayload = {
  chart: {
    result: [
      {
        meta: {
          symbol: "SHOP.TO",
          currency: "CAD",
          regularMarketPrice: 151.47,
          chartPreviousClose: 154.22,
          regularMarketTime: 1781294400,
          longName: "Shopify Inc.",
          shortName: "SHOPIFY INC",
        },
      },
    ],
  },
};

describe("parseYahooChart", () => {
  it("extracts price (in cents), currency, name, and day change", () => {
    const q = parseYahooChart(yahooPayload);
    expect(q).not.toBeNull();
    expect(q!.symbol).toBe("SHOP.TO");
    expect(q!.priceCents).toBe(15147);
    expect(q!.currency).toBe("CAD");
    expect(q!.name).toBe("Shopify Inc.");
    // (151.47 - 154.22) / 154.22 * 100 ≈ -1.783%
    expect(q!.changePct).toBeCloseTo(-1.783, 2);
    expect(q!.asOfMs).toBe(1781294400 * 1000);
  });

  it("prefers previousClose over chartPreviousClose when present", () => {
    const q = parseYahooChart({
      chart: {
        result: [
          { meta: { symbol: "X", currency: "USD", regularMarketPrice: 110, previousClose: 100, chartPreviousClose: 999 } },
        ],
      },
    });
    expect(q!.changePct).toBeCloseTo(10, 5);
  });

  it("returns null for malformed or priceless payloads", () => {
    expect(parseYahooChart({})).toBeNull();
    expect(parseYahooChart({ chart: { result: [] } })).toBeNull();
    expect(parseYahooChart({ chart: { result: [{ meta: {} }] } })).toBeNull();
    expect(parseYahooChart(null)).toBeNull();
  });
});

describe("parseFxRate", () => {
  it("reads the FX pair price", () => {
    expect(
      parseFxRate({ chart: { result: [{ meta: { regularMarketPrice: 1.3989 } }] } }),
    ).toBe(1.3989);
  });
  it("returns null when missing", () => {
    expect(parseFxRate({})).toBeNull();
  });
});

describe("guessCurrency", () => {
  it("maps TSX/TSXV/NEO/CSE suffixes to CAD", () => {
    expect(guessCurrency("SHOP.TO")).toBe("CAD");
    expect(guessCurrency("ABC.V")).toBe("CAD");
    expect(guessCurrency("XYZ.NE")).toBe("CAD");
    expect(guessCurrency("FOO.CN")).toBe("CAD");
  });
  it("defaults plain US-style tickers to USD", () => {
    expect(guessCurrency("QQQ")).toBe("USD");
    expect(guessCurrency("AAPL")).toBe("USD");
  });
});

describe("parseYahooSearch", () => {
  const payload = {
    quotes: [
      {
        symbol: "QQQ",
        shortname: "Invesco QQQ Trust, Series 1",
        longname: "Invesco QQQ Trust, Series 1",
        quoteType: "ETF",
        typeDisp: "ETF",
        exchDisp: "NASDAQ",
        isYahooFinance: true,
      },
      {
        symbol: "QQQ.TO",
        shortname: "Some Canadian Fund",
        quoteType: "ETF",
        typeDisp: "ETF",
        exchDisp: "Toronto",
        isYahooFinance: true,
      },
      // dropped: an option-style quote and a non-yahoo entry
      { symbol: "QQQ240101C", quoteType: "OPTION", isYahooFinance: true },
      { symbol: "JUNK", isYahooFinance: false },
      { shortname: "no symbol here", isYahooFinance: true },
    ],
  };

  it("maps tradable matches with name, exchange, type, and guessed currency", () => {
    const matches = parseYahooSearch(payload);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({
      symbol: "QQQ",
      name: "Invesco QQQ Trust, Series 1",
      exchange: "NASDAQ",
      type: "ETF",
      currency: "USD",
    });
    expect(matches[1].symbol).toBe("QQQ.TO");
    expect(matches[1].currency).toBe("CAD");
    expect(matches[1].name).toBe("Some Canadian Fund"); // falls back to shortname
  });

  it("returns [] for missing/odd shapes", () => {
    expect(parseYahooSearch({})).toEqual([]);
    expect(parseYahooSearch(null)).toEqual([]);
    expect(parseYahooSearch({ quotes: "nope" })).toEqual([]);
  });
});

describe("toBaseCents", () => {
  it("is a no-op when currency equals base", () => {
    expect(toBaseCents(10000, "CAD", "CAD", {})).toBe(10000);
  });
  it("applies the FX rate for a foreign currency", () => {
    expect(toBaseCents(10000, "USD", "CAD", { USD: 1.4 })).toBe(14000);
  });
  it("falls back to 1 (no conversion) when the rate is missing", () => {
    expect(toBaseCents(10000, "USD", "CAD", {})).toBe(10000);
  });
});

describe("valueHolding", () => {
  const base = "CAD";

  it("computes market value, cost, and gain in native + base", () => {
    const v = valueHolding(
      { symbol: "AAPL", shares: 10, avgCostCents: 10000, currency: "USD" }, // cost $100/sh
      { symbol: "AAPL", priceCents: 15000, currency: "USD" }, // price $150
      base,
      { USD: 1.4 },
    );
    expect(v.marketValueCents).toBe(150000); // 10 * 15000
    expect(v.costCents).toBe(100000); // 10 * 10000
    expect(v.gainCents).toBe(50000);
    expect(v.gainPct).toBeCloseTo(50, 5);
    expect(v.marketValueBaseCents).toBe(210000); // *1.4 CAD
    expect(v.costBaseCents).toBe(140000);
    expect(v.gainBaseCents).toBe(70000);
  });

  it("handles a holding with no cost basis (gain unknown)", () => {
    const v = valueHolding(
      { symbol: "VFV.TO", shares: 5, avgCostCents: null, currency: "CAD" },
      { symbol: "VFV.TO", priceCents: 12000, currency: "CAD" },
      base,
      {},
    );
    expect(v.marketValueCents).toBe(60000);
    expect(v.costCents).toBeNull();
    expect(v.gainCents).toBeNull();
    expect(v.gainPct).toBeNull();
    expect(v.marketValueBaseCents).toBe(60000);
  });

  it("handles an unpriced holding (no quote)", () => {
    const v = valueHolding(
      { symbol: "PRIV", shares: 3, avgCostCents: 5000, currency: "CAD" },
      undefined,
      base,
      {},
    );
    expect(v.priceCents).toBeNull();
    expect(v.marketValueCents).toBeNull();
    expect(v.marketValueBaseCents).toBeNull();
  });

  it("supports fractional shares", () => {
    const v = valueHolding(
      { symbol: "BTC", shares: 0.5, avgCostCents: 8_000_000, currency: "CAD" },
      { symbol: "BTC", priceCents: 9_000_000, currency: "CAD" },
      base,
      {},
    );
    expect(v.marketValueCents).toBe(4_500_000);
    expect(v.costCents).toBe(4_000_000);
    expect(v.gainCents).toBe(500_000);
  });
});

describe("portfolioTotals", () => {
  it("sums priced holdings, counts unpriced, and computes gain %", () => {
    const base = "CAD";
    const fx = { USD: 1.4 };
    const vals = [
      valueHolding({ symbol: "A", shares: 10, avgCostCents: 10000, currency: "USD" }, { symbol: "A", priceCents: 15000, currency: "USD" }, base, fx),
      valueHolding({ symbol: "B", shares: 5, avgCostCents: 10000, currency: "CAD" }, { symbol: "B", priceCents: 12000, currency: "CAD" }, base, fx),
      valueHolding({ symbol: "C", shares: 3, avgCostCents: 5000, currency: "CAD" }, undefined, base, fx), // unpriced
    ];
    const t = portfolioTotals(vals);
    // A: 210000 value / 140000 cost ; B: 60000 value / 50000 cost
    expect(t.marketValueCents).toBe(210000 + 60000);
    expect(t.costCents).toBe(140000 + 50000);
    expect(t.gainCents).toBe(270000 - 190000);
    expect(t.gainPct).toBeCloseTo((80000 / 190000) * 100, 5);
    expect(t.pricedCount).toBe(2);
    expect(t.unpricedCount).toBe(1);
  });

  it("gain % is null when there is no cost basis", () => {
    const t = portfolioTotals([
      valueHolding({ symbol: "X", shares: 1, avgCostCents: null, currency: "CAD" }, { symbol: "X", priceCents: 1000, currency: "CAD" }, "CAD", {}),
    ]);
    expect(t.marketValueCents).toBe(1000);
    expect(t.costCents).toBe(0);
    expect(t.gainPct).toBeNull();
  });
});

// A hardcoded library of investment portfolio archetypes for the standalone
// /library explorer. Nothing here touches the user's real holdings or the
// projection plan — it's a "what if I invested this way?" sandbox.
//
// Each ASSET_CLASS carries a long-run historical expectation (annualized CAGR +
// volatility) plus representative ETFs for Canadian and US investors. Each
// PROFILE is a named allocation across those classes (summing to 100%). The
// per-class numbers are rounded, defensible long-run estimates compiled from
// Bogleheads, Vanguard, Ray Dalio's All-Weather, the Canadian Couch Potato,
// Morningstar, PortfoliosLab and NYU Stern / Damodaran's 1928–2024 dataset.
// They are nominal (not inflation-adjusted) and are not investment advice.

import type { ReturnStats } from "./investments";

export interface Etf {
  symbol: string;
  name: string;
}

export type Region = "ca" | "us";

export interface AssetClass {
  id: string;
  label: string;
  /** Long-run annualized return (CAGR), as a decimal, e.g. 0.10 = 10%/yr. */
  cagr: number;
  /** Annualized volatility (std dev of annual returns), as a decimal. */
  vol: number;
  /** A representative color dot (CSS color) for the allocation list. */
  color: string;
  /** Representative Canada-listed ETFs (TSX). */
  caEtfs: Etf[];
  /** Representative US-listed ETFs. */
  usEtfs: Etf[];
}

export const ASSET_CLASSES: AssetClass[] = [
  {
    id: "usLarge",
    label: "US Large Cap / S&P 500",
    cagr: 0.1,
    vol: 0.16,
    color: "#2563eb",
    caEtfs: [
      { symbol: "VFV.TO", name: "Vanguard S&P 500 Index ETF" },
      { symbol: "ZSP.TO", name: "BMO S&P 500 Index ETF" },
      { symbol: "XUS.TO", name: "iShares Core S&P 500 Index ETF" },
    ],
    usEtfs: [
      { symbol: "VOO", name: "Vanguard S&P 500 ETF" },
      { symbol: "SPY", name: "SPDR S&P 500 ETF Trust" },
      { symbol: "IVV", name: "iShares Core S&P 500 ETF" },
    ],
  },
  {
    id: "usTech",
    label: "US Tech / Nasdaq-100",
    cagr: 0.13,
    vol: 0.24,
    color: "#7c3aed",
    caEtfs: [
      { symbol: "XQQ.TO", name: "iShares NASDAQ 100 Index ETF (CAD-Hedged)" },
      { symbol: "ZNQ.TO", name: "BMO Nasdaq 100 Equity Index ETF" },
      { symbol: "HXQ.TO", name: "Global X Nasdaq-100 Index ETF" },
    ],
    usEtfs: [
      { symbol: "QQQ", name: "Invesco QQQ Trust (Nasdaq-100)" },
      { symbol: "VGT", name: "Vanguard Information Technology ETF" },
      { symbol: "XLK", name: "Technology Select Sector SPDR Fund" },
    ],
  },
  {
    id: "usTotal",
    label: "US Total Market",
    cagr: 0.1,
    vol: 0.155,
    color: "#0ea5e9",
    caEtfs: [
      { symbol: "VUN.TO", name: "Vanguard US Total Market Index ETF" },
      { symbol: "XUU.TO", name: "iShares Core S&P US Total Market ETF" },
    ],
    usEtfs: [
      { symbol: "VTI", name: "Vanguard Total Stock Market ETF" },
      { symbol: "ITOT", name: "iShares Core S&P Total US Stock Market ETF" },
      { symbol: "SCHB", name: "Schwab US Broad Market ETF" },
    ],
  },
  {
    id: "intl",
    label: "International Developed (ex-US)",
    cagr: 0.08,
    vol: 0.165,
    color: "#0d9488",
    caEtfs: [
      { symbol: "XEF.TO", name: "iShares Core MSCI EAFE IMI Index ETF" },
      { symbol: "ZEA.TO", name: "BMO MSCI EAFE Index ETF" },
    ],
    usEtfs: [
      { symbol: "VEA", name: "Vanguard FTSE Developed Markets ETF" },
      { symbol: "IEFA", name: "iShares Core MSCI EAFE ETF" },
      { symbol: "SCHF", name: "Schwab International Equity ETF" },
    ],
  },
  {
    id: "em",
    label: "Emerging Markets",
    cagr: 0.09,
    vol: 0.225,
    color: "#ea580c",
    caEtfs: [
      { symbol: "XEC.TO", name: "iShares Core MSCI Emerging Markets IMI ETF" },
      { symbol: "ZEM.TO", name: "BMO MSCI Emerging Markets Index ETF" },
    ],
    usEtfs: [
      { symbol: "VWO", name: "Vanguard FTSE Emerging Markets ETF" },
      { symbol: "IEMG", name: "iShares Core MSCI Emerging Markets ETF" },
      { symbol: "EEM", name: "iShares MSCI Emerging Markets ETF" },
    ],
  },
  {
    id: "canada",
    label: "Canadian Equity (TSX)",
    cagr: 0.085,
    vol: 0.155,
    color: "#dc2626",
    caEtfs: [
      { symbol: "XIC.TO", name: "iShares Core S&P/TSX Capped Composite ETF" },
      { symbol: "VCN.TO", name: "Vanguard FTSE Canada All Cap Index ETF" },
      { symbol: "ZCN.TO", name: "BMO S&P/TSX Capped Composite Index ETF" },
    ],
    usEtfs: [{ symbol: "EWC", name: "iShares MSCI Canada ETF" }],
  },
  {
    id: "world",
    label: "Total World / Global",
    cagr: 0.085,
    vol: 0.155,
    color: "#16a34a",
    caEtfs: [
      { symbol: "XEQT.TO", name: "iShares Core Equity ETF Portfolio" },
      { symbol: "VEQT.TO", name: "Vanguard All-Equity ETF Portfolio" },
    ],
    usEtfs: [{ symbol: "VT", name: "Vanguard Total World Stock ETF" }],
  },
  {
    id: "bonds",
    label: "Bonds / Aggregate",
    cagr: 0.045,
    vol: 0.05,
    color: "#64748b",
    caEtfs: [
      { symbol: "ZAG.TO", name: "BMO Aggregate Bond Index ETF" },
      { symbol: "VAB.TO", name: "Vanguard Canadian Aggregate Bond Index ETF" },
      { symbol: "XBB.TO", name: "iShares Core Canadian Universe Bond Index ETF" },
    ],
    usEtfs: [
      { symbol: "BND", name: "Vanguard Total Bond Market ETF" },
      { symbol: "AGG", name: "iShares Core US Aggregate Bond ETF" },
    ],
  },
  {
    id: "gold",
    label: "Gold / Commodities",
    cagr: 0.07,
    vol: 0.17,
    color: "#ca8a04",
    caEtfs: [
      { symbol: "CGL.TO", name: "iShares Gold Bullion ETF (CAD-Hedged)" },
      { symbol: "MNT.TO", name: "Royal Canadian Mint Gold Reserves" },
    ],
    usEtfs: [
      { symbol: "GLD", name: "SPDR Gold Shares" },
      { symbol: "IAU", name: "iShares Gold Trust" },
      { symbol: "GLDM", name: "SPDR Gold MiniShares" },
    ],
  },
  {
    id: "dividend",
    label: "Dividend / Value",
    cagr: 0.1,
    vol: 0.145,
    color: "#9333ea",
    caEtfs: [
      { symbol: "VDY.TO", name: "Vanguard FTSE Canadian High Dividend Yield ETF" },
      { symbol: "XEI.TO", name: "iShares S&P/TSX Composite High Dividend ETF" },
    ],
    usEtfs: [
      { symbol: "SCHD", name: "Schwab US Dividend Equity ETF" },
      { symbol: "VYM", name: "Vanguard High Dividend Yield ETF" },
      { symbol: "VIG", name: "Vanguard Dividend Appreciation ETF" },
    ],
  },
  {
    id: "cash",
    label: "Cash / T-bills",
    cagr: 0.03,
    vol: 0.015,
    color: "#94a3b8",
    caEtfs: [
      { symbol: "CASH.TO", name: "Global X High Interest Savings ETF" },
      { symbol: "CBIL.TO", name: "Global X 0-3 Month T-Bill ETF" },
      { symbol: "HISA.TO", name: "Evolve High Interest Savings Account Fund" },
    ],
    usEtfs: [
      { symbol: "SGOV", name: "iShares 0-3 Month Treasury Bond ETF" },
      { symbol: "BIL", name: "SPDR Bloomberg 1-3 Month T-Bill ETF" },
    ],
  },
];

export const ASSET_CLASS_BY_ID: Record<string, AssetClass> = Object.fromEntries(
  ASSET_CLASSES.map((c) => [c.id, c]),
);

export type RiskLevel = "low" | "medium" | "high";

export interface ProfileAllocation {
  classId: string;
  percent: number; // 0..100
}

export interface PortfolioProfile {
  id: string;
  name: string;
  description: string;
  risk: RiskLevel;
  suits: string;
  allocations: ProfileAllocation[]; // must sum to 100
}

export const PROFILES: PortfolioProfile[] = [
  {
    id: "aggressive",
    name: "Aggressive Growth",
    description:
      "All-equity, growth-tilted portfolio built for maximum long-run appreciation.",
    risk: "high",
    suits: "Young investors with a 20+ year horizon and a high tolerance for big swings.",
    allocations: [
      { classId: "usLarge", percent: 35 },
      { classId: "usTech", percent: 30 },
      { classId: "intl", percent: 15 },
      { classId: "em", percent: 10 },
      { classId: "dividend", percent: 10 },
    ],
  },
  {
    id: "tech",
    name: "Tech Focus",
    description:
      "A concentrated bet on US technology and the Nasdaq-100 megacaps.",
    risk: "high",
    suits: "Conviction investors who want amplified tech exposure and accept deep drawdowns.",
    allocations: [
      { classId: "usTech", percent: 75 },
      { classId: "usLarge", percent: 15 },
      { classId: "dividend", percent: 5 },
      { classId: "cash", percent: 5 },
    ],
  },
  {
    id: "balanced",
    name: "Balanced 60/40",
    description:
      "The classic 60% stocks / 40% bonds mix — growth with materially lower volatility.",
    risk: "medium",
    suits: "Mainstream long-term savers who want growth without the full equity rollercoaster.",
    allocations: [
      { classId: "usLarge", percent: 36 },
      { classId: "intl", percent: 18 },
      { classId: "em", percent: 6 },
      { classId: "bonds", percent: 40 },
    ],
  },
  {
    id: "conservative",
    name: "Conservative / Stable",
    description:
      "Bond- and cash-heavy portfolio prioritizing capital preservation over growth.",
    risk: "low",
    suits: "Retirees, near-retirees, or anyone with a short (1–5 year) horizon.",
    allocations: [
      { classId: "bonds", percent: 65 },
      { classId: "usLarge", percent: 12 },
      { classId: "cash", percent: 10 },
      { classId: "dividend", percent: 8 },
      { classId: "intl", percent: 5 },
    ],
  },
  {
    id: "threeFund",
    name: "Three-Fund (Bogleheads)",
    description:
      "Simple, low-cost index core: US total market + total international + bonds (80/20).",
    risk: "medium",
    suits: "DIY index investors who value simplicity, low fees and broad diversification.",
    allocations: [
      { classId: "usTotal", percent: 48 },
      { classId: "intl", percent: 24 },
      { classId: "em", percent: 8 },
      { classId: "bonds", percent: 20 },
    ],
  },
  {
    id: "allWeather",
    name: "All-Weather (Dalio)",
    description:
      "Risk-balanced mix of stocks, long/intermediate bonds and gold for any economic season.",
    risk: "low",
    suits: "Risk-averse investors who prize low volatility and inflation protection.",
    allocations: [
      { classId: "usLarge", percent: 30 },
      { classId: "bonds", percent: 55 },
      { classId: "gold", percent: 15 },
    ],
  },
  {
    id: "global",
    name: "Global / International",
    description:
      "Equity portfolio that overweights markets outside the US (developed + emerging).",
    risk: "high",
    suits: "Investors who believe in global diversification and want less US home bias.",
    allocations: [
      { classId: "intl", percent: 45 },
      { classId: "em", percent: 25 },
      { classId: "usLarge", percent: 20 },
      { classId: "bonds", percent: 5 },
      { classId: "dividend", percent: 5 },
    ],
  },
  {
    id: "dividendIncome",
    name: "Dividend / Income",
    description:
      "Built around high-quality dividend payers plus bonds for steady cash flow.",
    risk: "medium",
    suits: "Income-seekers and retirees who want regular distributions over pure growth.",
    allocations: [
      { classId: "dividend", percent: 50 },
      { classId: "bonds", percent: 20 },
      { classId: "usLarge", percent: 15 },
      { classId: "intl", percent: 10 },
      { classId: "cash", percent: 5 },
    ],
  },
  {
    id: "canadianCouch",
    name: "Canadian Couch Potato",
    description:
      "One-ticket Canadian balanced mix (à la VBAL/XBAL): Canada + US + international + bonds.",
    risk: "medium",
    suits: "Canadian DIY investors wanting diversification with a home-country tilt and CAD bonds.",
    allocations: [
      { classId: "bonds", percent: 40 },
      { classId: "usLarge", percent: 21 },
      { classId: "canada", percent: 18 },
      { classId: "intl", percent: 15 },
      { classId: "em", percent: 6 },
    ],
  },
];

// ---- The user's own portfolio ---------------------------------------------
// Unlike the hardcoded PROFILES (which blend across asset classes with fixed
// long-run estimates), this is built live from the real holdings on the
// Investments page: each holding's current market-value weight plus its own
// fetched price history (ReturnStat). It lets the library answer "what if I
// just keep my current distribution?" using my actual tickers, not archetypes.

export interface CustomHoldingStat {
  symbol: string;
  name: string | null;
  /** Current market-value weight in the portfolio, 0..100. */
  percent: number;
  /** Historical return/vol for this symbol, or null if not fetched yet. */
  stats: ReturnStats | null;
}

export interface CustomPortfolio {
  holdings: CustomHoldingStat[];
  /** Total portfolio market value (base currency cents) — the default lump sum. */
  totalValueCents: number;
  /** Whether at least one holding has historical stats to project from. */
  hasStats: boolean;
}

/** Sentinel id used to select the live "My Portfolio" view in the library. */
export const CUSTOM_PROFILE_ID = "__custom__";

/**
 * Blend a profile's allocation into a single portfolio expectation. Weights each
 * asset class's hardcoded CAGR/vol by its percentage (normalized to sum 1).
 * Volatility is combined as the weighted average of per-class vols — the same
 * deliberate simplification used by `blendReturn` in projection.ts (it ignores
 * cross-correlation, which is fine for a long-run personal forecast). Returns
 * null if nothing usable is allocated.
 */
export function blendProfile(
  allocations: ProfileAllocation[],
  classesById: Record<string, AssetClass> = ASSET_CLASS_BY_ID,
): ReturnStats | null {
  const usable = allocations
    .map((a) => ({ a, c: classesById[a.classId] }))
    .filter((x) => x.c && x.a.percent > 0) as {
    a: ProfileAllocation;
    c: AssetClass;
  }[];
  const totalPct = usable.reduce((sum, x) => sum + x.a.percent, 0);
  if (totalPct <= 0) return null;

  let annualReturn = 0;
  let annualVol = 0;
  for (const { a, c } of usable) {
    const w = a.percent / totalPct;
    annualReturn += w * c.cagr;
    annualVol += w * c.vol;
  }
  // `months` is irrelevant for hardcoded stats; report a long horizon so any
  // downstream "enough history?" check is satisfied.
  return { annualReturn, annualVol, months: 600 };
}

// Pure investment helpers: parse provider quotes and value a portfolio. No IO
// here (the network fetch lives in market.ts), so all of this is unit-testable.

export interface HoldingInput {
  symbol: string;
  shares: number;
  avgCostCents?: number | null; // average cost per share, native currency cents
  currency: string;
}

export interface Quote {
  symbol: string;
  priceCents: number; // last price, native currency cents
  currency: string;
  changePct?: number | null;
}

export interface ParsedQuote extends Quote {
  name: string | null;
  asOfMs: number | null; // market timestamp, ms since epoch (null if unknown)
}

/**
 * Parse the Yahoo Finance v8 chart payload into a quote. Returns null if the
 * shape is missing or has no price, so the caller can skip a bad symbol.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseYahooChart(json: any): ParsedQuote | null {
  const meta = json?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  if (!meta || typeof price !== "number" || !Number.isFinite(price)) return null;

  const prev =
    typeof meta.previousClose === "number"
      ? meta.previousClose
      : typeof meta.chartPreviousClose === "number"
        ? meta.chartPreviousClose
        : null;
  const changePct = prev && prev !== 0 ? ((price - prev) / prev) * 100 : null;

  return {
    symbol: typeof meta.symbol === "string" ? meta.symbol : "",
    priceCents: Math.round(price * 100),
    currency: typeof meta.currency === "string" ? meta.currency : "USD",
    changePct,
    name: meta.longName ?? meta.shortName ?? null,
    asOfMs:
      typeof meta.regularMarketTime === "number"
        ? meta.regularMarketTime * 1000
        : null,
  };
}

export interface SymbolMatch {
  symbol: string;
  name: string;
  exchange: string; // human-readable exchange, e.g. "NASDAQ"
  type: string; // human-readable type, e.g. "ETF", "Equity"
  currency: string; // best-guess currency from the symbol suffix
}

// Map a symbol suffix to its trading currency. Yahoo's search results omit
// currency, so we infer it from the exchange suffix (TSX/TSXV/NEO/CSE = CAD,
// everything else defaults to USD — the only two we offer in the UI).
const CAD_SUFFIXES = [".TO", ".V", ".NE", ".CN"];
export function guessCurrency(symbol: string): string {
  const s = symbol.toUpperCase();
  return CAD_SUFFIXES.some((suf) => s.endsWith(suf)) ? "CAD" : "USD";
}

/**
 * Parse the Yahoo Finance search payload into ticker suggestions. Keeps only
 * real tradable instruments (equities/ETFs/etc. flagged isYahooFinance) and
 * drops anything without a symbol. Returns [] for a missing/odd shape.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseYahooSearch(json: any): SymbolMatch[] {
  const quotes = json?.quotes;
  if (!Array.isArray(quotes)) return [];
  const out: SymbolMatch[] = [];
  for (const q of quotes) {
    const symbol = typeof q?.symbol === "string" ? q.symbol : "";
    if (!symbol || q?.isYahooFinance === false) continue;
    // Skip future/option-style quotes that have no tradable single-ticker.
    if (q?.quoteType === "OPTION" || q?.quoteType === "FUTURE") continue;
    out.push({
      symbol,
      name:
        (typeof q.longname === "string" && q.longname) ||
        (typeof q.shortname === "string" && q.shortname) ||
        symbol,
      exchange: typeof q.exchDisp === "string" ? q.exchDisp : "",
      type: typeof q.typeDisp === "string" ? q.typeDisp : "",
      currency: guessCurrency(symbol),
    });
  }
  return out;
}

/** Parse an FX pair (e.g. USDCAD=X) chart payload into a plain rate number. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseFxRate(json: any): number | null {
  const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
  return typeof price === "number" && Number.isFinite(price) ? price : null;
}

/**
 * Convert a native-currency cent amount into the base currency.
 * `fxRates` maps a currency code to its base-currency rate (e.g. USD -> 1.39).
 * The base currency maps to 1. Unknown currencies fall back to 1 (treated as
 * already-base) so a missing rate never zeroes out a holding.
 */
export function toBaseCents(
  amountCents: number,
  currency: string,
  base: string,
  fxRates: Record<string, number>,
): number {
  if (currency === base) return amountCents;
  const rate = fxRates[currency] ?? 1;
  return Math.round(amountCents * rate);
}

export interface HoldingValuation {
  symbol: string;
  shares: number;
  currency: string;
  priceCents: number | null; // native
  marketValueCents: number | null; // native
  costCents: number | null; // native
  gainCents: number | null; // native
  gainPct: number | null;
  marketValueBaseCents: number | null; // converted to base currency
  costBaseCents: number | null;
  gainBaseCents: number | null;
}

/** Value a single holding given the latest quote (or undefined if unpriced). */
export function valueHolding(
  h: HoldingInput,
  quote: Quote | undefined,
  base: string,
  fxRates: Record<string, number>,
): HoldingValuation {
  const priceCents = quote?.priceCents ?? null;
  const marketValueCents =
    priceCents != null ? Math.round(h.shares * priceCents) : null;
  const costCents =
    h.avgCostCents != null ? Math.round(h.shares * h.avgCostCents) : null;
  const gainCents =
    marketValueCents != null && costCents != null
      ? marketValueCents - costCents
      : null;
  const gainPct =
    gainCents != null && costCents != null && costCents !== 0
      ? (gainCents / costCents) * 100
      : null;

  const conv = (c: number | null) =>
    c != null ? toBaseCents(c, h.currency, base, fxRates) : null;
  const marketValueBaseCents = conv(marketValueCents);
  const costBaseCents = conv(costCents);
  const gainBaseCents =
    marketValueBaseCents != null && costBaseCents != null
      ? marketValueBaseCents - costBaseCents
      : null;

  return {
    symbol: h.symbol,
    shares: h.shares,
    currency: h.currency,
    priceCents,
    marketValueCents,
    costCents,
    gainCents,
    gainPct,
    marketValueBaseCents,
    costBaseCents,
    gainBaseCents,
  };
}

export interface PortfolioTotals {
  marketValueCents: number; // base currency
  costCents: number; // base currency (only holdings with a cost)
  gainCents: number;
  gainPct: number | null;
  pricedCount: number;
  unpricedCount: number;
}

/** Sum valuations into base-currency portfolio totals. */
export function portfolioTotals(vals: HoldingValuation[]): PortfolioTotals {
  let marketValueCents = 0;
  let costCents = 0;
  let pricedCount = 0;
  let unpricedCount = 0;
  for (const v of vals) {
    if (v.marketValueBaseCents == null) {
      unpricedCount += 1;
      continue;
    }
    pricedCount += 1;
    marketValueCents += v.marketValueBaseCents;
    // Only count cost for holdings that have both a price and a cost, so the
    // gain % denominator matches the market value being compared.
    if (v.costBaseCents != null) costCents += v.costBaseCents;
  }
  const gainCents = marketValueCents - costCents;
  const gainPct = costCents !== 0 ? (gainCents / costCents) * 100 : null;
  return {
    marketValueCents,
    costCents,
    gainCents,
    gainPct,
    pricedCount,
    unpricedCount,
  };
}

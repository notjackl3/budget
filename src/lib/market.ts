import "server-only";
import {
  parseYahooChart,
  parseFxRate,
  parseYahooSearch,
  type ParsedQuote,
  type SymbolMatch,
} from "./investments";

// Market-data fetcher (Yahoo Finance v8 chart endpoint — no API key needed).
// Unofficial, so every call is defensive: a failure returns null and the caller
// skips that symbol rather than throwing. EOD/delayed prices are fine for a
// long-term holdings tracker.

const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";
const SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; budget-tracker/1.0)" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchChart(symbol: string): Promise<any | null> {
  try {
    const res = await fetch(
      `${CHART_URL}${encodeURIComponent(symbol)}?range=1d&interval=1d`,
      { headers: HEADERS, cache: "no-store" },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Fetch one quote, preserving the symbol we asked for (for map lookups). */
export async function fetchQuote(symbol: string): Promise<ParsedQuote | null> {
  const json = await fetchChart(symbol);
  if (!json) return null;
  const q = parseYahooChart(json);
  return q ? { ...q, symbol } : null;
}

/** Fetch quotes for a set of symbols concurrently; bad symbols are dropped. */
export async function fetchQuotes(symbols: string[]): Promise<ParsedQuote[]> {
  const uniq = [
    ...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)),
  ];
  const results = await Promise.all(uniq.map((s) => fetchQuote(s)));
  return results.filter((q): q is ParsedQuote => q != null);
}

/**
 * Search the market for tickers matching free-text (a name or partial symbol).
 * Powers the "Add holding" autocomplete. Returns [] on any failure.
 */
export async function searchSymbols(query: string): Promise<SymbolMatch[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch(
      `${SEARCH_URL}?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`,
      { headers: HEADERS, cache: "no-store" },
    );
    if (!res.ok) return [];
    return parseYahooSearch(await res.json());
  } catch {
    return [];
  }
}

/** Fetch an FX rate (e.g. USD -> CAD). Returns null on failure, 1 when equal. */
export async function fetchFxRate(
  from: string,
  to: string,
): Promise<number | null> {
  if (from === to) return 1;
  const json = await fetchChart(`${from}${to}=X`);
  return json ? parseFxRate(json) : null;
}

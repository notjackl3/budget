import {
  getSettings,
  getHoldings,
  getQuotes,
  getFxRates,
  getReturnStats,
} from "@/lib/queries";
import { valueHolding, type Quote } from "@/lib/investments";
import { PortfolioLibraryView } from "@/components/portfolio-library-view";
import type { CustomPortfolio } from "@/lib/portfolio-library";

export default async function LibraryPage() {
  const [settings, holdings, quotes, fx, returnStats] = await Promise.all([
    getSettings(),
    getHoldings(),
    getQuotes(),
    getFxRates(),
    getReturnStats(),
  ]);
  const base = settings.currencyCode;

  // Build the live "My Portfolio" profile from real holdings: value each one in
  // the base currency, derive its market-value weight, and attach its fetched
  // historical stats (mirrors the valuation on the Investments page).
  const quoteMap = new Map<string, Quote>(
    quotes.map((q) => [
      q.symbol,
      {
        symbol: q.symbol,
        priceCents: q.priceCents,
        currency: q.currency,
        changePct: q.changePct,
      },
    ]),
  );
  // FxRate.pair is "<from><to>", e.g. "USDCAD"; key by the from-currency.
  const fxRates: Record<string, number> = Object.fromEntries(
    fx.map((r) => [r.pair.slice(0, 3), r.rate]),
  );
  const statsBySymbol = new Map(returnStats.map((s) => [s.symbol, s]));

  const valued = holdings.map((h) => {
    const q = quoteMap.get(h.symbol);
    const currency = q?.currency ?? h.currency;
    const v = valueHolding(
      { symbol: h.symbol, shares: h.shares, avgCostCents: h.avgCostCents, currency },
      q,
      base,
      fxRates,
    );
    return { h, value: v.marketValueBaseCents };
  });

  const totalValueCents = valued.reduce((sum, x) => sum + (x.value ?? 0), 0);

  const customHoldings = valued
    .filter((x) => x.value != null && x.value > 0)
    .map(({ h, value }) => {
      const s = statsBySymbol.get(h.symbol);
      return {
        symbol: h.symbol,
        name: h.name ?? null,
        percent: totalValueCents > 0 ? (value! / totalValueCents) * 100 : 0,
        stats: s
          ? { annualReturn: s.annualReturn, annualVol: s.annualVol, months: s.months }
          : null,
      };
    })
    .sort((a, b) => b.percent - a.percent);

  const customPortfolio: CustomPortfolio | null =
    customHoldings.length > 0
      ? {
          holdings: customHoldings,
          totalValueCents,
          hasStats: customHoldings.some((h) => h.stats != null),
        }
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio Library</h1>
        <p className="text-sm text-muted-foreground">
          A sandbox of common investing strategies — tech-heavy, balanced, all-weather
          and more — plus your own current holdings. Pick one to see what it&apos;s
          built from, then model a starting amount and recurring contribution across
          best / average / worst scenarios.
        </p>
      </div>

      <PortfolioLibraryView base={base} customPortfolio={customPortfolio} />
    </div>
  );
}

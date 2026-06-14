import {
  getHoldings,
  getQuotes,
  getFxRates,
  getPortfolioSnapshots,
  getSettings,
} from "@/lib/queries";
import { valueHolding, portfolioTotals, type Quote } from "@/lib/investments";
import { dateToYMD } from "@/lib/dates";
import {
  InvestmentsView,
  type HoldingRowDTO,
} from "@/components/investments-view";

export default async function InvestmentsPage() {
  const [holdings, quotes, fx, snapshots, settings] = await Promise.all([
    getHoldings(),
    getQuotes(),
    getFxRates(),
    getPortfolioSnapshots(),
    getSettings(),
  ]);

  const base = settings.currencyCode;
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

  const rows: HoldingRowDTO[] = holdings.map((h) => {
    const q = quoteMap.get(h.symbol);
    // Price drives valuation, so value in the quote's currency when we have one.
    const currency = q?.currency ?? h.currency;
    const v = valueHolding(
      {
        symbol: h.symbol,
        shares: h.shares,
        avgCostCents: h.avgCostCents,
        currency,
      },
      q,
      base,
      fxRates,
    );
    return {
      id: h.id,
      symbol: h.symbol,
      name: h.name ?? q?.symbol ?? null,
      shares: h.shares,
      avgCostCents: h.avgCostCents,
      currency,
      account: h.account,
      priceCents: v.priceCents,
      changePct: q?.changePct ?? null,
      marketValueBaseCents: v.marketValueBaseCents,
      gainBaseCents: v.gainBaseCents,
      gainPct: v.gainPct,
    };
  });

  const valuations = holdings.map((h) => {
    const q = quoteMap.get(h.symbol);
    return valueHolding(
      {
        symbol: h.symbol,
        shares: h.shares,
        avgCostCents: h.avgCostCents,
        currency: q?.currency ?? h.currency,
      },
      q,
      base,
      fxRates,
    );
  });
  const totals = portfolioTotals(valuations);

  // Most recent fetch timestamp across cached quotes, as a friendly date.
  const lastFetched = quotes.reduce<Date | null>((acc, q) => {
    return !acc || q.fetchedAt > acc ? q.fetchedAt : acc;
  }, null);
  const lastUpdated = lastFetched ? dateToYMD(lastFetched) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Investments</h1>
        <p className="text-sm text-muted-foreground">
          Enter what you hold; prices are fetched from the market on demand. A
          lightweight tracker, not linked to your brokerage.
        </p>
      </div>
      <InvestmentsView
        holdings={rows}
        totals={{
          marketValueCents: totals.marketValueCents,
          costCents: totals.costCents,
          gainCents: totals.gainCents,
          gainPct: totals.gainPct,
          unpricedCount: totals.unpricedCount,
        }}
        base={base}
        lastUpdated={lastUpdated}
        snapshots={snapshots.map((s) => ({
          date: s.date,
          totalCents: s.totalCents,
        }))}
      />
    </div>
  );
}

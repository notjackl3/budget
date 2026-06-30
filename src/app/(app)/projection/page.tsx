import {
  getJobs,
  getCategories,
  getAggExpenses,
  getHoldings,
  getQuotes,
  getFxRates,
  getBudgetPlan,
  getReturnStats,
  getSettings,
} from "@/lib/queries";
import { incomeTotals } from "@/lib/income";
import { valueHolding, portfolioTotals, type Quote } from "@/lib/investments";
import {
  averageMonthlySpendByCategory,
  recentMonthlySpendByCategory,
  reconcileToIncome,
  INVESTMENT_KEY,
  type Bucket,
  type InvestPlan,
} from "@/lib/projection";
import { monthKey } from "@/lib/dates";
import {
  ProjectionView,
  type ProjectionCategory,
  type ProjectionHoldingDTO,
  type ReturnStatDTO,
} from "@/components/projection-view";

export default async function ProjectionPage() {
  const [jobs, categories, agg, holdings, quotes, fx, plan, returnStats, settings] =
    await Promise.all([
      getJobs(),
      getCategories(),
      getAggExpenses(),
      getHoldings(),
      getQuotes(),
      getFxRates(),
      getBudgetPlan(),
      getReturnStats(),
      getSettings(),
    ]);

  const base = settings.currencyCode;
  // incomeTotals only needs the pay fields; map to the IncomeJob shape so the
  // Prisma row's Date-typed startDate/endDate don't clash with its YMD-string
  // fields (those are unused here).
  const monthlyIncomeCents = incomeTotals(
    jobs.map((j) => ({
      payCents: j.payCents,
      cadence: j.cadence,
      hoursPerWeek: j.hoursPerWeek,
      active: j.active,
    })),
  ).monthlyCents;

  // ---- Current portfolio value (reuses the investments valuation block) ----
  const quoteMap = new Map<string, Quote>(
    quotes.map((q) => [
      q.symbol,
      { symbol: q.symbol, priceCents: q.priceCents, currency: q.currency, changePct: q.changePct },
    ]),
  );
  const fxRates: Record<string, number> = Object.fromEntries(
    fx.map((r) => [r.pair.slice(0, 3), r.rate]),
  );
  const valuations = holdings.map((h) => {
    const q = quoteMap.get(h.symbol);
    return valueHolding(
      { symbol: h.symbol, shares: h.shares, avgCostCents: h.avgCostCents, currency: q?.currency ?? h.currency },
      q,
      base,
      fxRates,
    );
  });
  const portfolioValueCents = portfolioTotals(valuations).marketValueCents;

  // ---- Seed + reconcile the allocator buckets ----
  const seeds = averageMonthlySpendByCategory(agg, 3);
  const recentByCategory = recentMonthlySpendByCategory(agg, 6);
  const savedByKey = new Map(plan.buckets.map((b) => [b.key, b]));

  const categoryBuckets: Bucket[] = categories.map((c) => {
    const saved = savedByKey.get(c.id);
    return {
      key: c.id,
      amountCents: saved?.amountCents ?? seeds[c.id] ?? 0,
      locked: saved?.locked ?? false,
    };
  });
  const savedInvest = savedByKey.get(INVESTMENT_KEY);
  const investBucket: Bucket = {
    key: INVESTMENT_KEY,
    amountCents: savedInvest?.amountCents ?? 0,
    locked: savedInvest?.locked ?? false,
  };
  const initialBuckets = reconcileToIncome(
    [...categoryBuckets, investBucket],
    monthlyIncomeCents,
  );

  // ---- DTOs ----
  const categoryDTOs: ProjectionCategory[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    recentMonths: recentByCategory[c.id] ?? [],
  }));

  const holdingDTOs: ProjectionHoldingDTO[] = holdings.map((h) => ({
    symbol: h.symbol,
    name: h.name,
    currency: h.currency,
  }));

  const allocations = plan.allocations.map((a) => ({
    symbol: a.symbol,
    percent: a.percent,
  }));

  const statDTOs: ReturnStatDTO[] = returnStats.map((s) => ({
    symbol: s.symbol,
    annualReturn: s.annualReturn,
    annualVol: s.annualVol,
    months: s.months,
  }));

  // Parse the saved contribution plan (start override + schedule). Bad/empty
  // JSON falls back to null so the view seeds a sensible default segment.
  let initialPlan: InvestPlan | null = null;
  if (plan.investPlanJson) {
    try {
      const parsed = JSON.parse(plan.investPlanJson) as InvestPlan;
      if (parsed && Array.isArray(parsed.segments)) initialPlan = parsed;
    } catch {
      initialPlan = null;
    }
  }
  const currentMonth = monthKey(new Date());

  const hasIncome = monthlyIncomeCents > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Projection</h1>
        <p className="text-sm text-muted-foreground">
          Treat your monthly income as one pot: dial each category up or down (lock
          the ones you can&apos;t change) and the rest rebalances. Whatever lands in
          Investment compounds forward using each holding&apos;s own history.
        </p>
      </div>

      {!hasIncome ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Add a job on the{" "}
          <a href="/income" className="font-medium text-primary underline-offset-2 hover:underline">
            Income
          </a>{" "}
          page first — the projection allocates your monthly income.
        </div>
      ) : (
        <ProjectionView
          monthlyIncomeCents={monthlyIncomeCents}
          portfolioValueCents={portfolioValueCents}
          categories={categoryDTOs}
          initialBuckets={initialBuckets}
          holdings={holdingDTOs}
          initialAllocations={allocations}
          returnStats={statDTOs}
          horizonYears={plan.horizonYears}
          scenario={plan.scenario}
          investContribCents={plan.investContribCents}
          initialPlan={initialPlan}
          currentMonth={currentMonth}
          base={base}
        />
      )}
    </div>
  );
}

import Link from "next/link";
import { getAggExpenses, getSettings, getJobs } from "@/lib/queries";
import {
  monthlySummary,
  combineCashflow,
  spendByMonthForYear,
  salaryByMonthForYear,
  salaryForMonth,
  addMonthSeries,
} from "@/lib/aggregate";
import { jobIncomeByMonthForYear, jobIncomeForMonth } from "@/lib/income";
import { monthKey, monthLabel, dateToYMD } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { StatCard } from "@/components/stat-card";
import { MonthPicker } from "@/components/month-picker";
import { NeedWantBar } from "@/components/need-want-bar";
import { CategoryDonut } from "@/components/charts/category-donut";
import { CashflowTrend } from "@/components/charts/cashflow-trend";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Upload, ArrowRight } from "lucide-react";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const [agg, settings, jobs, { month: monthParam }] = await Promise.all([
    getAggExpenses(),
    getSettings(),
    getJobs(),
    searchParams,
  ]);
  const symbol = settings.currencySymbol;
  const money = (c: number) => formatMoney(c, symbol);
  // Signed money: shows a leading + for gains, − for losses (used for net).
  const signedMoney = (c: number) =>
    `${c >= 0 ? "+" : "−"}${money(Math.abs(c))}`;

  // Default to the most recent month that has data, else the current month.
  const allMonths = [...new Set(agg.map((e) => monthKey(e.date)))].sort();
  const latest = allMonths.at(-1);
  const month = monthParam ?? latest ?? monthKey(new Date());
  const year = Number(month.slice(0, 4));

  const summary = monthlySummary(agg, month, settings.mealNeedCents);
  const donut = summary.byCategory
    .filter((c) => c.totalCents > 0)
    .map((c) => ({
      name: c.name,
      value: c.totalCents,
      color: c.color ?? "#94a3b8",
    }));

  // Income = jobs configured on the Income tab (placed on the months each job's
  // window covers) PLUS one-off Salary transactions. Refunds/reimbursements are
  // not income — they cancel their linked expense instead.
  const incomeJobs = jobs.map((j) => ({
    name: j.name,
    payCents: j.payCents,
    cadence: j.cadence,
    hoursPerWeek: j.hoursPerWeek,
    active: j.active,
    startDate: j.startDate ? dateToYMD(j.startDate) : null,
    endDate: j.endDate ? dateToYMD(j.endDate) : null,
  }));
  const incomeSeries = addMonthSeries(
    jobIncomeByMonthForYear(incomeJobs, year),
    salaryByMonthForYear(agg, year),
  );
  const cashflow = combineCashflow(incomeSeries, spendByMonthForYear(agg, year));

  // Selected-month income drives net + savings rate.
  const salaryCents = salaryForMonth(agg, month);
  const incomeCents = jobIncomeForMonth(incomeJobs, month) + salaryCents;
  // The individual jobs earning this month, for the income breakdown card.
  const monthJobs = incomeJobs
    .map((j) => ({ name: j.name, cents: jobIncomeForMonth([j], month) }))
    .filter((j) => j.cents > 0)
    .sort((a, b) => b.cents - a.cents);
  const netCents = incomeCents - summary.totalCents;
  const savingsRate = incomeCents > 0 ? netCents / incomeCents : null;

  if (agg.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="rise-stagger mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {summary.count} expense{summary.count === 1 ? "" : "s"} in{" "}
            {monthLabel(month)}
          </p>
        </div>
        <MonthPicker month={month} />
      </div>

      {/* Headline cash-flow: income in, money out, what's left, and the rate. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Income"
          value={money(incomeCents)}
          valueClassName="text-emerald-600"
          sublabel={
            monthJobs.length > 0
              ? `from ${monthJobs.length} job${monthJobs.length === 1 ? "" : "s"}`
              : "no active jobs this month"
          }
        />
        <StatCard
          label="Spent"
          value={money(summary.totalCents)}
          sublabel={`${summary.count} expense${summary.count === 1 ? "" : "s"}`}
        />
        <StatCard
          label={netCents >= 0 ? "Saved" : "Overspent"}
          value={incomeCents > 0 ? signedMoney(netCents) : money(summary.totalCents)}
          valueClassName={
            incomeCents === 0
              ? undefined
              : netCents >= 0
                ? "text-emerald-600"
                : "text-destructive"
          }
          sublabel={incomeCents > 0 ? "income − spending" : "no income recorded"}
        />
        <StatCard
          label="Savings rate"
          value={savingsRate === null ? "—" : `${Math.round(savingsRate * 100)}%`}
          sublabel={
            savingsRate === null
              ? "add income to see this"
              : "of income kept"
          }
        />
      </div>

      {/* Income detail: which jobs are earning this month and how much. */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Income · {monthLabel(month)}</CardTitle>
          <span className="tabular text-lg font-semibold text-emerald-600">
            + {money(incomeCents)}
          </span>
        </CardHeader>
        <CardContent>
          {monthJobs.length > 0 ? (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              {monthJobs.map((j) => (
                <span key={j.name}>
                  {j.name}{" "}
                  <span className="tabular font-medium text-foreground">
                    {money(j.cents)}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No jobs were earning in {monthLabel(month)}.{" "}
              <Link href="/income" className="underline hover:text-foreground">
                Set up your income
              </Link>{" "}
              to see it here and in the chart.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Need/Want split */}
      <Card>
        <CardHeader>
          <CardTitle>Needs · Wants · Comfort</CardTitle>
        </CardHeader>
        <CardContent>
          <NeedWantBar
            needsCents={summary.needsCents}
            wantsCents={summary.wantsCents}
            comfortCents={summary.comfortCents}
            unspecifiedCents={summary.unspecifiedCents}
          />
          {(summary.foodNeedCents > 0 || summary.foodComfortCents > 0) && (
            <p className="mt-3 text-xs text-muted-foreground">
              Food baseline (min):{" "}
              <span className="tabular font-medium text-foreground">
                {money(summary.foodNeedCents)}
              </span>{" "}
              · extra spent on dining:{" "}
              <span className="tabular font-medium text-foreground">
                {money(summary.foodComfortCents)}
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Category breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Category breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryDonut data={donut} totalCents={summary.totalCents} />
          </CardContent>
        </Card>

        {/* Income vs spend trend */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Income vs spend · {year}</CardTitle>
          </CardHeader>
          <CardContent>
            <CashflowTrend data={cashflow} activeMonth={month} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Welcome to your budget
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Add your first expense with the button up top, or import a few months of
        history from your bank statements to get started instantly.
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link href="/import">
            <Upload className="h-4 w-4" /> Import statements
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/expenses">
            View expenses <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      <Badge variant="accent" className="mt-8">
        Tip: the “Add expense” button is always one click away
      </Badge>
    </div>
  );
}

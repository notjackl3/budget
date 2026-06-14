// Pure aggregation helpers over expense records. Kept dependency-light so they
// are easy to unit-test and reuse on both server and client.

import { monthKey } from "./dates";
import { MEAL_SPLIT_SLUG, DEFAULT_MEAL_NEED_CENTS } from "./categories";

export interface AggExpense {
  date: Date;
  amountCents: number;
  needWant: string | null; // "Need" | "Want" | "Comfort" | null
  incomeType?: string | null; // "Salary" | "Refund" | "Reimbursement" | null
  // True when a refund/reimbursement cancels this spending row; such rows are
  // excluded from every spend figure below.
  voided?: boolean;
  categoryId: string | null;
  categoryName?: string | null;
  categoryColor?: string | null;
  categorySlug?: string | null;
  reviewed: boolean;
  recurring: boolean;
}

/**
 * Incoming money (credits/returns/deposits) is identified purely by a negative
 * amount and is kept entirely out of spending analytics — totals, the
 * need/want split, category breakdown, and the monthly trend all count expenses
 * only. Income is summarized separately by `incomeSummary`.
 */
export function isIncome(e: { amountCents: number }): boolean {
  return e.amountCents < 0;
}
function onlyExpenses(expenses: AggExpense[]): AggExpense[] {
  // Spending math counts real outgoing money only: not income (negatives) and
  // not expenses that were refunded/reimbursed (voided).
  return expenses.filter((e) => !isIncome(e) && !e.voided);
}

export interface IncomeTypeTotal {
  type: string; // "Refund" | "Salary" | "Unspecified"
  totalCents: number; // positive magnitude
  count: number;
}

export interface IncomeSummary {
  totalCents: number; // total incoming money (positive)
  byType: IncomeTypeTotal[];
  count: number;
}

/** Summarize incoming money (negatives) by income type, as positive amounts. */
export function incomeSummary(expenses: AggExpense[]): IncomeSummary {
  const map = new Map<string, IncomeTypeTotal>();
  let totalCents = 0;
  let count = 0;
  for (const e of expenses) {
    if (!isIncome(e)) continue;
    const mag = -e.amountCents; // negative charge -> positive income
    totalCents += mag;
    count += 1;
    const type = e.incomeType ?? "Unspecified";
    const cur = map.get(type);
    if (cur) {
      cur.totalCents += mag;
      cur.count += 1;
    } else {
      map.set(type, { type, totalCents: mag, count: 1 });
    }
  }
  const byType = [...map.values()].sort((a, b) => b.totalCents - a.totalCents);
  return { totalCents, byType, count };
}

export interface CategoryTotal {
  categoryId: string | null;
  name: string;
  color: string | null;
  totalCents: number;
  count: number;
}

export interface MonthlySummary {
  month: string;
  totalCents: number;
  needsCents: number;
  wantsCents: number;
  comfortCents: number;
  unspecifiedCents: number;
  /** The Need portion that came from the eating-out floor (your minimum food spend). */
  foodNeedCents: number;
  /** The Comfort portion that came from eating-out spend above the floor. */
  foodComfortCents: number;
  count: number;
  byCategory: CategoryTotal[];
  biggestCategory: CategoryTotal | null;
  /** Incoming money this month (positive), kept separate from spending. */
  incomeCents: number;
  incomeByType: IncomeTypeTotal[];
}

export function sumCents(expenses: AggExpense[]): number {
  return expenses.reduce((acc, e) => acc + e.amountCents, 0);
}

/** Total spend grouped by category, sorted descending by amount. */
export function categoryBreakdown(expenses: AggExpense[]): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  for (const e of expenses) {
    const key = e.categoryId ?? "__uncategorized__";
    const existing = map.get(key);
    if (existing) {
      existing.totalCents += e.amountCents;
      existing.count += 1;
    } else {
      map.set(key, {
        categoryId: e.categoryId,
        name: e.categoryName ?? "Miscellaneous",
        color: e.categoryColor ?? null,
        totalCents: e.amountCents,
        count: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents);
}

/**
 * Splits spend into Need / Want / Comfort / Unspecified buckets.
 *
 * Eating-out expenses are split *per meal* by the threshold rather than by their
 * stored flag: the first `mealNeedCents` of each meal is a Need (you have to
 * eat), and the excess is Comfort. Everything else is bucketed by its stored
 * `needWant` flag (e.g. rideshare Comfort counts in full). `foodNeedCents` /
 * `foodComfortCents` expose the eating-out portion specifically.
 */
export function needWantSplit(
  expenses: AggExpense[],
  mealNeedCents: number = DEFAULT_MEAL_NEED_CENTS,
): {
  needsCents: number;
  wantsCents: number;
  comfortCents: number;
  unspecifiedCents: number;
  foodNeedCents: number;
  foodComfortCents: number;
} {
  let needsCents = 0;
  let wantsCents = 0;
  let comfortCents = 0;
  let unspecifiedCents = 0;
  let foodNeedCents = 0;
  let foodComfortCents = 0;
  for (const e of expenses) {
    if (e.categorySlug === MEAL_SPLIT_SLUG) {
      const floor = Math.min(e.amountCents, mealNeedCents);
      const excess = e.amountCents - floor;
      needsCents += floor;
      comfortCents += excess;
      foodNeedCents += floor;
      foodComfortCents += excess;
    } else if (e.needWant === "Need") needsCents += e.amountCents;
    else if (e.needWant === "Want") wantsCents += e.amountCents;
    else if (e.needWant === "Comfort") comfortCents += e.amountCents;
    else unspecifiedCents += e.amountCents;
  }
  return {
    needsCents,
    wantsCents,
    comfortCents,
    unspecifiedCents,
    foodNeedCents,
    foodComfortCents,
  };
}

/** Filter expenses to a single "YYYY-MM" month. */
export function expensesForMonth(
  expenses: AggExpense[],
  month: string,
): AggExpense[] {
  return expenses.filter((e) => monthKey(e.date) === month);
}

export function monthlySummary(
  expenses: AggExpense[],
  month: string,
  mealNeedCents: number = DEFAULT_MEAL_NEED_CENTS,
): MonthlySummary {
  const inMonthAll = expensesForMonth(expenses, month);
  // Spending math counts expenses only; income is summarized separately.
  const inMonth = onlyExpenses(inMonthAll);
  const income = incomeSummary(inMonthAll);
  const {
    needsCents,
    wantsCents,
    comfortCents,
    unspecifiedCents,
    foodNeedCents,
    foodComfortCents,
  } = needWantSplit(inMonth, mealNeedCents);
  const byCategory = categoryBreakdown(inMonth);
  return {
    month,
    totalCents: sumCents(inMonth),
    needsCents,
    wantsCents,
    comfortCents,
    unspecifiedCents,
    foodNeedCents,
    foodComfortCents,
    count: inMonth.length,
    byCategory,
    biggestCategory: byCategory[0] ?? null,
    incomeCents: income.totalCents,
    incomeByType: income.byType,
  };
}

/** Spend per month across whatever range the data covers, ascending by month. */
export function spendByMonth(
  expenses: AggExpense[],
): { month: string; totalCents: number }[] {
  const map = new Map<string, number>();
  for (const e of onlyExpenses(expenses)) {
    const key = monthKey(e.date);
    map.set(key, (map.get(key) ?? 0) + e.amountCents);
  }
  return [...map.entries()]
    .map(([month, totalCents]) => ({ month, totalCents }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Income (positive magnitude) per month, optionally restricted to a calendar
 * year. Income rows are the negatives; we flip their sign so callers get a
 * positive "money in" figure.
 */
export function incomeByMonthForYear(
  expenses: AggExpense[],
  year: number,
): { month: string; totalCents: number }[] {
  const map = new Map<string, number>();
  for (const e of expenses) {
    if (!isIncome(e)) continue;
    if (e.date.getFullYear() !== year) continue;
    const key = monthKey(e.date);
    map.set(key, (map.get(key) ?? 0) + -e.amountCents);
  }
  const out: { month: string; totalCents: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    out.push({ month: key, totalCents: map.get(key) ?? 0 });
  }
  return out;
}

/**
 * Salary income (positive magnitude) per month of a calendar year. Only
 * `incomeType === "Salary"` counts as genuine money-in; refunds/reimbursements
 * are handled by voiding their linked expense instead, so they're excluded here.
 */
export function salaryByMonthForYear(
  expenses: AggExpense[],
  year: number,
): { month: string; totalCents: number }[] {
  const map = new Map<string, number>();
  for (const e of expenses) {
    if (!isIncome(e) || e.incomeType !== "Salary") continue;
    if (e.date.getFullYear() !== year) continue;
    const key = monthKey(e.date);
    map.set(key, (map.get(key) ?? 0) + -e.amountCents);
  }
  const out: { month: string; totalCents: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    out.push({ month: key, totalCents: map.get(key) ?? 0 });
  }
  return out;
}

/** Salary income (positive) recorded in a single "YYYY-MM" month. */
export function salaryForMonth(expenses: AggExpense[], month: string): number {
  let total = 0;
  for (const e of expenses) {
    if (!isIncome(e) || e.incomeType !== "Salary") continue;
    if (monthKey(e.date) !== month) continue;
    total += -e.amountCents;
  }
  return total;
}

/**
 * Element-wise sum of month series that share the same months (e.g. job income
 * + salary income). Keyed by the first series' months.
 */
export function addMonthSeries(
  base: { month: string; totalCents: number }[],
  ...others: { month: string; totalCents: number }[][]
): { month: string; totalCents: number }[] {
  const maps = others.map((s) => new Map(s.map((d) => [d.month, d.totalCents])));
  return base.map(({ month, totalCents }) => ({
    month,
    totalCents:
      totalCents + maps.reduce((acc, m) => acc + (m.get(month) ?? 0), 0),
  }));
}

export interface CashflowDatum {
  month: string; // "YYYY-MM"
  incomeCents: number; // money in (positive)
  spendCents: number; // money out (positive)
  netCents: number; // income - spend (positive = saved)
}

/**
 * Combined income-vs-spend, month by month across a calendar year, filling
 * empty months with zeros. The single source for the dashboard's cash-flow
 * trend so income and spending always line up on the same months.
 */
export function cashflowByMonthForYear(
  expenses: AggExpense[],
  year: number,
): CashflowDatum[] {
  const spend = new Map(
    spendByMonthForYear(expenses, year).map((d) => [d.month, d.totalCents]),
  );
  const income = new Map(
    incomeByMonthForYear(expenses, year).map((d) => [d.month, d.totalCents]),
  );
  const out: CashflowDatum[] = [];
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, "0")}`;
    const incomeCents = income.get(month) ?? 0;
    const spendCents = spend.get(month) ?? 0;
    out.push({ month, incomeCents, spendCents, netCents: incomeCents - spendCents });
  }
  return out;
}

/**
 * Zip an income series with a spend series into the cash-flow shape the trend
 * chart wants, keyed by the income series' months. Used by the dashboard to pair
 * job-sourced income with expense-sourced spend.
 */
export function combineCashflow(
  incomeByMonth: { month: string; totalCents: number }[],
  spendByMonth: { month: string; totalCents: number }[],
): CashflowDatum[] {
  const spend = new Map(spendByMonth.map((d) => [d.month, d.totalCents]));
  return incomeByMonth.map(({ month, totalCents: incomeCents }) => {
    const spendCents = spend.get(month) ?? 0;
    return { month, incomeCents, spendCents, netCents: incomeCents - spendCents };
  });
}

/** Spend per month restricted to a calendar year, filling empty months with 0. */
export function spendByMonthForYear(
  expenses: AggExpense[],
  year: number,
): { month: string; totalCents: number }[] {
  const map = new Map<string, number>();
  for (const e of onlyExpenses(expenses)) {
    if (e.date.getFullYear() !== year) continue;
    const key = monthKey(e.date);
    map.set(key, (map.get(key) ?? 0) + e.amountCents);
  }
  const out: { month: string; totalCents: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    out.push({ month: key, totalCents: map.get(key) ?? 0 });
  }
  return out;
}

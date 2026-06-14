"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { dollarsToCents } from "@/lib/money";
import { ymdToDate, dateToYMD } from "@/lib/dates";
import { makeDedupeHash } from "@/lib/parse-statement";
import { NEED_WANT, INCOME_TYPES } from "@/lib/categories";
import { learnMerchantRule, learnFromExpenseIds } from "@/lib/merchant-rules";
import { isCadence } from "@/lib/income";
import {
  fetchQuotes,
  fetchFxRate,
  fetchHistory,
  searchSymbols as searchSymbolsMarket,
} from "@/lib/market";
import type { SymbolMatch } from "@/lib/investments";
import { toBaseCents, computeReturnStats } from "@/lib/investments";
import { TAG } from "@/lib/cache-tags";
import { setSession, clearSession, checkPassword } from "@/lib/auth";

/**
 * Bust the given Data Cache tags and refresh the rendered tree. `revalidateTag`
 * drops the matching `unstable_cache` entries in `queries.ts`; `revalidatePath`
 * forces the RSC payload to regenerate so the UI re-reads. Expense DTOs embed
 * category and payment-method names, so anything touching those also busts the
 * `expenses` tag.
 */
function bust(...tags: string[]) {
  for (const t of tags) revalidateTag(t);
  revalidatePath("/", "layout");
}

function revalidateAll() {
  bust(TAG.expenses, TAG.categories, TAG.settings);
}

// ---------------------------------------------------------------- Auth

export async function loginAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const from = String(formData.get("from") ?? "/");
  if (!checkPassword(password)) {
    redirect(`/login?error=1&from=${encodeURIComponent(from)}`);
  }
  await setSession();
  redirect(from && from.startsWith("/") ? from : "/");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

// ------------------------------------------------------------ Expenses

export interface ExpenseInput {
  description: string;
  date: string; // YYYY-MM-DD
  amount: string | number; // dollars (what was charged)
  effectiveAmount?: string | number | null; // dollars; "" / null clears the override
  categoryId?: string | null;
  needWant?: string | null;
  incomeType?: string | null;
  notes?: string | null;
  recurring?: boolean;
  reviewed?: boolean;
}

/** Parse a manual cost override: blank/null means "no override" (null). */
function cleanEffectiveCents(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const cents = dollarsToCents(v as string | number);
  return Number.isFinite(cents) ? Math.max(0, cents) : null;
}

function normNeedWant(v: unknown): string | null {
  return typeof v === "string" && (NEED_WANT as readonly string[]).includes(v)
    ? v
    : null;
}
function normIncomeType(v: unknown): string | null {
  return typeof v === "string" && (INCOME_TYPES as readonly string[]).includes(v)
    ? v
    : null;
}
function cleanId(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 && v !== "none" ? v : null;
}

export async function createExpense(input: ExpenseInput) {
  const amountCents = dollarsToCents(input.amount);
  const description = input.description.trim();
  if (!description) throw new Error("Description is required.");
  if (!input.date) throw new Error("Date is required.");

  await prisma.expense.create({
    data: {
      description,
      date: ymdToDate(input.date),
      amountCents,
      effectiveCents: cleanEffectiveCents(input.effectiveAmount),
      categoryId: cleanId(input.categoryId),
      needWant: normNeedWant(input.needWant),
      incomeType: normIncomeType(input.incomeType),
      notes: input.notes?.trim() || null,
      recurring: Boolean(input.recurring),
      reviewed: Boolean(input.reviewed),
      dedupeHash: makeDedupeHash(input.date, amountCents, description),
    },
  });
  revalidateAll();
}

export async function updateExpense(id: string, input: Partial<ExpenseInput>) {
  const data: Record<string, unknown> = {};
  if (input.description !== undefined) data.description = input.description.trim();
  if (input.date !== undefined) data.date = ymdToDate(input.date);
  if (input.amount !== undefined) data.amountCents = dollarsToCents(input.amount);
  if (input.effectiveAmount !== undefined)
    data.effectiveCents = cleanEffectiveCents(input.effectiveAmount);
  if (input.categoryId !== undefined) data.categoryId = cleanId(input.categoryId);
  if (input.needWant !== undefined) data.needWant = normNeedWant(input.needWant);
  if (input.incomeType !== undefined)
    data.incomeType = normIncomeType(input.incomeType);
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  if (input.recurring !== undefined) data.recurring = Boolean(input.recurring);
  if (input.reviewed !== undefined) data.reviewed = Boolean(input.reviewed);

  // Keep the dedupe hash in sync if any of its inputs changed.
  if (
    input.date !== undefined ||
    input.amount !== undefined ||
    input.description !== undefined
  ) {
    const current = await prisma.expense.findUnique({ where: { id } });
    if (current) {
      const date = (data.date as Date) ?? current.date;
      const amountCents = (data.amountCents as number) ?? current.amountCents;
      const description = (data.description as string) ?? current.description;
      const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      data.dedupeHash = makeDedupeHash(ymd, amountCents, description);
    }
  }

  const updated = await prisma.expense.update({ where: { id }, data });

  // Reviewing a row is the user's signal that its category/need-want are
  // correct — remember that choice for this merchant so future imports
  // pre-fill it. We learn from the persisted state (so a partial update that
  // left category/need-want untouched still teaches the right values).
  if (input.reviewed === true) {
    await learnMerchantRule({
      description: updated.description,
      categoryId: updated.categoryId,
      needWant: updated.needWant,
      incomeType: updated.incomeType,
    });
  }

  revalidateAll();
}

export async function deleteExpense(id: string) {
  await prisma.expense.delete({ where: { id } });
  revalidateAll();
}

/**
 * Link a refund/reimbursement credit row to the spending expense it offsets, or
 * pass `expenseId = null` to unlink. The linked expense stops counting toward
 * spend analytics (and is greyed out in the table). Validates that the credit is
 * actually a credit and the target is a real spending row, to keep the data sane.
 */
export async function linkRefund(refundId: string, expenseId: string | null) {
  if (expenseId) {
    if (expenseId === refundId) throw new Error("Can't link a row to itself.");
    const [refund, target] = await Promise.all([
      prisma.expense.findUnique({ where: { id: refundId } }),
      prisma.expense.findUnique({ where: { id: expenseId } }),
    ]);
    if (!refund || refund.amountCents >= 0)
      throw new Error("Only a credit (negative) row can offset an expense.");
    if (!target || target.amountCents < 0)
      throw new Error("Can only link to a spending expense.");
  }
  await prisma.expense.update({
    where: { id: refundId },
    data: { refundsExpenseId: expenseId },
  });
  revalidateAll();
}

export type BulkAction =
  | { type: "markReviewed"; value: boolean }
  | { type: "setCategory"; categoryId: string | null }
  | { type: "delete" };

export async function bulkExpenseAction(ids: string[], action: BulkAction) {
  if (ids.length === 0) return;
  if (action.type === "delete") {
    await prisma.expense.deleteMany({ where: { id: { in: ids } } });
  } else if (action.type === "markReviewed") {
    await prisma.expense.updateMany({
      where: { id: { in: ids } },
      data: { reviewed: action.value },
    });
  } else if (action.type === "setCategory") {
    await prisma.expense.updateMany({
      where: { id: { in: ids } },
      data: { categoryId: cleanId(action.categoryId) },
    });
  }
  revalidateAll();
}

/**
 * Bulk "mark reviewed" for the weekly review, applying each row's chosen
 * category and need/want in a single transaction (one round-trip for the whole
 * selection instead of N).
 */
export async function bulkReviewExpenses(
  items: {
    id: string;
    categoryId: string | null;
    needWant: string | null;
    incomeType?: string | null;
    // Optional manual cost override (dollars). Omit to leave it as-is.
    effectiveAmount?: string | number | null;
    // Optional inline edits. Omit to leave as-is.
    description?: string;
    date?: string;
  }[],
) {
  if (items.length === 0) return;
  // Rows whose description/date changed need their dedupe hash recomputed, which
  // requires the current row (for the unchanged half + the amount). Fetch those
  // once up front so the transaction below stays a pure batch of updates.
  const needHash = items.filter(
    (it) => it.description !== undefined || it.date !== undefined,
  );
  const current = new Map(
    needHash.length
      ? (
          await prisma.expense.findMany({
            where: { id: { in: needHash.map((it) => it.id) } },
          })
        ).map((e) => [e.id, e])
      : [],
  );
  await prisma.$transaction(
    items.map((it) => {
      const data: Record<string, unknown> = {
        reviewed: true,
        categoryId: cleanId(it.categoryId),
        needWant: normNeedWant(it.needWant),
        ...(it.incomeType !== undefined
          ? { incomeType: normIncomeType(it.incomeType) }
          : {}),
        ...(it.effectiveAmount !== undefined
          ? { effectiveCents: cleanEffectiveCents(it.effectiveAmount) }
          : {}),
      };
      if (it.description !== undefined) data.description = it.description.trim();
      if (it.date !== undefined) data.date = ymdToDate(it.date);
      if (it.description !== undefined || it.date !== undefined) {
        const cur = current.get(it.id);
        if (cur) {
          const date = (data.date as Date) ?? cur.date;
          const description = (data.description as string) ?? cur.description;
          const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
          data.dedupeHash = makeDedupeHash(ymd, cur.amountCents, description);
        }
      }
      return prisma.expense.update({ where: { id: it.id }, data });
    }),
  );
  // Remember each reviewed row's category/need-want for future imports.
  await learnFromExpenseIds(items.map((it) => it.id));
  revalidateAll();
}

// --------------------------------------------------------- Reflections

export async function saveReflection(month: string, reflection: string) {
  await prisma.monthlyReflection.upsert({
    where: { month },
    update: { reflection },
    create: { month, reflection },
  });
  bust(TAG.reflections);
}

// ------------------------------------------------------------ Settings

export async function updateSettings(input: {
  currencyCode: string;
  currencySymbol: string;
  mealNeedCents?: number;
}) {
  const data = {
    currencyCode: input.currencyCode,
    currencySymbol: input.currencySymbol,
    ...(input.mealNeedCents !== undefined
      ? { mealNeedCents: Math.max(0, Math.round(input.mealNeedCents)) }
      : {}),
  };
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });
  revalidateAll();
}

// ------------------------------------------------ Categories / methods

export async function createCategory(name: string, color: string) {
  const slug =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    `cat-${Date.now()}`;
  const max = await prisma.category.aggregate({ _max: { sortOrder: true } });
  await prisma.category.create({
    data: { name, slug, color, sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  revalidateAll();
}

export async function updateCategory(
  id: string,
  data: { name?: string; color?: string },
) {
  await prisma.category.update({ where: { id }, data });
  revalidateAll();
}

export async function archiveCategory(id: string) {
  await prisma.category.update({ where: { id }, data: { archived: true } });
  revalidateAll();
}

// --------------------------------------------------------------- Import

export interface ImportRowInput {
  date: string; // YYYY-MM-DD
  description: string;
  amount: string | number; // dollars
  categoryId: string | null;
  needWant: string | null;
  incomeType?: string | null;
  recurring?: boolean;
}

export async function commitImport(input: {
  filename: string;
  label: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  rows: ImportRowInput[];
}) {
  if (input.rows.length === 0) return { created: 0, statementId: null };

  const statement = await prisma.statement.create({
    data: {
      filename: input.filename,
      label: input.label,
      periodStart: input.periodStart ? ymdToDate(input.periodStart) : null,
      periodEnd: input.periodEnd ? ymdToDate(input.periodEnd) : null,
    },
  });

  const data = input.rows.map((r) => {
    const amountCents = dollarsToCents(r.amount);
    return {
      description: r.description.trim(),
      date: ymdToDate(r.date),
      amountCents,
      categoryId: cleanId(r.categoryId),
      needWant: normNeedWant(r.needWant),
      incomeType: normIncomeType(r.incomeType),
      recurring: Boolean(r.recurring),
      reviewed: false,
      sourceStatementId: statement.id,
      dedupeHash: makeDedupeHash(r.date, amountCents, r.description.trim()),
    };
  });

  await prisma.expense.createMany({ data });
  bust(TAG.expenses, TAG.statements);
  return { created: data.length, statementId: statement.id };
}

// ----------------------------------------------------------- Income / jobs

export interface JobInput {
  name: string;
  employer?: string | null;
  pay: string | number; // dollars, at the chosen cadence
  cadence: string;
  hoursPerWeek?: string | number | null;
  active?: boolean;
  startDate?: string | null; // "YYYY-MM-DD" or "" / null to clear
  endDate?: string | null; // "YYYY-MM-DD" or "" / null to clear
}

function cleanCadence(v: unknown): string {
  return isCadence(v) ? v : "monthly";
}
function cleanHours(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
/** Parse an optional date input: blank/null means "unset" (null). */
function cleanDate(v: unknown): Date | null {
  return typeof v === "string" && v !== "" ? ymdToDate(v) : null;
}

export async function createJob(input: JobInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Job name is required.");
  const max = await prisma.job.aggregate({ _max: { sortOrder: true } });
  await prisma.job.create({
    data: {
      name,
      employer: input.employer?.trim() || null,
      payCents: Math.max(0, dollarsToCents(input.pay)),
      cadence: cleanCadence(input.cadence),
      hoursPerWeek: cleanHours(input.hoursPerWeek),
      startDate: cleanDate(input.startDate),
      endDate: cleanDate(input.endDate),
      active: input.active ?? true,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
  bust(TAG.jobs);
}

export async function updateJob(id: string, input: Partial<JobInput>) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.employer !== undefined)
    data.employer = input.employer?.trim() || null;
  if (input.pay !== undefined) data.payCents = Math.max(0, dollarsToCents(input.pay));
  if (input.cadence !== undefined) data.cadence = cleanCadence(input.cadence);
  if (input.hoursPerWeek !== undefined)
    data.hoursPerWeek = cleanHours(input.hoursPerWeek);
  if (input.startDate !== undefined) data.startDate = cleanDate(input.startDate);
  if (input.endDate !== undefined) data.endDate = cleanDate(input.endDate);
  if (input.active !== undefined) data.active = Boolean(input.active);
  await prisma.job.update({ where: { id }, data });
  bust(TAG.jobs);
}

export async function deleteJob(id: string) {
  await prisma.job.delete({ where: { id } });
  bust(TAG.jobs);
}

// --------------------------------------------------------------- Investments

export interface HoldingInputDTO {
  symbol: string;
  name?: string | null;
  shares: string | number;
  avgCost?: string | number | null; // dollars per share
  currency?: string | null;
  account?: string | null;
}

function cleanSymbol(v: unknown): string {
  return typeof v === "string" ? v.trim().toUpperCase() : "";
}
function cleanShares(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}
function cleanCurrency(v: unknown): string {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(s) ? s : "CAD";
}
function cleanAvgCost(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const cents = dollarsToCents(v as string | number);
  return Number.isFinite(cents) ? Math.max(0, cents) : null;
}

export async function createHolding(input: HoldingInputDTO) {
  const symbol = cleanSymbol(input.symbol);
  if (!symbol) throw new Error("A ticker symbol is required.");
  const max = await prisma.holding.aggregate({ _max: { sortOrder: true } });
  await prisma.holding.create({
    data: {
      symbol,
      name: input.name?.trim() || null,
      shares: cleanShares(input.shares),
      avgCostCents: cleanAvgCost(input.avgCost),
      currency: cleanCurrency(input.currency),
      account: input.account?.trim() || null,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
  bust(TAG.holdings);
}

export async function updateHolding(
  id: string,
  input: Partial<HoldingInputDTO>,
) {
  const data: Record<string, unknown> = {};
  if (input.symbol !== undefined) data.symbol = cleanSymbol(input.symbol);
  if (input.name !== undefined) data.name = input.name?.trim() || null;
  if (input.shares !== undefined) data.shares = cleanShares(input.shares);
  if (input.avgCost !== undefined) data.avgCostCents = cleanAvgCost(input.avgCost);
  if (input.currency !== undefined) data.currency = cleanCurrency(input.currency);
  if (input.account !== undefined) data.account = input.account?.trim() || null;
  await prisma.holding.update({ where: { id }, data });
  bust(TAG.holdings);
}

export async function deleteHolding(id: string) {
  await prisma.holding.delete({ where: { id } });
  bust(TAG.holdings);
}

/** Ticker autocomplete: search the market for symbols matching free text. */
export async function searchSymbols(query: string): Promise<SymbolMatch[]> {
  return searchSymbolsMarket(query);
}

// --------------------------------------------------------------- Projection

const PLAN_ID = "singleton";

/** Ensure the singleton plan row exists, returning its id. */
async function ensurePlan(): Promise<string> {
  await prisma.budgetPlan.upsert({
    where: { id: PLAN_ID },
    create: { id: PLAN_ID },
    update: {},
  });
  return PLAN_ID;
}

const SCENARIOS = ["best", "average", "worst"] as const;
function cleanScenario(v: unknown): string {
  return typeof v === "string" && (SCENARIOS as readonly string[]).includes(v)
    ? v
    : "average";
}

/** Save the chart-level plan settings (horizon + highlighted scenario). */
export async function saveBudgetPlan(input: {
  horizonYears?: number;
  scenario?: string;
  // null clears the override (projection follows the Investment bucket again).
  investContribCents?: number | null;
}) {
  await ensurePlan();
  const data: Record<string, unknown> = {};
  if (input.horizonYears !== undefined)
    data.horizonYears = Math.max(1, Math.min(50, Math.round(input.horizonYears)));
  if (input.scenario !== undefined) data.scenario = cleanScenario(input.scenario);
  if (input.investContribCents !== undefined)
    data.investContribCents =
      input.investContribCents === null
        ? null
        : Math.max(0, Math.round(input.investContribCents));
  await prisma.budgetPlan.update({ where: { id: PLAN_ID }, data });
  bust(TAG.plan);
}

/** Upsert a single bucket's amount and/or lock state (keyed by plan + key). */
export async function setBucket(
  key: string,
  input: { amountCents?: number; locked?: boolean },
) {
  const planId = await ensurePlan();
  const amountCents =
    input.amountCents !== undefined
      ? Math.max(0, Math.round(input.amountCents))
      : undefined;
  await prisma.budgetBucket.upsert({
    where: { planId_key: { planId, key } },
    create: {
      planId,
      key,
      amountCents: amountCents ?? 0,
      locked: input.locked ?? false,
    },
    update: {
      ...(amountCents !== undefined ? { amountCents } : {}),
      ...(input.locked !== undefined ? { locked: input.locked } : {}),
    },
  });
  bust(TAG.plan);
}

/**
 * Persist a whole bucket map at once (after a rebalance). Replaces every
 * bucket's amount/lock in one transaction so the saved plan always sums to the
 * income pot.
 */
export async function setBuckets(
  buckets: { key: string; amountCents: number; locked: boolean }[],
) {
  const planId = await ensurePlan();
  await prisma.$transaction(
    buckets.map((b) =>
      prisma.budgetBucket.upsert({
        where: { planId_key: { planId, key: b.key } },
        create: {
          planId,
          key: b.key,
          amountCents: Math.max(0, Math.round(b.amountCents)),
          locked: b.locked,
        },
        update: {
          amountCents: Math.max(0, Math.round(b.amountCents)),
          locked: b.locked,
        },
      }),
    ),
  );
  bust(TAG.plan);
}

/** Replace the investment allocation set (percent per ticker). */
export async function setInvestmentAllocations(
  allocations: { symbol: string; percent: number }[],
) {
  const planId = await ensurePlan();
  const clean = allocations
    .map((a) => ({
      symbol: cleanSymbol(a.symbol),
      percent: Number.isFinite(a.percent) ? Math.max(0, a.percent) : 0,
    }))
    .filter((a) => a.symbol);
  await prisma.$transaction([
    prisma.investmentAllocation.deleteMany({ where: { planId } }),
    ...(clean.length > 0
      ? [
          prisma.investmentAllocation.createMany({
            data: clean.map((a) => ({ planId, symbol: a.symbol, percent: a.percent })),
          }),
        ]
      : []),
  ]);
  bust(TAG.plan);
}

/**
 * Fetch multi-year monthly price history for every held symbol, derive its
 * return/volatility, and cache it in ReturnStat. Runs on a button click (like
 * refreshQuotes) so page loads never block on the network.
 */
export async function refreshReturnStats(): Promise<{
  updated: number;
  failed: number;
}> {
  const holdings = await prisma.holding.findMany({ select: { symbol: true } });
  const symbols = [...new Set(holdings.map((h) => h.symbol))];
  if (symbols.length === 0) return { updated: 0, failed: 0 };

  let updated = 0;
  let failed = 0;
  for (const symbol of symbols) {
    const closes = await fetchHistory(symbol);
    const stats = closes ? computeReturnStats(closes) : null;
    if (!stats) {
      failed += 1;
      continue;
    }
    await prisma.returnStat.upsert({
      where: { symbol },
      create: {
        symbol,
        annualReturn: stats.annualReturn,
        annualVol: stats.annualVol,
        months: stats.months,
      },
      update: {
        annualReturn: stats.annualReturn,
        annualVol: stats.annualVol,
        months: stats.months,
        fetchedAt: new Date(),
      },
    });
    updated += 1;
  }
  bust(TAG.returnStats);
  return { updated, failed };
}

/**
 * Fetch the latest market prices for every held symbol (and any needed FX
 * rates), cache them, and snapshot today's total portfolio value. Runs on a
 * user button click so page loads never block on the network.
 */
export async function refreshQuotes(): Promise<{
  updated: number;
  failed: number;
}> {
  const holdings = await prisma.holding.findMany();
  if (holdings.length === 0) return { updated: 0, failed: 0 };

  const symbols = [...new Set(holdings.map((h) => h.symbol))];
  const quotes = await fetchQuotes(symbols);

  // Cache each quote.
  for (const q of quotes) {
    await prisma.priceQuote.upsert({
      where: { symbol: q.symbol },
      create: {
        symbol: q.symbol,
        priceCents: q.priceCents,
        currency: q.currency,
        changePct: q.changePct ?? null,
        name: q.name,
        asOf: q.asOfMs ? new Date(q.asOfMs) : new Date(),
      },
      update: {
        priceCents: q.priceCents,
        currency: q.currency,
        changePct: q.changePct ?? null,
        name: q.name,
        asOf: q.asOfMs ? new Date(q.asOfMs) : new Date(),
        fetchedAt: new Date(),
      },
    });
  }

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
  });
  const base = settings?.currencyCode ?? "CAD";

  // Fetch & cache FX rates for any quote currency that isn't the base.
  const quoteBySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  const fxRates: Record<string, number> = {};
  const foreign = [
    ...new Set(quotes.map((q) => q.currency).filter((c) => c !== base)),
  ];
  for (const cur of foreign) {
    const rate = await fetchFxRate(cur, base);
    if (rate != null) {
      fxRates[cur] = rate;
      await prisma.fxRate.upsert({
        where: { pair: `${cur}${base}` },
        create: { pair: `${cur}${base}`, rate },
        update: { rate, fetchedAt: new Date() },
      });
    }
  }

  // Snapshot today's total value (base currency) from priced holdings.
  let totalCents = 0;
  for (const h of holdings) {
    const q = quoteBySymbol.get(h.symbol);
    if (!q) continue;
    const valueNative = Math.round(h.shares * q.priceCents);
    totalCents += toBaseCents(valueNative, q.currency, base, fxRates);
  }
  const today = dateToYMD(new Date());
  await prisma.portfolioSnapshot.upsert({
    where: { date: today },
    create: { date: today, totalCents },
    update: { totalCents },
  });

  bust(TAG.quotes, TAG.snapshots);
  return { updated: quotes.length, failed: symbols.length - quotes.length };
}

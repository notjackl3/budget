import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import { toExpenseDTO, type ExpenseDTO } from "./types";
import type { AggExpense } from "./aggregate";
import { ymdToDate } from "./dates";
import { TAG } from "./cache-tags";

const expenseInclude = {
  category: { select: { name: true, color: true } },
  paymentMethod: { select: { name: true } },
  sourceStatement: { select: { label: true } },
} as const;

// All reads below go through Next's Data Cache via `unstable_cache`, keyed by a
// stable name and tagged so mutations can invalidate precisely. A page
// navigation now reuses the previous query's result instead of re-hitting the
// DB — categories/methods/settings (fetched in the layout on *every* page) in
// particular no longer re-query on each navigation. Mutations in `actions.ts`
// call `revalidateTag(...)` to bust the relevant entries.

export const getExpenses = unstable_cache(
  async (): Promise<ExpenseDTO[]> => {
    const rows = await prisma.expense.findMany({
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: expenseInclude,
    });
    return rows.map(toExpenseDTO);
  },
  ["expenses-list"],
  { tags: [TAG.expenses] },
);

/** Unreviewed expenses, for the weekly review. */
export const getUnreviewedExpenses = unstable_cache(
  async (): Promise<ExpenseDTO[]> => {
    const rows = await prisma.expense.findMany({
      where: { reviewed: false },
      orderBy: [{ date: "desc" }],
      include: expenseInclude,
    });
    return rows.map(toExpenseDTO);
  },
  ["expenses-unreviewed"],
  { tags: [TAG.expenses] },
);

// Cache the DB read with JSON-safe ISO date strings (don't trust the Data Cache
// serializer to round-trip `Date`), then rehydrate to `Date` outside the cache
// so callers/aggregation keep working unchanged.
const getAggRows = unstable_cache(
  async () => {
    const rows = await prisma.expense.findMany({
      include: { category: { select: { name: true, color: true, slug: true } } },
    });
    return rows.map((e) => ({
      date: e.date.toISOString(),
      // Analytics use the effective cost (what it actually cost after any
      // override). Income rows (negatives) keep their negative sign so the
      // aggregator can separate them from spending.
      amountCents: e.effectiveCents ?? e.amountCents,
      needWant: e.needWant,
      incomeType: e.incomeType,
      categoryId: e.categoryId,
      categoryName: e.category?.name ?? null,
      categoryColor: e.category?.color ?? null,
      categorySlug: e.category?.slug ?? null,
      reviewed: e.reviewed,
      recurring: e.recurring,
    }));
  },
  ["expenses-agg"],
  { tags: [TAG.expenses] },
);

/** Aggregation-ready records (Date objects) for the dashboard/summaries. */
export async function getAggExpenses(): Promise<AggExpense[]> {
  const rows = await getAggRows();
  return rows.map((r) => ({ ...r, date: new Date(r.date) }));
}

export const getCategories = unstable_cache(
  async () =>
    prisma.category.findMany({
      where: { archived: false },
      orderBy: { sortOrder: "asc" },
    }),
  ["categories-list"],
  { tags: [TAG.categories] },
);

export const getPaymentMethods = unstable_cache(
  async () =>
    prisma.paymentMethod.findMany({
      where: { archived: false },
      orderBy: { sortOrder: "asc" },
    }),
  ["payment-methods-list"],
  { tags: [TAG.paymentMethods] },
);

// Settings is a singleton row read in the layout on every navigation; cache the
// read so it's free after the first. Create-on-miss happens outside the cache
// (never cache a write); the cached read then serves subsequent calls.
const getSettingsCached = unstable_cache(
  async () => prisma.settings.findUnique({ where: { id: "singleton" } }),
  ["settings-singleton"],
  { tags: [TAG.settings] },
);

export async function getSettings() {
  const existing = await getSettingsCached();
  if (existing) return existing;
  return prisma.settings.create({ data: { id: "singleton" } });
}

export async function getReflection(month: string) {
  return prisma.monthlyReflection.findUnique({ where: { month } });
}

export const getAllReflections = unstable_cache(
  async () => prisma.monthlyReflection.findMany(),
  ["reflections-list"],
  { tags: [TAG.reflections] },
);

export const getStatements = unstable_cache(
  async () =>
    prisma.statement.findMany({
      orderBy: { periodEnd: "desc" },
      include: { _count: { select: { expenses: true } } },
    }),
  ["statements-list"],
  { tags: [TAG.statements] },
);

/** Existing dedupe hashes, for duplicate detection during import. */
export async function getExistingHashes(): Promise<Set<string>> {
  const rows = await prisma.expense.findMany({ select: { dedupeHash: true } });
  return new Set(rows.map((r) => r.dedupeHash));
}

// ----------------------------------------------------------- Income / jobs

export const getJobs = unstable_cache(
  async () => prisma.job.findMany({ orderBy: { sortOrder: "asc" } }),
  ["jobs-list"],
  { tags: [TAG.jobs] },
);

// --------------------------------------------------------------- Investments

export const getHoldings = unstable_cache(
  async () => prisma.holding.findMany({ orderBy: { sortOrder: "asc" } }),
  ["holdings-list"],
  { tags: [TAG.holdings] },
);

export const getQuotes = unstable_cache(
  async () => prisma.priceQuote.findMany(),
  ["quotes-list"],
  { tags: [TAG.quotes] },
);

export const getFxRates = unstable_cache(
  async () => prisma.fxRate.findMany(),
  ["fx-rates"],
  { tags: [TAG.quotes] },
);

export const getPortfolioSnapshots = unstable_cache(
  async () => prisma.portfolioSnapshot.findMany({ orderBy: { date: "asc" } }),
  ["snapshots-list"],
  { tags: [TAG.snapshots] },
);

export { ymdToDate };

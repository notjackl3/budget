// Source-agnostic transaction ingestion.
//
// Both the monthly-PDF importer and the near-real-time email-alert poller need
// the *same* tail end of the pipeline: take raw {date, description, amount}
// rows, auto-categorize them (heuristics + learned merchant rules + income
// detection), drop duplicates, and write them. This module is that shared sink.
//
// It deliberately avoids any Next.js-only APIs (no `revalidateTag`, no request
// context) so a plain `tsx` cron script can call it exactly like a route can.
// Callers running inside Next should bust their caches afterward.

import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { guessCategory } from "./categorize";
import { isIncomeAmount, guessIncomeType } from "./categories";
import { merchantKey } from "./merchant-key";
import { getMerchantRuleMap, overrideWithRule } from "./merchant-rules";
import { makeDedupeHash } from "./parse-statement";
import { ymdToDate } from "./dates";

/** A raw transaction from any source, before categorization/dedupe. */
export interface RawTxn {
  /** YYYY-MM-DD. */
  date: string;
  description: string;
  /** Integer cents. Positive = charge, negative = credit/refund. */
  amountCents: number;
  /** Bank-provided spend category, if the source has one (PDF does, email won't). */
  bankCategory?: string | null;
}

export interface IngestOptions {
  /**
   * Mark rows as unconfirmed (true for email-alert rows). Provisional rows are
   * later reconciled away when the official statement imports. Defaults false.
   */
  provisional?: boolean;
  /** Link rows to a Statement, for PDF imports. null/undefined for email/manual. */
  sourceStatementId?: string | null;
}

/** A minimal record of one transaction, for reporting back to the UI. */
export interface IngestItem {
  date: string;
  description: string;
  amountCents: number;
}

export interface IngestResult {
  created: number;
  /** Rows skipped because an identical fingerprint already existed. */
  skippedDuplicate: number;
  /** The rows actually inserted this run. */
  createdItems: IngestItem[];
  /** The rows that were already in the database (skipped as duplicates). */
  duplicateItems: IngestItem[];
}

/**
 * Categorize, dedupe, and persist a batch of raw transactions. Idempotent: a
 * row whose exact fingerprint already exists (from a prior run or earlier in
 * the same batch) is skipped, so re-polling the same emails is safe.
 */
export async function ingestTransactions(
  txns: RawTxn[],
  opts: IngestOptions = {},
): Promise<IngestResult> {
  if (txns.length === 0)
    return { created: 0, skippedDuplicate: 0, createdItems: [], duplicateItems: [] };

  const categories = await prisma.category.findMany({
    where: { archived: false },
    select: { id: true, slug: true },
  });
  const slugToId = new Map(categories.map((c) => [c.slug, c.id]));
  const idToSlug = new Map(categories.map((c) => [c.id, c.slug]));
  const miscId = slugToId.get("miscellaneous") ?? categories[0]?.id ?? null;

  const ruleMap = await getMerchantRuleMap();

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { mealNeedCents: true },
  });
  const mealNeedCents = settings?.mealNeedCents ?? 1500;

  const existingRows = await prisma.expense.findMany({ select: { dedupeHash: true } });
  const seen = new Set(existingRows.map((r) => r.dedupeHash));

  const duplicateItems: IngestItem[] = [];
  const createdItems: IngestItem[] = [];
  const data: Prisma.ExpenseCreateManyInput[] = [];

  for (const t of txns) {
    const description = t.description.trim();
    const dedupeHash = makeDedupeHash(t.date, t.amountCents, description);
    if (seen.has(dedupeHash)) {
      duplicateItems.push({ date: t.date, description, amountCents: t.amountCents });
      continue;
    }
    seen.add(dedupeHash);
    createdItems.push({ date: t.date, description, amountCents: t.amountCents });

    const income = isIncomeAmount(t.amountCents);
    const guess = guessCategory(description, t.bankCategory ?? null, {
      amountCents: t.amountCents,
      mealNeedCents,
    });
    const resolved = overrideWithRule(
      {
        categorySlug: guess.categorySlug,
        categoryId: slugToId.get(guess.categorySlug) ?? miscId,
        needWant: income ? null : guess.needWant,
        incomeType: income ? guessIncomeType(description) : null,
      },
      ruleMap.get(merchantKey(description)),
      idToSlug,
      income,
    );

    data.push({
      description,
      date: ymdToDate(t.date),
      amountCents: t.amountCents,
      categoryId: resolved.categoryId,
      needWant: resolved.needWant,
      incomeType: resolved.incomeType,
      recurring: false,
      reviewed: false,
      provisional: Boolean(opts.provisional),
      sourceStatementId: opts.sourceStatementId ?? null,
      dedupeHash,
    });
  }

  if (data.length > 0) {
    await prisma.expense.createMany({ data });
  }
  return {
    created: data.length,
    skippedDuplicate: duplicateItems.length,
    createdItems,
    duplicateItems,
  };
}

// --------------------------------------------------------- Cross-source dedupe

/** Days either side of a posted transaction we'll look for its provisional twin. */
export const RECONCILE_WINDOW_DAYS = 4;

function normalizeMerchant(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Do two merchant strings plausibly refer to the same purchase? An alert email
 * carries a short merchant label ("TIM HORTONS") while the posted statement
 * line is longer and noisier ("TIM HORTONS #4021 TORONTO ON"). We treat them as
 * the same when, after stripping to alphanumerics, one is a prefix/substring of
 * the other (with a small minimum length so trivial fragments don't match).
 */
export function fuzzyMerchantMatch(a: string, b: string): boolean {
  const x = normalizeMerchant(a);
  const y = normalizeMerchant(b);
  if (!x || !y) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length < 4) return short === long;
  return long.includes(short) || long.startsWith(short.slice(0, 6));
}

/**
 * When the official statement imports, retire provisional email rows that the
 * posted rows now cover, so the purchase isn't double-counted. A provisional
 * row is retired when some posted row has the same amount, a fuzzily-matching
 * merchant, and a date within RECONCILE_WINDOW_DAYS (auth vs. posted date can
 * drift by a couple of days). Returns the number of provisional rows removed.
 *
 * Matching on amount is the strong signal; the date window and fuzzy merchant
 * guard against coincidental same-amount collisions. We intentionally keep the
 * official posted row (it has the bank's category and final amount) and delete
 * the provisional one.
 */
export async function reconcileProvisional(posted: RawTxn[]): Promise<number> {
  if (posted.length === 0) return 0;

  const provisional = await prisma.expense.findMany({
    where: { provisional: true },
    select: { id: true, amountCents: true, description: true, date: true },
  });
  if (provisional.length === 0) return 0;

  const windowMs = RECONCILE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const toRemove = new Set<string>();

  for (const p of provisional) {
    const match = posted.find((q) => {
      if (q.amountCents !== p.amountCents) return false;
      const dDiff = Math.abs(ymdToDate(q.date).getTime() - p.date.getTime());
      if (dDiff > windowMs) return false;
      return fuzzyMerchantMatch(p.description, q.description);
    });
    if (match) toRemove.add(p.id);
  }

  if (toRemove.size > 0) {
    await prisma.expense.deleteMany({ where: { id: { in: [...toRemove] } } });
  }
  return toRemove.size;
}

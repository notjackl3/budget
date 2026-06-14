// Learned-categorization memory: read/write the MerchantRule table and apply
// remembered preferences to freshly-imported rows.
//
// The flow:
//   1. User corrects a row's category/need-want during review and marks it
//      reviewed  ->  `learnMerchantRule` records the choice by merchant key.
//   2. Next import  ->  `getMerchantRuleMap` is consulted and `overrideWithRule`
//      pre-fills matching rows, so the user just confirms.

import { prisma } from "./prisma";
import { merchantKey } from "./merchant-key";
import { NEED_WANT, INCOME_TYPES } from "./categories";

export interface MerchantRuleMatch {
  categoryId: string | null;
  needWant: string | null;
  incomeType: string | null;
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

/**
 * Remember the user's manual category/need-want choice for a merchant.
 *
 * Per-field "sticky" merge: a new review only overwrites a field when it
 * supplies a non-null value, so reviewing a known merchant without touching its
 * need-want (left at "—") won't erase a previously-learned one. To genuinely
 * change a remembered value, pick a different non-null value.
 *
 * No-op when there's nothing worth remembering: a blank merchant key (e.g. a
 * numbers-only description) or neither a category nor a need-want set.
 */
export async function learnMerchantRule(input: {
  description: string;
  categoryId: string | null;
  needWant: string | null;
  incomeType?: string | null;
}): Promise<void> {
  const key = merchantKey(input.description);
  if (!key) return;

  const incomingCategoryId = input.categoryId ?? null;
  const incomingNeedWant = normNeedWant(input.needWant);
  const incomingIncomeType = normIncomeType(input.incomeType);
  // Nothing worth remembering if no category, no need-want, and no income type.
  if (!incomingCategoryId && !incomingNeedWant && !incomingIncomeType) return;

  const existing = await prisma.merchantRule.findUnique({
    where: { merchantKey: key },
  });

  // Sticky per-field merge: a field only changes when a new non-null value
  // arrives. needWant (charges) and incomeType (credits) live side by side, so
  // teaching one never disturbs the other.
  const categoryId = incomingCategoryId ?? existing?.categoryId ?? null;
  const needWant = incomingNeedWant ?? existing?.needWant ?? null;
  const incomeType = incomingIncomeType ?? existing?.incomeType ?? null;

  await prisma.merchantRule.upsert({
    where: { merchantKey: key },
    create: {
      merchantKey: key,
      sampleDescription: input.description.trim(),
      categoryId,
      needWant,
      incomeType,
    },
    update: {
      sampleDescription: input.description.trim(),
      categoryId,
      needWant,
      incomeType,
      hits: { increment: 1 },
    },
  });
}

/**
 * Learn from a set of just-reviewed expenses by reading their final persisted
 * state. Sequential (not parallel) so several rows sharing one merchant key in
 * the same batch fold into a single rule cleanly instead of racing.
 */
export async function learnFromExpenseIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const expenses = await prisma.expense.findMany({
    where: { id: { in: ids } },
    select: {
      description: true,
      categoryId: true,
      needWant: true,
      incomeType: true,
    },
  });
  for (const e of expenses) await learnMerchantRule(e);
}

/** All remembered rules as a lookup keyed by merchant key. */
export async function getMerchantRuleMap(): Promise<
  Map<string, MerchantRuleMatch>
> {
  const rules = await prisma.merchantRule.findMany({
    select: {
      merchantKey: true,
      categoryId: true,
      needWant: true,
      incomeType: true,
    },
  });
  return new Map(
    rules.map((r) => [
      r.merchantKey,
      {
        categoryId: r.categoryId,
        needWant: r.needWant,
        incomeType: r.incomeType,
      },
    ]),
  );
}

/**
 * Apply a remembered rule on top of an auto-categorizer guess. Pure so the
 * override precedence is unit-testable without a database.
 *
 * - A remembered category wins only if it still resolves to a live category
 *   (`idToSlug` has it); an archived/deleted category is ignored so we never
 *   set a dangling id or mismatched slug.
 * - A remembered need-want always wins (it's the user's explicit call).
 */
interface ResolvedRow {
  categorySlug: string;
  categoryId: string | null;
  needWant: string | null;
  incomeType: string | null;
}

export function overrideWithRule(
  base: ResolvedRow,
  rule: MerchantRuleMatch | undefined,
  idToSlug: Map<string, string>,
  isIncome: boolean,
): ResolvedRow {
  if (!rule) return base;
  const out = { ...base };
  if (rule.categoryId && idToSlug.has(rule.categoryId)) {
    out.categoryId = rule.categoryId;
    out.categorySlug = idToSlug.get(rule.categoryId)!;
  }
  // Charge rows take a remembered need-want; credit rows take a remembered
  // income type. The two halves are stored independently on the rule, so the
  // same merchant can correctly recall "Want" for a purchase and "Refund" for
  // a return.
  if (isIncome) {
    if (rule.incomeType) out.incomeType = rule.incomeType;
  } else {
    if (rule.needWant) out.needWant = rule.needWant;
  }
  return out;
}

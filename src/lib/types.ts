import { monthKey, weekKey, dateToYMD } from "./dates";

export interface ExpenseDTO {
  id: string;
  description: string;
  date: string; // "YYYY-MM-DD"
  amountCents: number; // what was charged (from the statement)
  effectiveCents: number | null; // manual cost override; null = no override
  effectiveAmountCents: number; // derived: effectiveCents ?? amountCents
  needWant: string | null;
  incomeType: string | null; // "Salary" | "Refund" | "Reimbursement" | null
  isIncome: boolean; // derived: amountCents < 0 (incoming money, not spending)
  // Refund/reimbursement linking. For a credit row: the expense it offsets (and
  // that expense's description for display). For a spending row: `voided` is true
  // when some credit row cancels it, so it's excluded from spend analytics.
  refundsExpenseId: string | null;
  refundsDescription: string | null;
  voided: boolean;
  notes: string | null;
  recurring: boolean;
  reviewed: boolean;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  sourceStatementId: string | null;
  sourceStatementLabel: string | null;
  month: string; // derived "YYYY-MM"
  week: string; // derived "YYYY-Www"
}

// Shape of the Prisma row (with relations) we map from.
interface ExpenseRow {
  id: string;
  description: string;
  date: Date;
  amountCents: number;
  effectiveCents: number | null;
  needWant: string | null;
  incomeType: string | null;
  refundsExpenseId?: string | null;
  notes: string | null;
  recurring: boolean;
  reviewed: boolean;
  categoryId: string | null;
  sourceStatementId: string | null;
  category?: { name: string; color: string | null } | null;
  sourceStatement?: { label: string | null } | null;
  // The expense this credit row offsets (for showing "Refund of …").
  refunds?: { description: string } | null;
}

/**
 * Map a Prisma row to a DTO. `voided` can't be derived from the row alone (it
 * depends on whether another credit row points at it), so callers pass it in
 * after computing the set of offset expense ids.
 */
export function toExpenseDTO(e: ExpenseRow, voided = false): ExpenseDTO {
  return {
    id: e.id,
    description: e.description,
    date: dateToYMD(e.date),
    amountCents: e.amountCents,
    effectiveCents: e.effectiveCents,
    effectiveAmountCents: e.effectiveCents ?? e.amountCents,
    needWant: e.needWant,
    incomeType: e.incomeType,
    isIncome: e.amountCents < 0,
    refundsExpenseId: e.refundsExpenseId ?? null,
    refundsDescription: e.refunds?.description ?? null,
    voided,
    notes: e.notes,
    recurring: e.recurring,
    reviewed: e.reviewed,
    categoryId: e.categoryId,
    categoryName: e.category?.name ?? null,
    categoryColor: e.category?.color ?? null,
    sourceStatementId: e.sourceStatementId,
    sourceStatementLabel: e.sourceStatement?.label ?? null,
    month: monthKey(e.date),
    week: weekKey(e.date),
  };
}

export interface CategoryDTO {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  sortOrder: number;
}

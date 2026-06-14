import { monthKey, weekKey, dateToYMD } from "./dates";

export interface ExpenseDTO {
  id: string;
  description: string;
  date: string; // "YYYY-MM-DD"
  amountCents: number; // what was charged (from the statement)
  effectiveCents: number | null; // manual cost override; null = no override
  effectiveAmountCents: number; // derived: effectiveCents ?? amountCents
  needWant: string | null;
  incomeType: string | null; // "Refund" | "Salary" | null (income rows)
  isIncome: boolean; // derived: amountCents < 0 (incoming money, not spending)
  notes: string | null;
  recurring: boolean;
  reviewed: boolean;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
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
  notes: string | null;
  recurring: boolean;
  reviewed: boolean;
  categoryId: string | null;
  paymentMethodId: string | null;
  sourceStatementId: string | null;
  category?: { name: string; color: string | null } | null;
  paymentMethod?: { name: string } | null;
  sourceStatement?: { label: string | null } | null;
}

export function toExpenseDTO(e: ExpenseRow): ExpenseDTO {
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
    notes: e.notes,
    recurring: e.recurring,
    reviewed: e.reviewed,
    categoryId: e.categoryId,
    categoryName: e.category?.name ?? null,
    categoryColor: e.category?.color ?? null,
    paymentMethodId: e.paymentMethodId,
    paymentMethodName: e.paymentMethod?.name ?? null,
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

export interface PaymentMethodDTO {
  id: string;
  name: string;
  sortOrder: number;
}

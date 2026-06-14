// Default seed data shared by the Prisma seed and the auto-categorizer.
// `slug` is the stable identifier; `name` is the editable display label.

export interface SeedCategory {
  slug: string;
  name: string;
  color: string;
}

// Restrained, single-hue-leaning palette (calm, not a rainbow). Used for chart
// segments and category badges.
export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { slug: "rent-housing", name: "Rent / Housing", color: "#6366f1" },
  { slug: "groceries", name: "Groceries", color: "#16a34a" },
  { slug: "eating-out", name: "Eating Out", color: "#ea580c" },
  { slug: "coffee-snacks", name: "Coffee / Snacks", color: "#b45309" },
  { slug: "transit", name: "Transit", color: "#0891b2" },
  { slug: "subscriptions", name: "Subscriptions", color: "#7c3aed" },
  { slug: "shopping", name: "Shopping", color: "#db2777" },
  { slug: "school", name: "School", color: "#2563eb" },
  { slug: "tech-tools", name: "Tech / Tools", color: "#475569" },
  // "Explore" merges the former Travel + Social categories (flights, hotels,
  // outings, entertainment) into one.
  { slug: "explore", name: "Explore", color: "#0d9488" },
  { slug: "health", name: "Health", color: "#dc2626" },
  { slug: "work", name: "Work", color: "#0ea5e9" },
  { slug: "miscellaneous", name: "Miscellaneous", color: "#94a3b8" },
  // A need bought in its premium/convenience form (e.g. an Uber ride instead of
  // transit) — the "want version of a need". Paired with the "Comfort" need/want
  // flag below.
  { slug: "comfort", name: "Comfort", color: "#eab308" },
];

export const DEFAULT_PAYMENT_METHODS = [
  "Credit Card",
  "Debit",
  "Cash",
  "e-Transfer",
  "Other",
];

// "Comfort" = a need you spent extra on (the want-version of a need). Treated as
// a first-class third classification alongside Need and Want everywhere.
export const NEED_WANT = ["Need", "Want", "Comfort"] as const;
export type NeedWant = (typeof NEED_WANT)[number];

// Negative-amount transactions are incoming money (credits/returns/deposits),
// not spending. Instead of a Need/Want flag they carry an income type. Kind is
// derived purely from the amount sign (amountCents < 0 -> income), so no extra
// stored flag is needed to tell them apart.
export const INCOME_TYPES = ["Refund", "Salary"] as const;
export type IncomeType = (typeof INCOME_TYPES)[number];

/** True when a transaction is incoming money rather than spending. */
export function isIncomeAmount(amountCents: number): boolean {
  return amountCents < 0;
}

/**
 * Best-guess income type from the description, used to pre-fill imported
 * credits. Payroll-ish deposits -> Salary; everything else on a card statement
 * is almost always a return/refund. The user can correct it during review (and
 * the merchant memory then remembers the correction).
 */
export function guessIncomeType(description: string): IncomeType {
  return /PAYROLL|SALARY|DIRECT DEP|DIR DEP|DIRDEP|PAYROL/i.test(description)
    ? "Salary"
    : "Refund";
}

// Meal-threshold split: eating-out expenses are treated as part-Need, part-Comfort.
// The first `mealNeedCents` of each meal is a Need (you have to eat); the excess
// is Comfort (you chose to spend more). Only this category is split this way.
export const MEAL_SPLIT_SLUG = "eating-out";
export const DEFAULT_MEAL_NEED_CENTS = 1500;

/** Coarse Need/Want/Comfort label for a single meal, given the threshold. */
export function mealFlag(amountCents: number, mealNeedCents: number): NeedWant {
  return amountCents > mealNeedCents ? "Comfort" : "Need";
}

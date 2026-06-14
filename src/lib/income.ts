// Income/job helpers. Pay is stored at a cadence; these normalize it to a
// monthly and annual figure so the Income page can total across jobs. Pure and
// dependency-light for easy testing.

export const PAY_CADENCES = [
  { value: "hourly", label: "Hourly" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "semimonthly", label: "Twice a month" },
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annual" },
] as const;

export type Cadence = (typeof PAY_CADENCES)[number]["value"];

const CADENCE_VALUES = PAY_CADENCES.map((c) => c.value) as readonly string[];

export function isCadence(v: unknown): v is Cadence {
  return typeof v === "string" && CADENCE_VALUES.includes(v);
}

export function cadenceLabel(value: string): string {
  return PAY_CADENCES.find((c) => c.value === value)?.label ?? value;
}

export interface IncomeJob {
  payCents: number;
  cadence: string;
  hoursPerWeek?: number | null;
  active?: boolean;
}

// How many pay periods occur per year for each fixed cadence.
const PERIODS_PER_YEAR: Record<Exclude<Cadence, "hourly" | "annual">, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

/** Annualized income for a single job, in cents. */
export function annualIncomeCents(job: IncomeJob): number {
  const pay = Number.isFinite(job.payCents) ? job.payCents : 0;
  switch (job.cadence) {
    case "hourly":
      // hours/week * 52 weeks
      return Math.round(pay * (job.hoursPerWeek ?? 0) * 52);
    case "annual":
      return pay;
    case "weekly":
    case "biweekly":
    case "semimonthly":
    case "monthly":
      return pay * PERIODS_PER_YEAR[job.cadence];
    default:
      return 0;
  }
}

/** Monthly income for a single job, in cents (annual / 12). */
export function monthlyIncomeCents(job: IncomeJob): number {
  return Math.round(annualIncomeCents(job) / 12);
}

/** Totals across jobs. Only `active` jobs count toward the totals. */
export function incomeTotals(jobs: IncomeJob[]): {
  monthlyCents: number;
  annualCents: number;
} {
  let annualCents = 0;
  for (const j of jobs) {
    if (j.active === false) continue;
    annualCents += annualIncomeCents(j);
  }
  return { monthlyCents: Math.round(annualCents / 12), annualCents };
}

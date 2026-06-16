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
  payCents: number; // net / take-home at `cadence`
  cadence: string;
  hoursPerWeek?: number | null;
  // Optional gross (pre-tax) at `cadence`. Null/undefined = take-home only.
  grossCents?: number | null;
  active?: boolean;
  // Active window, "YYYY-MM-DD" (or null). startDate null = always-on from the
  // beginning; endDate null = still ongoing.
  startDate?: string | null;
  endDate?: string | null;
}

// How many pay periods occur per year for each fixed cadence.
const PERIODS_PER_YEAR: Record<Exclude<Cadence, "hourly" | "annual">, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

/** Annualize a per-cadence cents amount (net, gross, or tax all use this). */
export function annualizeCents(
  amountCents: number,
  cadence: string,
  hoursPerWeek?: number | null,
): number {
  const amt = Number.isFinite(amountCents) ? amountCents : 0;
  switch (cadence) {
    case "hourly":
      // hours/week * 52 weeks
      return Math.round(amt * (hoursPerWeek ?? 0) * 52);
    case "annual":
      return amt;
    case "weekly":
    case "biweekly":
    case "semimonthly":
    case "monthly":
      return amt * PERIODS_PER_YEAR[cadence];
    default:
      return 0;
  }
}

/** Annualized take-home income for a single job, in cents. */
export function annualIncomeCents(job: IncomeJob): number {
  return annualizeCents(job.payCents, job.cadence, job.hoursPerWeek);
}

/** Monthly take-home income for a single job, in cents (annual / 12). */
export function monthlyIncomeCents(job: IncomeJob): number {
  return Math.round(annualIncomeCents(job) / 12);
}

/**
 * Totals across jobs. Only `active` jobs count. `*Cents` (unqualified) are the
 * net take-home figures every other page relies on; `gross*` and `tax*` are
 * derived from jobs that carry a gross amount (jobs with no gross contribute
 * gross = net, i.e. zero tax).
 */
export function incomeTotals(jobs: IncomeJob[]): {
  monthlyCents: number;
  annualCents: number;
  grossMonthlyCents: number;
  grossAnnualCents: number;
  taxMonthlyCents: number;
  taxAnnualCents: number;
} {
  let annualCents = 0;
  let grossAnnualCents = 0;
  for (const j of jobs) {
    if (j.active === false) continue;
    annualCents += annualIncomeCents(j);
    const grossPer = j.grossCents != null ? j.grossCents : j.payCents;
    grossAnnualCents += annualizeCents(grossPer, j.cadence, j.hoursPerWeek);
  }
  const taxAnnualCents = grossAnnualCents - annualCents;
  return {
    monthlyCents: Math.round(annualCents / 12),
    annualCents,
    grossMonthlyCents: Math.round(grossAnnualCents / 12),
    grossAnnualCents,
    taxMonthlyCents: Math.round(taxAnnualCents / 12),
    taxAnnualCents,
  };
}

/**
 * Is the job earning during the given "YYYY-MM" month? A paused job never earns;
 * otherwise the month must fall inside the [startDate, endDate] window (compared
 * at month granularity). Missing bounds mean open-ended on that side.
 */
export function jobActiveInMonth(job: IncomeJob, month: string): boolean {
  if (job.active === false) return false;
  const start = job.startDate ? job.startDate.slice(0, 7) : null;
  const end = job.endDate ? job.endDate.slice(0, 7) : null;
  if (start && month < start) return false;
  if (end && month > end) return false;
  return true;
}

/** Combined monthly income from all jobs active in the given "YYYY-MM" month. */
export function jobIncomeForMonth(jobs: IncomeJob[], month: string): number {
  let totalCents = 0;
  for (const j of jobs) {
    if (jobActiveInMonth(j, month)) totalCents += monthlyIncomeCents(j);
  }
  return totalCents;
}

/**
 * Job-sourced income for each of the 12 months of a calendar year. A job
 * contributes its normalized monthly pay to every month its active window
 * covers — the dashboard's income bars come from here, not from transactions.
 */
export function jobIncomeByMonthForYear(
  jobs: IncomeJob[],
  year: number,
): { month: string; totalCents: number }[] {
  const out: { month: string; totalCents: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, "0")}`;
    out.push({ month, totalCents: jobIncomeForMonth(jobs, month) });
  }
  return out;
}

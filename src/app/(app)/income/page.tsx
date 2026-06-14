import { getJobs, getSettings } from "@/lib/queries";
import { incomeTotals } from "@/lib/income";
import { dateToYMD } from "@/lib/dates";
import { IncomeView, type JobDTO } from "@/components/income-view";

export default async function IncomePage() {
  const [jobs, settings] = await Promise.all([getJobs(), getSettings()]);
  const dtos: JobDTO[] = jobs.map((j) => ({
    id: j.id,
    name: j.name,
    employer: j.employer,
    payCents: j.payCents,
    cadence: j.cadence,
    hoursPerWeek: j.hoursPerWeek,
    startDate: j.startDate ? dateToYMD(j.startDate) : null,
    endDate: j.endDate ? dateToYMD(j.endDate) : null,
    active: j.active,
  }));
  const totals = incomeTotals(dtos);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Income</h1>
        <p className="text-sm text-muted-foreground">
          Your jobs and what each brings in. Totals normalize every pay schedule
          to a monthly and annual figure.
        </p>
      </div>
      <IncomeView
        jobs={dtos}
        monthlyCents={totals.monthlyCents}
        annualCents={totals.annualCents}
      />
    </div>
  );
}

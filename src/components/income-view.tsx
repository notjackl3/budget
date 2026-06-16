"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useMoney, useCurrencySymbol } from "@/components/currency-provider";
import { createJob, updateJob, deleteJob } from "@/app/actions";
import { PAY_CADENCES, monthlyIncomeCents, annualizeCents } from "@/lib/income";
import { resolveTriad, type TaxField } from "@/lib/tax";
import { centsToDecimalString } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface JobDTO {
  id: string;
  name: string;
  employer: string | null;
  payCents: number; // net / take-home
  grossCents: number | null; // optional gross (pre-tax)
  cadence: string;
  hoursPerWeek: number | null;
  startDate: string | null; // "YYYY-MM-DD"
  endDate: string | null; // "YYYY-MM-DD"
  active: boolean;
}

// ------- small shared pieces so the job cards stay visually consistent -------

/** A labelled form cell with the uppercase micro-label used across the page. */
function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** Money input with the leading currency symbol. */
function MoneyInput({
  value,
  symbol,
  onChange,
  onBlur,
}: {
  value: string;
  symbol: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        {symbol}
      </span>
      <Input
        inputMode="decimal"
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        className="h-9 pl-7 text-right tabular"
      />
    </div>
  );
}

/** Compact stat shown in a card footer: tiny label over a tabular value. */
function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="text-right">
      <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "tabular leading-tight",
          emphasis
            ? "text-lg font-semibold text-foreground"
            : "text-sm font-medium text-muted-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function IncomeView({
  jobs,
  monthlyCents,
  annualCents,
  grossMonthlyCents,
  grossAnnualCents,
  taxMonthlyCents,
  taxAnnualCents,
}: {
  jobs: JobDTO[];
  monthlyCents: number;
  annualCents: number;
  grossMonthlyCents: number;
  grossAnnualCents: number;
  taxMonthlyCents: number;
  taxAnnualCents: number;
}) {
  const money = useMoney();
  const hasTax = taxAnnualCents > 0;

  return (
    <div className="space-y-6">
      {/* Totals */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Expected income</CardTitle>
          <span className="text-xs text-muted-foreground">
            active jobs only
          </span>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Net per month
              </p>
              <p className="tabular text-3xl font-semibold">
                {money(monthlyCents)}
              </p>
              <p className="tabular text-sm text-muted-foreground">
                {money(annualCents)} / yr
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Gross per month
              </p>
              <p className="tabular text-2xl font-medium text-muted-foreground">
                {money(grossMonthlyCents)}
              </p>
              <p className="tabular text-sm text-muted-foreground">
                {money(grossAnnualCents)} / yr
              </p>
            </div>
            {hasTax && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Tax
                </p>
                <p className="tabular text-2xl font-medium text-muted-foreground">
                  {money(taxMonthlyCents)}
                </p>
                <p className="tabular text-sm text-muted-foreground">
                  {money(taxAnnualCents)} / yr ·{" "}
                  {((taxAnnualCents / grossAnnualCents) * 100).toFixed(1)}%
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Jobs */}
      <Card>
        <CardHeader>
          <CardTitle>Jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No jobs yet. Add one below.
            </p>
          ) : (
            <div className="space-y-3">
              {jobs.map((j) => (
                <JobRow key={j.id} job={j} />
              ))}
            </div>
          )}
          <AddJob />
        </CardContent>
      </Card>
    </div>
  );
}

function JobRow({ job }: { job: JobDTO }) {
  const router = useRouter();
  const { toast } = useToast();
  const money = useMoney();
  const symbol = useCurrencySymbol();

  const [name, setName] = React.useState(job.name);
  const [employer, setEmployer] = React.useState(job.employer ?? "");
  const [gross, setGross] = React.useState(
    job.grossCents != null ? centsToDecimalString(job.grossCents) : "",
  );
  const [net, setNet] = React.useState(centsToDecimalString(job.payCents));
  const [tax, setTax] = React.useState(
    job.grossCents != null && job.grossCents > job.payCents
      ? centsToDecimalString(job.grossCents - job.payCents)
      : "",
  );
  // Which fields the user touched most recently (first = newest). Seeds with the
  // pair we loaded so an untouched row keeps its stored net/gross.
  const [priority, setPriority] = React.useState<TaxField[]>(
    job.grossCents != null ? ["net", "gross"] : ["net"],
  );
  const [cadence, setCadence] = React.useState(job.cadence);
  const [hours, setHours] = React.useState(
    job.hoursPerWeek != null ? String(job.hoursPerWeek) : "",
  );
  const [startDate, setStartDate] = React.useState(job.startDate ?? "");
  const [endDate, setEndDate] = React.useState(job.endDate ?? "");
  const [active, setActive] = React.useState(job.active);

  const hoursNum = hours === "" ? null : parseFloat(hours);
  const triad = resolveTriad(gross, net, tax, priority);
  const { netCents, grossCents, taxCents } = triad;
  const monthly = monthlyIncomeCents({
    payCents: netCents,
    cadence,
    hoursPerWeek: hoursNum,
  });
  const monthlyGross =
    grossCents != null
      ? Math.round(annualizeCents(grossCents, cadence, hoursNum) / 12)
      : 0;
  const monthlyTax = Math.round(
    annualizeCents(taxCents, cadence, hoursNum) / 12,
  );
  const effRate = grossCents && grossCents > 0 ? taxCents / grossCents : 0;

  async function persist(patch: Parameters<typeof updateJob>[1]) {
    try {
      await updateJob(job.id, patch);
      router.refresh();
    } catch {
      toast({ title: "Could not save", variant: "error" });
    }
  }

  // Commit after editing one of Gross/Net/Tax: mark it most-recently-edited,
  // recompute the derived field, reflect all three, and persist (net, gross?).
  function commitTriad(edited: TaxField) {
    const nextPriority = [edited, ...priority.filter((f) => f !== edited)];
    const r = resolveTriad(gross, net, tax, nextPriority);
    setPriority(nextPriority);
    setGross(r.gross);
    setNet(r.net);
    setTax(r.tax);
    persist({
      pay: (r.netCents / 100).toFixed(2),
      gross: r.grossCents != null ? (r.grossCents / 100).toFixed(2) : null,
    });
  }

  async function remove() {
    try {
      await deleteJob(job.id);
      router.refresh();
      toast({ title: "Job removed", variant: "success" });
    } catch {
      toast({ title: "Could not remove", variant: "error" });
    }
  }

  return (
    <div
      className={cn(
        "glass rounded-2xl p-4 transition-opacity",
        !active && "opacity-60",
      )}
    >
      {/* Identity + status */}
      <div className="flex items-start gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <Field label="Job">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() =>
                name.trim() && name !== job.name && persist({ name })
              }
              placeholder="e.g. Barista"
              className="h-9 font-medium"
            />
          </Field>
          <Field label="Employer">
            <Input
              value={employer}
              onChange={(e) => setEmployer(e.target.value)}
              onBlur={() =>
                employer !== (job.employer ?? "") && persist({ employer })
              }
              placeholder="optional"
              className="h-9"
            />
          </Field>
        </div>
        <div className="flex shrink-0 items-center gap-1 pt-[1.6rem]">
          <label className="flex cursor-pointer items-center gap-2 rounded-full px-1 text-xs font-medium text-muted-foreground">
            <Switch
              checked={active}
              onCheckedChange={(v) => {
                setActive(v);
                persist({ active: v });
              }}
            />
            <span className="hidden sm:inline">
              {active ? "Active" : "Paused"}
            </span>
          </label>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-destructive"
            onClick={remove}
            aria-label={`Remove ${job.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Compensation + schedule */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Field label="Gross">
          <MoneyInput
            value={gross}
            symbol={symbol}
            onChange={(e) => setGross(e.target.value)}
            onBlur={() => commitTriad("gross")}
          />
        </Field>
        <Field label="Net">
          <MoneyInput
            value={net}
            symbol={symbol}
            onChange={(e) => setNet(e.target.value)}
            onBlur={() => commitTriad("net")}
          />
        </Field>
        <Field label="Tax">
          <MoneyInput
            value={tax}
            symbol={symbol}
            onChange={(e) => setTax(e.target.value)}
            onBlur={() => commitTriad("tax")}
          />
        </Field>
        <Field label="Frequency">
          <Select
            value={cadence}
            onValueChange={(v) => {
              setCadence(v);
              persist({ cadence: v });
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAY_CADENCES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {cadence === "hourly" && (
          <Field label="Hrs/week">
            <Input
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              onBlur={() => persist({ hoursPerWeek: hours })}
              className="h-9 text-right tabular"
            />
          </Field>
        )}
        <Field label="Started">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            onBlur={() =>
              startDate !== (job.startDate ?? "") &&
              persist({ startDate: startDate || null })
            }
            className="h-9 text-xs"
          />
        </Field>
        <Field label="Ended">
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            onBlur={() =>
              endDate !== (job.endDate ?? "") &&
              persist({ endDate: endDate || null })
            }
            className="h-9 text-xs"
          />
        </Field>
      </div>

      {/* Results */}
      <div className="mt-4 flex flex-wrap items-end justify-end gap-x-8 gap-y-2 border-t border-border/60 pt-3">
        {grossCents != null && grossCents > 0 && (
          <Stat label="Gross / mo" value={money(monthlyGross)} />
        )}
        {taxCents > 0 && (
          <Stat
            label={`Tax · ${(effRate * 100).toFixed(1)}%`}
            value={money(monthlyTax)}
          />
        )}
        <Stat label="Net / mo" value={money(monthly)} emphasis />
      </div>
    </div>
  );
}

function AddJob() {
  const router = useRouter();
  const { toast } = useToast();
  const symbol = useCurrencySymbol();
  const [name, setName] = React.useState("");
  const [employer, setEmployer] = React.useState("");
  const [gross, setGross] = React.useState("");
  const [net, setNet] = React.useState("");
  const [tax, setTax] = React.useState("");
  const [cadence, setCadence] = React.useState("monthly");
  const [hours, setHours] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Fill any two of Gross/Net/Tax; whichever two are present win.
  const triad = resolveTriad(gross, net, tax, ["gross", "net", "tax"]);

  async function add() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createJob({
        name: name.trim(),
        employer: employer.trim() || null,
        pay: (triad.netCents / 100).toFixed(2),
        gross:
          triad.grossCents != null
            ? (triad.grossCents / 100).toFixed(2)
            : null,
        cadence,
        hoursPerWeek: cadence === "hourly" ? hours : null,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      setName("");
      setEmployer("");
      setGross("");
      setNet("");
      setTax("");
      setHours("");
      setCadence("monthly");
      setStartDate("");
      setEndDate("");
      router.refresh();
      toast({ title: "Job added", variant: "success" });
    } catch (e) {
      toast({
        title: "Could not add job",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-border/70 p-4">
      <p className="mb-3 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
        Add a job
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Job title">
          <Input
            id="newjob"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="e.g. Software Engineer"
            className="h-9 font-medium"
          />
        </Field>
        <Field label="Employer">
          <Input
            value={employer}
            onChange={(e) => setEmployer(e.target.value)}
            placeholder="optional"
            className="h-9"
          />
        </Field>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Field label="Gross">
          <MoneyInput
            value={gross}
            symbol={symbol}
            onChange={(e) => setGross(e.target.value)}
          />
        </Field>
        <Field label="Net">
          <MoneyInput
            value={net}
            symbol={symbol}
            onChange={(e) => setNet(e.target.value)}
          />
        </Field>
        <Field label="Tax">
          <MoneyInput
            value={tax}
            symbol={symbol}
            onChange={(e) => setTax(e.target.value)}
          />
        </Field>
        <Field label="Frequency">
          <Select value={cadence} onValueChange={setCadence}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAY_CADENCES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {cadence === "hourly" && (
          <Field label="Hrs/week">
            <Input
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="h-9 text-right tabular"
            />
          </Field>
        )}
        <Field label="Started">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-9 text-xs"
          />
        </Field>
        <Field label="Ended">
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-9 text-xs"
          />
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={add} disabled={saving || !name.trim()}>
          <Plus className="h-4 w-4" /> Add job
        </Button>
      </div>
    </div>
  );
}

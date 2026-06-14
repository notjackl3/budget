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
import { PAY_CADENCES, monthlyIncomeCents } from "@/lib/income";
import { centsToDecimalString, dollarsToCents } from "@/lib/money";

export interface JobDTO {
  id: string;
  name: string;
  employer: string | null;
  payCents: number;
  cadence: string;
  hoursPerWeek: number | null;
  active: boolean;
}

export function IncomeView({
  jobs,
  monthlyCents,
  annualCents,
}: {
  jobs: JobDTO[];
  monthlyCents: number;
  annualCents: number;
}) {
  const money = useMoney();

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
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Per month
              </p>
              <p className="tabular text-3xl font-semibold">
                {money(monthlyCents)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Per year
              </p>
              <p className="tabular text-xl font-medium text-muted-foreground">
                {money(annualCents)}
              </p>
            </div>
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
  const [pay, setPay] = React.useState(centsToDecimalString(job.payCents));
  const [cadence, setCadence] = React.useState(job.cadence);
  const [hours, setHours] = React.useState(
    job.hoursPerWeek != null ? String(job.hoursPerWeek) : "",
  );
  const [active, setActive] = React.useState(job.active);

  // Live monthly figure for this row from the current inputs.
  const monthly = monthlyIncomeCents({
    payCents: dollarsToCents(pay),
    cadence,
    hoursPerWeek: hours === "" ? null : parseFloat(hours),
  });

  async function persist(patch: Parameters<typeof updateJob>[1]) {
    try {
      await updateJob(job.id, patch);
      router.refresh();
    } catch {
      toast({ title: "Could not save", variant: "error" });
    }
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
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[8rem] flex-1 space-y-1">
          <Label className="text-xs">Job</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== job.name && persist({ name })}
            placeholder="e.g. Barista"
            className="h-8"
          />
        </div>
        <div className="min-w-[8rem] flex-1 space-y-1">
          <Label className="text-xs">Employer</Label>
          <Input
            value={employer}
            onChange={(e) => setEmployer(e.target.value)}
            onBlur={() =>
              employer !== (job.employer ?? "") && persist({ employer })
            }
            placeholder="optional"
            className="h-8"
          />
        </div>
        <div className="w-28 space-y-1">
          <Label className="text-xs">Pay</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {symbol}
            </span>
            <Input
              inputMode="decimal"
              value={pay}
              onChange={(e) => setPay(e.target.value)}
              onBlur={() =>
                dollarsToCents(pay) !== job.payCents && persist({ pay })
              }
              className="h-8 pl-7 text-right tabular"
            />
          </div>
        </div>
        <div className="w-36 space-y-1">
          <Label className="text-xs">Frequency</Label>
          <Select
            value={cadence}
            onValueChange={(v) => {
              setCadence(v);
              persist({ cadence: v });
            }}
          >
            <SelectTrigger className="h-8">
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
        </div>
        {cadence === "hourly" && (
          <div className="w-24 space-y-1">
            <Label className="text-xs">Hrs/week</Label>
            <Input
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              onBlur={() => persist({ hoursPerWeek: hours })}
              className="h-8 text-right tabular"
            />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between border-t pt-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Switch
            checked={active}
            onCheckedChange={(v) => {
              setActive(v);
              persist({ active: v });
            }}
          />
          {active ? "Active" : "Paused"}
        </label>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            <span className="tabular font-medium text-foreground">
              {money(monthly)}
            </span>{" "}
            / mo
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={remove}
            aria-label={`Remove ${job.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
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
  const [pay, setPay] = React.useState("");
  const [cadence, setCadence] = React.useState("monthly");
  const [hours, setHours] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function add() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createJob({
        name: name.trim(),
        employer: employer.trim() || null,
        pay: pay || 0,
        cadence,
        hoursPerWeek: cadence === "hourly" ? hours : null,
      });
      setName("");
      setEmployer("");
      setPay("");
      setHours("");
      setCadence("monthly");
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
    <div className="flex flex-wrap items-end gap-2 border-t pt-4">
      <div className="min-w-[8rem] flex-1 space-y-1">
        <Label htmlFor="newjob" className="text-xs">
          New job
        </Label>
        <Input
          id="newjob"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="e.g. Software Engineer"
          className="h-9"
        />
      </div>
      <div className="w-32 space-y-1">
        <Label className="text-xs">Employer</Label>
        <Input
          value={employer}
          onChange={(e) => setEmployer(e.target.value)}
          placeholder="optional"
          className="h-9"
        />
      </div>
      <div className="w-24 space-y-1">
        <Label className="text-xs">Pay</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {symbol}
          </span>
          <Input
            inputMode="decimal"
            value={pay}
            onChange={(e) => setPay(e.target.value)}
            className="h-9 pl-7 text-right tabular"
          />
        </div>
      </div>
      <div className="w-36 space-y-1">
        <Label className="text-xs">Frequency</Label>
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
      </div>
      {cadence === "hourly" && (
        <div className="w-20 space-y-1">
          <Label className="text-xs">Hrs/wk</Label>
          <Input
            inputMode="decimal"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="h-9 text-right tabular"
          />
        </div>
      )}
      <Button onClick={add} disabled={saving || !name.trim()}>
        <Plus className="h-4 w-4" /> Add
      </Button>
    </div>
  );
}

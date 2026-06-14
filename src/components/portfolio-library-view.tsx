"use client";

import * as React from "react";
import { TrendingUp, Sparkles, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMoney } from "@/components/currency-provider";
import { ProjectionChart } from "@/components/charts/projection-chart";
import { projectScenarios, scenarioReturns, type ScenarioKey } from "@/lib/projection";
import {
  PROFILES,
  ASSET_CLASS_BY_ID,
  blendProfile,
  type Region,
  type PortfolioProfile,
} from "@/lib/portfolio-library";
import { dollarsToCents } from "@/lib/money";
import { cn } from "@/lib/utils";

const HORIZONS = [5, 10, 15, 20, 30];
type Cadence = "week" | "month" | "year";
const CADENCES: { value: Cadence; label: string }[] = [
  { value: "week", label: "per week" },
  { value: "month", label: "per month" },
  { value: "year", label: "per year" },
];

const SCENARIOS: { key: ScenarioKey; label: string }[] = [
  { key: "worst", label: "Worst" },
  { key: "average", label: "Average" },
  { key: "best", label: "Best" },
];

const RISK_STYLES: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  high: "bg-red-500/10 text-red-600 dark:text-red-400",
};

function fmtPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

/** Convert a contribution at a given cadence into an equivalent monthly amount. */
function toMonthlyCents(amountCents: number, cadence: Cadence): number {
  if (cadence === "week") return Math.round((amountCents * 52) / 12);
  if (cadence === "year") return Math.round(amountCents / 12);
  return amountCents;
}

export function PortfolioLibraryView({ base }: { base: string }) {
  const money = useMoney();

  const [profileId, setProfileId] = React.useState(PROFILES[0].id);
  const [region, setRegion] = React.useState<Region>("ca");
  const [horizon, setHorizon] = React.useState(20);
  const [activeScenario, setActiveScenario] = React.useState<ScenarioKey>("average");

  const [lumpText, setLumpText] = React.useState("10000");
  const [contribText, setContribText] = React.useState("500");
  const [cadence, setCadence] = React.useState<Cadence>("month");

  // Which ETF the user picked to represent each asset class (per region).
  const [picks, setPicks] = React.useState<Record<string, string>>({});

  const profile = React.useMemo(
    () => PROFILES.find((p) => p.id === profileId) ?? PROFILES[0],
    [profileId],
  );

  const blended = React.useMemo(
    () => blendProfile(profile.allocations),
    [profile],
  );

  const startCents = dollarsToCents(lumpText);
  const monthlyContributionCents = toMonthlyCents(dollarsToCents(contribText), cadence);

  const projection = React.useMemo(() => {
    if (!blended) return null;
    return projectScenarios({
      startCents,
      monthlyContributionCents,
      stats: blended,
      years: horizon,
    });
  }, [blended, startCents, monthlyContributionCents, horizon]);

  const returns = blended ? scenarioReturns(blended) : null;
  const end = projection?.[projection.length - 1];

  // The ETF chosen for a class — defaults to the first in the active region's list.
  function etfFor(classId: string): string {
    const cls = ASSET_CLASS_BY_ID[classId];
    const list = region === "ca" ? cls.caEtfs : cls.usEtfs;
    const key = `${classId}:${region}`;
    return picks[key] ?? list[0]?.symbol ?? "";
  }

  // Total invested over the horizon (lump + all contributions), for context.
  const totalInvested = startCents + monthlyContributionCents * horizon * 12;

  return (
    <div className="space-y-6">
      {/* Profile picker */}
      <Card>
        <CardHeader>
          <CardTitle>Pick a strategy</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Each profile is a research-based mix of asset classes. Select one to see
            how it&apos;s built and how it might grow.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PROFILES.map((p) => (
              <ProfileButton
                key={p.id}
                profile={p}
                active={p.id === profileId}
                onClick={() => setProfileId(p.id)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Selected profile breakdown */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              {profile.name}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                  RISK_STYLES[profile.risk],
                )}
              >
                {profile.risk} risk
              </span>
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{profile.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">{profile.suits}</p>
          </div>
          {/* Region toggle */}
          <div className="flex shrink-0 overflow-hidden rounded-lg border text-xs">
            {(["ca", "us"] as Region[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRegion(r)}
                className={cn(
                  "px-2.5 py-1 font-medium transition-colors",
                  region === r
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r === "ca" ? "🇨🇦 Canada" : "🇺🇸 US"}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {[...profile.allocations]
            .sort((a, b) => b.percent - a.percent)
            .map((a) => {
              const cls = ASSET_CLASS_BY_ID[a.classId];
              const list = region === "ca" ? cls.caEtfs : cls.usEtfs;
              return (
                <div key={a.classId} className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: cls.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{cls.label}</span>
                      <span className="tabular shrink-0 text-sm text-muted-foreground">
                        {a.percent}%
                      </span>
                    </div>
                    {/* percent bar */}
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${a.percent}%`, background: cls.color }}
                      />
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {fmtPct(cls.cagr)}/yr · ±{(cls.vol * 100).toFixed(0)}% vol
                    </p>
                  </div>
                  {/* ETF dropdown */}
                  <Select
                    value={etfFor(a.classId)}
                    onValueChange={(v) =>
                      setPicks((prev) => ({ ...prev, [`${a.classId}:${region}`]: v }))
                    }
                  >
                    <SelectTrigger className="h-8 w-32 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {list.map((e) => (
                        <SelectItem key={e.symbol} value={e.symbol}>
                          <span className="font-medium">{e.symbol}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}

          {blended && (
            <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">Blended expected return</span>
              <span className="tabular font-semibold text-primary">
                {fmtPct(blended.annualReturn)}/yr · ±{(blended.annualVol * 100).toFixed(0)}% vol
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inputs */}
      <Card>
        <CardHeader>
          <CardTitle>Your investment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label className="text-xs text-muted-foreground">Starting amount</Label>
              <div className="relative mt-1">
                <Input
                  inputMode="decimal"
                  value={lumpText}
                  onChange={(e) => setLumpText(e.target.value)}
                  className="h-9 pl-6 tabular"
                />
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Contribution</Label>
              <div className="relative mt-1">
                <Input
                  inputMode="decimal"
                  value={contribText}
                  onChange={(e) => setContribText(e.target.value)}
                  className="h-9 pl-6 tabular"
                />
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">How often</Label>
              <Select value={cadence} onValueChange={(v) => setCadence(v as Cadence)}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CADENCES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Projection */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Projection
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {money(startCents)} to start
              {monthlyContributionCents > 0 &&
                ` + ${money(dollarsToCents(contribText))} ${cadence === "week" ? "/wk" : cadence === "year" ? "/yr" : "/mo"}`}
              .
            </p>
          </div>
          <Select value={String(horizon)} onValueChange={(v) => setHorizon(Number(v))}>
            <SelectTrigger className="h-8 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HORIZONS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y} years
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-4">
          {!projection || !returns || !end ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              <Sparkles className="mx-auto mb-2 h-5 w-5 opacity-50" />
              Enter a starting amount to see the projection.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                {SCENARIOS.map((s) => {
                  const value =
                    s.key === "best"
                      ? end.bestCents
                      : s.key === "worst"
                        ? end.worstCents
                        : end.averageCents;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setActiveScenario(s.key)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-colors",
                        activeScenario === s.key
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/40",
                      )}
                    >
                      <p className="text-xs text-muted-foreground">
                        {s.label} · {fmtPct(returns[s.key])}/yr
                      </p>
                      <p className="tabular text-lg font-semibold">{money(value)}</p>
                    </button>
                  );
                })}
              </div>
              <ProjectionChart data={projection} />
              <p className="text-center text-xs text-muted-foreground">
                In {horizon} years, around{" "}
                <span className="font-medium text-foreground">
                  {money(end.averageCents)}
                </span>{" "}
                on average from {money(totalInvested)} invested. All values in {base};
                the band spans worst→best (±1 std dev of historical returns).
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        These are long-run historical estimates (nominal, before inflation and fees),
        compiled from public sources for illustration only. Past performance does not
        guarantee future results — this is not investment advice.
      </p>
    </div>
  );
}

function ProfileButton({
  profile,
  active,
  onClick,
}: {
  profile: PortfolioProfile;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border p-3 text-left transition-all duration-200 ease-glass",
        active
          ? "glass glass-active border-primary"
          : "hover:-translate-y-px hover:bg-muted/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{profile.name}</span>
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize",
            RISK_STYLES[profile.risk],
          )}
        >
          {profile.risk}
        </span>
      </div>
    </button>
  );
}

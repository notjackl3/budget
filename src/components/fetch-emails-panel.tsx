"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckSquare,
  CircleAlert,
  DollarSign,
  Mail,
  RotateCw,
  Sparkles,
  Square,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useMoney } from "@/components/currency-provider";
import {
  fetchEmailCandidatesAction,
  parseEmailCandidatesAction,
  ingestApprovedReceiptsAction,
} from "@/app/actions";
import type { EmailCandidate } from "@/lib/gmail";
import type { RawTxn } from "@/lib/ingest";

const RANGES = [
  { value: "sync", label: "Since last sync" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last year" },
];

type Mode = "idle" | "picking" | "reviewing";

interface ReviewRow {
  id: string;
  selected: boolean;
  date: string;
  description: string;
  amountDollars: string;
  unparsed: boolean;
  subject: string;
  sender: string;
}

/** Three-step picker:
 *   1. Fetch a batch of recent emails (cheap keyword flag, no LLM).
 *   2. User picks which to keep — LLM only runs on those.
 *   3. Edit & approve before anything is written.
 *
 * Visual language matches the rest of the app: liquid-glass surfaces, eyebrow
 * labels, tabular money figures, violet thread reserved for the primary CTA
 * and the active-step pill.
 */
export function FetchEmailsPanel() {
  const router = useRouter();
  const { toast } = useToast();
  const money = useMoney();
  const [mode, setMode] = React.useState<Mode>("idle");
  const [range, setRange] = React.useState("sync");
  const [busy, setBusy] = React.useState(false);
  const [candidates, setCandidates] = React.useState<EmailCandidate[]>([]);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [rows, setRows] = React.useState<ReviewRow[]>([]);

  function reset() {
    setMode("idle");
    setCandidates([]);
    setPicked(new Set());
    setRows([]);
  }

  async function doFetch() {
    setBusy(true);
    try {
      const daysBack = range === "sync" ? undefined : Number(range);
      const list = await fetchEmailCandidatesAction(daysBack);
      setCandidates(list);
      setPicked(new Set(list.filter((c) => c.hasMoneyHint).map((c) => c.id)));
      setMode("picking");
      if (list.length === 0) {
        toast({ title: "No emails in that window", variant: "default" });
      }
    } catch (err) {
      toast({
        title: "Fetch failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function doParse() {
    const selected = candidates.filter((c) => picked.has(c.id));
    if (selected.length === 0) {
      toast({ title: "Pick at least one email first", variant: "default" });
      return;
    }
    setBusy(true);
    try {
      const results = await parseEmailCandidatesAction(selected);
      const built: ReviewRow[] = results.map(({ id, parsed, raw }) => {
        const cents = parsed?.amountCents ?? 0;
        return {
          id,
          selected: parsed != null,
          date: parsed?.date ?? raw.receivedAt.slice(0, 10),
          description: parsed?.description ?? "",
          amountDollars: cents === 0 ? "" : (cents / 100).toFixed(2),
          unparsed: parsed == null,
          subject: raw.subject,
          sender: raw.sender,
        };
      });
      setRows(built);
      setMode("reviewing");
    } catch (err) {
      toast({
        title: "Parse failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function doSave() {
    const approved = rows.filter((r) => r.selected);
    const items: RawTxn[] = [];
    for (const r of approved) {
      const desc = r.description.trim();
      if (!desc) continue;
      const dollars = Number(r.amountDollars);
      if (!Number.isFinite(dollars) || dollars === 0) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
      items.push({
        date: r.date,
        description: desc,
        amountCents: Math.round(dollars * 100),
      });
    }
    if (items.length === 0) {
      toast({
        title: "Nothing to save",
        description: "Each row needs a date, description, and non-zero amount.",
        variant: "error",
      });
      return;
    }
    setBusy(true);
    try {
      const r = await ingestApprovedReceiptsAction(items);
      toast({
        title: r.created.length
          ? `Added ${r.created.length} transaction${r.created.length === 1 ? "" : "s"}`
          : "No new transactions",
        description: r.duplicates.length
          ? `${r.duplicates.length} already existed.`
          : undefined,
        variant: "success",
      });
      reset();
      router.refresh();
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  // Pre-derive a few counts for the header subline.
  const pickedCount = picked.size;
  const moneyHinted = candidates.filter((c) => c.hasMoneyHint).length;
  const selectedRowCount = rows.filter((r) => r.selected).length;
  const unparsedRowCount = rows.filter((r) => r.unparsed).length;

  return (
    <Card className="glass-strong overflow-hidden border-0">
      <CardContent className="space-y-5 p-5">
        {/* ─── Header ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Mail className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-muted-foreground">Email</p>
            <h3 className="mt-0.5 text-base font-semibold tracking-tight">
              {mode === "idle" && "Check email for new transactions"}
              {mode === "picking" && "Pick emails to import"}
              {mode === "reviewing" && "Review and save"}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {mode === "idle" &&
                "Fetch your recent inbox, pick which receipts to import, then review before saving."}
              {mode === "picking" && (
                <>
                  <span className="tabular font-medium text-foreground">{pickedCount}</span>{" "}
                  of <span className="tabular">{candidates.length}</span> selected ·{" "}
                  <span className="tabular">{moneyHinted}</span> look like receipts
                </>
              )}
              {mode === "reviewing" && (
                <>
                  <span className="tabular font-medium text-foreground">{selectedRowCount}</span>{" "}
                  ready to save
                  {unparsedRowCount > 0 && (
                    <>
                      {" · "}
                      <span className="text-amber-600 dark:text-amber-400">
                        {unparsedRowCount} need a manual edit
                      </span>
                    </>
                  )}
                </>
              )}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {mode === "idle" && (
              <>
                <Select value={range} onValueChange={setRange}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RANGES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={doFetch} disabled={busy}>
                  <RotateCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                  {busy ? "Fetching…" : "Fetch"}
                </Button>
              </>
            )}
            {mode === "picking" && (
              <>
                <Button variant="ghost" onClick={reset} disabled={busy}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button onClick={doParse} disabled={busy || pickedCount === 0}>
                  <Sparkles className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                  {busy ? "Parsing…" : `Parse ${pickedCount}`}
                </Button>
              </>
            )}
            {mode === "reviewing" && (
              <>
                <Button variant="ghost" onClick={() => setMode("picking")} disabled={busy}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button onClick={doSave} disabled={busy}>
                  <Check className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                  {busy ? "Saving…" : `Save ${selectedRowCount}`}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ─── Step 2: candidate picker ────────────────────────────────── */}
        {mode === "picking" && (
          <div className="space-y-3">
            <BulkRow
              total={candidates.length}
              selected={pickedCount}
              moneyHinted={moneyHinted}
              onAll={() => setPicked(new Set(candidates.map((c) => c.id)))}
              onHinted={() =>
                setPicked(
                  new Set(candidates.filter((c) => c.hasMoneyHint).map((c) => c.id)),
                )
              }
              onNone={() => setPicked(new Set())}
            />
            {candidates.length === 0 ? (
              <EmptyState
                icon={<Mail className="h-5 w-5" />}
                title="No emails in this window"
                hint="Try a wider range, or check that Gmail is still connected in Settings."
              />
            ) : (
              <div className="space-y-1.5">
                {candidates.map((c) => (
                  <CandidateRow
                    key={c.id}
                    candidate={c}
                    checked={picked.has(c.id)}
                    onToggle={(checked) =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(c.id);
                        else next.delete(c.id);
                        return next;
                      })
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Step 3: edit & approve ──────────────────────────────────── */}
        {mode === "reviewing" && (
          <div className="space-y-3">
            {/* Column header — keeps the editor scannable. */}
            <div className="hidden gap-2 px-3 sm:flex">
              <span className="w-5" />
              <span className="eyebrow w-[150px] text-muted-foreground">Date</span>
              <span className="eyebrow flex-1 text-muted-foreground">Description</span>
              <span className="eyebrow w-[110px] text-right text-muted-foreground">
                Amount
              </span>
              <span className="w-[90px]" />
            </div>
            {rows.length === 0 ? (
              <EmptyState
                icon={<CircleAlert className="h-5 w-5" />}
                title="Nothing parsed"
                hint="The parser couldn't pull a transaction from any of those emails. Try picking different ones."
              />
            ) : (
              <div className="space-y-1.5">
                {rows.map((r, idx) => (
                  <ReviewRowItem
                    key={r.id}
                    row={r}
                    money={money}
                    onChange={(patch) =>
                      setRows((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)),
                      )
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Subcomponents ───────────────────────────────────────────────────── */

function BulkRow({
  total,
  selected,
  moneyHinted,
  onAll,
  onHinted,
  onNone,
}: {
  total: number;
  selected: number;
  moneyHinted: number;
  onAll: () => void;
  onHinted: () => void;
  onNone: () => void;
}) {
  return (
    <div className="glass flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-xs">
      <span className="eyebrow text-muted-foreground">Select</span>
      <button
        type="button"
        onClick={onAll}
        className="rounded-md px-2 py-1 font-medium hover:bg-muted/60"
      >
        All ({total})
      </button>
      <button
        type="button"
        onClick={onHinted}
        className="rounded-md px-2 py-1 font-medium hover:bg-muted/60"
      >
        Only receipts ({moneyHinted})
      </button>
      <button
        type="button"
        onClick={onNone}
        className="rounded-md px-2 py-1 font-medium text-muted-foreground hover:bg-muted/60"
      >
        None
      </button>
      <span className="ml-auto text-muted-foreground">
        <span className="tabular font-medium text-foreground">{selected}</span> selected
      </span>
    </div>
  );
}

function CandidateRow({
  candidate,
  checked,
  onToggle,
}: {
  candidate: EmailCandidate;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <label
      className={
        "glass glass-interactive flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 " +
        (checked ? "glass-active" : "")
      }
    >
      {/* Custom-feel checkbox via icon swap — lighter than a raw <input> on glass */}
      <span className="mt-0.5 shrink-0 text-primary" aria-hidden="true">
        {checked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-muted-foreground" />}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">{candidate.subject}</span>
          {candidate.hasMoneyHint && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <DollarSign className="h-2.5 w-2.5" />
              Receipt
            </span>
          )}
          <span className="tabular ml-auto shrink-0 text-xs text-muted-foreground">
            {candidate.receivedAt.slice(0, 10)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{candidate.sender}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground/70">
          {candidate.snippet}
        </p>
      </div>
    </label>
  );
}

function ReviewRowItem({
  row,
  money,
  onChange,
}: {
  row: ReviewRow;
  money: (cents: number) => string;
  onChange: (patch: Partial<ReviewRow>) => void;
}) {
  const cents =
    row.amountDollars && Number.isFinite(Number(row.amountDollars))
      ? Math.round(Number(row.amountDollars) * 100)
      : null;
  return (
    <div
      className={
        "glass flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 " +
        (row.unparsed ? "border-amber-500/40 bg-amber-500/5" : "") +
        (row.selected && !row.unparsed ? " glass-active" : "")
      }
    >
      <label className="shrink-0 cursor-pointer text-primary">
        {row.selected ? (
          <CheckSquare className="h-4 w-4" />
        ) : (
          <Square className="h-4 w-4 text-muted-foreground" />
        )}
        <input
          type="checkbox"
          className="sr-only"
          checked={row.selected}
          onChange={(e) => onChange({ selected: e.target.checked })}
        />
      </label>
      <Input
        type="date"
        value={row.date}
        onChange={(e) => onChange({ date: e.target.value })}
        className="w-[150px]"
      />
      <Input
        value={row.description}
        placeholder="Merchant"
        onChange={(e) => onChange({ description: e.target.value })}
        className="min-w-0 flex-1"
      />
      <Input
        type="number"
        step="0.01"
        value={row.amountDollars}
        placeholder="0.00"
        onChange={(e) => onChange({ amountDollars: e.target.value })}
        className="tabular w-[110px] text-right"
      />
      <span className="tabular w-[90px] shrink-0 text-right text-sm text-muted-foreground">
        {cents != null && cents !== 0 ? money(cents) : "—"}
      </span>
      <p
        className="basis-full truncate pl-7 text-xs text-muted-foreground/80"
        title={`${row.subject} · ${row.sender}`}
      >
        {row.unparsed && (
          <span className="eyebrow mr-2 text-amber-600 dark:text-amber-400">
            Needs edit
          </span>
        )}
        {row.subject} · {row.sender}
      </p>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="glass-strong flex flex-col items-center gap-2 rounded-2xl py-10 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

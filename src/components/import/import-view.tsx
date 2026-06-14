"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Upload,
  FileText,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useMoney } from "@/components/currency-provider";
import { dollarsToCents } from "@/lib/money";
import { ymdToDate } from "@/lib/dates";
import { NEED_WANT, INCOME_TYPES } from "@/lib/categories";
import { commitImport } from "@/app/actions";
import type { CategoryDTO, PaymentMethodDTO } from "@/lib/types";
import type { PreviewStatement, PreviewRow } from "@/app/api/import/route";

interface EditableRow extends PreviewRow {
  include: boolean;
}
interface EditableStatement extends Omit<PreviewStatement, "rows"> {
  rows: EditableRow[];
  paymentMethodId: string;
}

export function ImportView({
  categories,
  paymentMethods,
}: {
  categories: CategoryDTO[];
  paymentMethods: PaymentMethodDTO[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const money = useMoney();
  const defaultPm =
    paymentMethods.find((p) => /credit/i.test(p.name))?.id ??
    paymentMethods[0]?.id ??
    "none";

  const [uploading, setUploading] = React.useState(false);
  const [committing, setCommitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [statements, setStatements] = React.useState<EditableStatement[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      const editable: EditableStatement[] = (json.statements as PreviewStatement[]).map(
        (s) => ({
          ...s,
          paymentMethodId: defaultPm,
          rows: s.rows.map((r) => ({ ...r, include: !r.isDuplicate })),
        }),
      );
      setStatements(editable);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function updateRow(si: number, ri: number, patch: Partial<EditableRow>) {
    setStatements((prev) => {
      const next = structuredClone(prev);
      next[si].rows[ri] = { ...next[si].rows[ri], ...patch };
      return next;
    });
  }
  function setStatementPm(si: number, pm: string) {
    setStatements((prev) => {
      const next = structuredClone(prev);
      next[si].paymentMethodId = pm;
      return next;
    });
  }
  function toggleAllInStatement(si: number, include: boolean) {
    setStatements((prev) => {
      const next = structuredClone(prev);
      next[si].rows = next[si].rows.map((r) => ({ ...r, include }));
      return next;
    });
  }

  const totals = React.useMemo(() => {
    let rows = 0,
      dupes = 0,
      toImport = 0,
      cents = 0;
    for (const s of statements) {
      for (const r of s.rows) {
        rows++;
        if (r.isDuplicate) dupes++;
        if (r.include) {
          toImport++;
          cents += dollarsToCents(r.amount);
        }
      }
    }
    return { rows, dupes, toImport, cents };
  }, [statements]);

  async function commitAll() {
    setCommitting(true);
    try {
      let created = 0;
      for (const s of statements) {
        const rows = s.rows
          .filter((r) => r.include)
          .map((r) => ({
            date: r.date,
            description: r.description,
            amount: r.amount,
            categoryId: r.categoryId,
            paymentMethodId: s.paymentMethodId === "none" ? null : s.paymentMethodId,
            needWant: r.needWant,
            incomeType: r.incomeType,
          }));
        if (rows.length === 0) continue;
        const res = await commitImport({
          filename: s.filename,
          label: s.label,
          periodStart: s.periodStart,
          periodEnd: s.periodEnd,
          rows,
        });
        created += res.created;
      }
      toast({
        title: `Imported ${created} expense${created === 1 ? "" : "s"}`,
        variant: "success",
      });
      setStatements([]);
      router.refresh();
      router.push("/expenses");
    } catch (e) {
      toast({
        title: "Import failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Dropzone */}
      <label
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-input bg-card/40 px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-accent/30"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={uploading}
        />
        {uploading ? (
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        ) : (
          <Upload className="h-7 w-7 text-muted-foreground" />
        )}
        <p className="mt-3 text-sm font-medium">
          {uploading ? "Reading your statements…" : "Drop PDF statements here, or click to choose"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          One or more CIBC Visa statement PDFs. Nothing is saved until you
          confirm.
        </p>
      </label>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {statements.length > 0 && (
        <>
          {/* Summary + commit bar */}
          <div className="sticky top-14 z-20 flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-sm backdrop-blur">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span className="text-muted-foreground">
                {totals.rows} parsed
              </span>
              {totals.dupes > 0 && (
                <span className="text-amber-600">
                  {totals.dupes} likely duplicate{totals.dupes === 1 ? "" : "s"}
                </span>
              )}
              <span className="font-medium">
                {totals.toImport} to import ·{" "}
                <span className="tabular">{money(totals.cents)}</span>
              </span>
            </div>
            <Button
              className="ml-auto"
              onClick={commitAll}
              disabled={committing || totals.toImport === 0}
            >
              {committing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Import {totals.toImport} expense{totals.toImport === 1 ? "" : "s"}
            </Button>
          </div>

          {statements.map((s, si) => {
            const includedAll = s.rows.every((r) => r.include);
            return (
              <Card key={si}>
                <CardContent className="p-0">
                  <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {s.label ?? s.filename}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.periodStart && s.periodEnd
                          ? `${format(ymdToDate(s.periodStart), "MMM d")} – ${format(ymdToDate(s.periodEnd), "MMM d, yyyy")}`
                          : s.filename}{" "}
                        · {s.rows.length} transactions
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Paid with</span>
                      <Select
                        value={s.paymentMethodId}
                        onValueChange={(v) => setStatementPm(si, v)}
                      >
                        <SelectTrigger className="h-8 w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {paymentMethods.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="w-10 px-3 py-2">
                            <Checkbox
                              checked={includedAll}
                              onCheckedChange={(v) =>
                                toggleAllInStatement(si, Boolean(v))
                              }
                              aria-label="Include all"
                            />
                          </th>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Description</th>
                          <th className="px-3 py-2">Category</th>
                          <th className="px-3 py-2">Need/Want · Type</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.rows.map((r, ri) => (
                          <tr
                            key={ri}
                            className={`border-b last:border-0 ${
                              r.include ? "" : "opacity-50"
                            }`}
                          >
                            <td className="px-3 py-1.5">
                              <Checkbox
                                checked={r.include}
                                onCheckedChange={(v) =>
                                  updateRow(si, ri, { include: Boolean(v) })
                                }
                              />
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 tabular text-muted-foreground">
                              {format(ymdToDate(r.date), "MMM d")}
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {r.description}
                                </span>
                                {r.isDuplicate && (
                                  <Badge variant="want" className="shrink-0">
                                    duplicate
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-1.5">
                              <Select
                                value={r.categoryId ?? "none"}
                                onValueChange={(v) =>
                                  updateRow(si, ri, { categoryId: v === "none" ? null : v })
                                }
                              >
                                <SelectTrigger className="h-8 w-[150px]">
                                  <SelectValue placeholder="Uncategorized" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">
                                    Uncategorized
                                  </SelectItem>
                                  {categories.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-1.5">
                              {r.isIncome ? (
                                <Select
                                  value={r.incomeType ?? "none"}
                                  onValueChange={(v) =>
                                    updateRow(si, ri, {
                                      incomeType: v === "none" ? null : v,
                                    })
                                  }
                                >
                                  <SelectTrigger
                                    className="h-8 w-[120px]"
                                    title="Income type (incoming money, not spending)"
                                  >
                                    <SelectValue placeholder="—" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">—</SelectItem>
                                    {INCOME_TYPES.map((v) => (
                                      <SelectItem key={v} value={v}>
                                        {v}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Select
                                  value={r.needWant ?? "none"}
                                  onValueChange={(v) =>
                                    updateRow(si, ri, { needWant: v === "none" ? null : v })
                                  }
                                >
                                  <SelectTrigger className="h-8 w-[100px]">
                                    <SelectValue placeholder="—" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">—</SelectItem>
                                    {NEED_WANT.map((v) => (
                                      <SelectItem key={v} value={v}>
                                        {v}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <Input
                                value={r.amount}
                                inputMode="decimal"
                                onChange={(e) =>
                                  updateRow(si, ri, { amount: e.target.value })
                                }
                                className="ml-auto h-8 w-24 text-right tabular"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

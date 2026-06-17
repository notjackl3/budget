"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Check, CheckCheck, Search, Trash2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMoney, useCurrencySymbol } from "@/components/currency-provider";
import { useToast } from "@/components/ui/toast";
import {
  updateExpense,
  bulkReviewExpenses,
  deleteExpense,
  bulkExpenseAction,
} from "@/app/actions";
import { NEED_WANT, INCOME_TYPES } from "@/lib/categories";
import { centsToDecimalString, dollarsToCents } from "@/lib/money";
import type { ExpenseDTO, CategoryDTO } from "@/lib/types";

type SortField = "date" | "amount" | "description";

/** Cap the number of cards rendered at once; "Show more" reveals the next page.
 * Keeps the DOM (and hydration) small even with a long review backlog. */
const PAGE_SIZE = 50;

export function ReviewView({
  expenses,
  categories,
}: {
  expenses: ExpenseDTO[];
  categories: CategoryDTO[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const money = useMoney();
  const symbol = useCurrencySymbol();
  const [rows, setRows] = React.useState(expenses);
  const initialCount = expenses.length;
  const done = initialCount - rows.length;

  // Local edits applied optimistically; persisted on review. `effectiveAmount`
  // is a dollar string ("" clears the override).
  type Edit = {
    categoryId?: string;
    needWant?: string;
    incomeType?: string;
    effectiveAmount?: string;
    description?: string;
    date?: string;
  };
  const [edits, setEdits] = React.useState<Record<string, Edit>>({});

  function setEdit(id: string, patch: Edit) {
    setEdits((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  }

  // The cost-override value to persist for a row: undefined = untouched (leave
  // as-is), "" = clear, else the dollar string. Typing back the charged amount
  // clears the override so we don't store a redundant one.
  function pendingEffective(e: ExpenseDTO): string | undefined {
    const edit = edits[e.id];
    if (edit?.effectiveAmount === undefined) return undefined;
    const typed = edit.effectiveAmount.trim();
    if (typed === "" || dollarsToCents(typed) === e.amountCents) return "";
    return typed;
  }

  // Inline description/date edits, returned only when they actually differ
  // (undefined = leave the stored value alone). An empty description is ignored
  // so a row can't lose its label.
  function pendingDescription(e: ExpenseDTO): string | undefined {
    const d = edits[e.id]?.description;
    if (d === undefined) return undefined;
    const trimmed = d.trim();
    if (trimmed === "" || trimmed === e.description) return undefined;
    return trimmed;
  }
  function pendingDate(e: ExpenseDTO): string | undefined {
    const d = edits[e.id]?.date;
    if (d === undefined || d === "" || d === e.date) return undefined;
    return d;
  }

  // Search / filter / sort state — scoped to the still-to-review rows.
  const [query, setQuery] = React.useState("");
  // Deferred so typing in search stays responsive while the list re-filters.
  const deferredQuery = React.useDeferredValue(query);
  const [catFilter, setCatFilter] = React.useState("all");
  const [nwFilter, setNwFilter] = React.useState("all");
  const [sortField, setSortField] = React.useState<SortField>("date");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir(field === "description" ? "asc" : "desc");
    }
  }

  const filtersActive =
    query.trim() !== "" || catFilter !== "all" || nwFilter !== "all";

  function clearFilters() {
    setQuery("");
    setCatFilter("all");
    setNwFilter("all");
  }

  // Apply pending edits so search/filter/sort act on what the user sees.
  const visible = React.useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const out = rows.filter((e) => {
      const edit = edits[e.id] ?? {};
      const catId = edit.categoryId ?? e.categoryId ?? "none";
      const nw = edit.needWant ?? e.needWant ?? "none";
      if (q) {
        const desc = edit.description ?? e.description;
        const hay = `${desc} ${e.categoryName ?? ""} ${e.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (catFilter !== "all" && catId !== catFilter) return false;
      if (nwFilter !== "all" && nw !== nwFilter) return false;
      return true;
    });
    out.sort((a, b) => {
      let cmp = 0;
      if (sortField === "amount")
        cmp = a.effectiveAmountCents - b.effectiveAmountCents;
      else if (sortField === "description")
        cmp = a.description.localeCompare(b.description);
      else cmp = a.date.localeCompare(b.date);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
    // `edits` intentionally included so category/need-want filters react to inline changes.
  }, [rows, edits, deferredQuery, catFilter, nwFilter, sortField, sortDir]);

  // Render only the current page of cards; collapse back to page one when the
  // filtered result set changes.
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  React.useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [deferredQuery, catFilter, nwFilter, sortField, sortDir]);
  const pageRows = React.useMemo(
    () => visible.slice(0, visibleCount),
    [visible, visibleCount],
  );

  /** Permanently delete a single expense from the review list. Optimistic —
   * we drop the row immediately and restore it if the server rejects the
   * delete. No confirm dialog (the toast carries the irreversibility cue),
   * matching the existing /expenses delete UX. */
  async function deleteOne(e: ExpenseDTO) {
    setRows((p) => p.filter((r) => r.id !== e.id));
    setSelected((prev) => {
      if (!prev.has(e.id)) return prev;
      const next = new Set(prev);
      next.delete(e.id);
      return next;
    });
    try {
      await deleteExpense(e.id);
      router.refresh();
      toast({ title: "Expense deleted", variant: "success" });
    } catch {
      toast({ title: "Could not delete", variant: "error" });
      setRows((p) => [e, ...p]);
    }
  }

  async function markReviewed(e: ExpenseDTO) {
    const edit = edits[e.id] ?? {};
    const effectiveAmount = pendingEffective(e);
    const description = pendingDescription(e);
    const date = pendingDate(e);
    setRows((p) => p.filter((r) => r.id !== e.id));
    try {
      await updateExpense(e.id, {
        reviewed: true,
        categoryId: edit.categoryId ?? e.categoryId,
        // Income rows carry an income type instead of a need/want flag.
        ...(e.isIncome
          ? { incomeType: edit.incomeType ?? e.incomeType }
          : { needWant: edit.needWant ?? e.needWant }),
        ...(effectiveAmount !== undefined ? { effectiveAmount } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(date !== undefined ? { date } : {}),
      });
      router.refresh();
    } catch {
      toast({ title: "Could not update", variant: "error" });
      setRows((p) => [e, ...p]); // restore
    }
  }

  // ---- Multi-select ----
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  // Anchor for shift-click range selection (id of the last single click).
  const [anchorId, setAnchorId] = React.useState<string | null>(null);

  // Keep selection scoped to what's currently visible (filters can hide rows).
  const visibleIds = React.useMemo(
    () => new Set(visible.map((e) => e.id)),
    [visible],
  );
  const selectedVisible = React.useMemo(
    () => [...selected].filter((id) => visibleIds.has(id)),
    [selected, visibleIds],
  );
  const allVisibleSelected =
    visible.length > 0 && visible.every((e) => selected.has(e.id));

  // Plain single toggle (also the keyboard/space path). Resets the shift anchor.
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setAnchorId(id);
  }
  // Shift-click: select the whole range from the anchor to the clicked row.
  function selectRangeTo(id: string) {
    const a = anchorId ? visible.findIndex((e) => e.id === anchorId) : -1;
    const b = visible.findIndex((e) => e.id === id);
    if (a === -1 || b === -1) {
      toggleOne(id);
      return;
    }
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const rangeIds = visible.slice(lo, hi + 1).map((e) => e.id);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const rid of rangeIds) next.add(rid);
      return next;
    });
    // Anchor stays put so further shift-clicks keep extending from it.
  }
  function toggleAllVisible() {
    setSelected(() =>
      allVisibleSelected ? new Set() : new Set(visible.map((e) => e.id)),
    );
    setAnchorId(null);
  }

  // Bulk category / need-want write to pending edits (persisted on review).
  function bulkSetCategory(categoryId: string) {
    setEdits((p) => {
      const next = { ...p };
      for (const id of selectedVisible) next[id] = { ...next[id], categoryId };
      return next;
    });
  }
  function bulkSetNeedWant(needWant: string) {
    setEdits((p) => {
      const next = { ...p };
      for (const id of selectedVisible) next[id] = { ...next[id], needWant };
      return next;
    });
  }

  /** Bulk delete every selected row. Same optimistic pattern as deleteOne. */
  async function deleteSelected() {
    const ids = selectedVisible;
    if (ids.length === 0) return;
    const removed = rows.filter((r) => ids.includes(r.id));
    setRows((p) => p.filter((r) => !ids.includes(r.id)));
    setSelected(new Set());
    try {
      await bulkExpenseAction(ids, { type: "delete" });
      router.refresh();
      toast({
        title: `Deleted ${ids.length} expense${ids.length === 1 ? "" : "s"}`,
        variant: "success",
      });
    } catch {
      toast({ title: "Could not delete", variant: "error" });
      setRows((p) => [...removed, ...p]);
    }
  }

  async function reviewSelected() {
    const ids = selectedVisible;
    if (ids.length === 0) return;
    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = ids
      .map((id) => byId.get(id))
      .filter((e): e is ExpenseDTO => Boolean(e))
      .map((e) => {
        const edit = edits[e.id] ?? {};
        const effectiveAmount = pendingEffective(e);
        const description = pendingDescription(e);
        const date = pendingDate(e);
        return {
          id: e.id,
          categoryId: edit.categoryId ?? e.categoryId,
          needWant: e.isIncome ? null : edit.needWant ?? e.needWant,
          ...(e.isIncome
            ? { incomeType: edit.incomeType ?? e.incomeType }
            : {}),
          ...(effectiveAmount !== undefined ? { effectiveAmount } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(date !== undefined ? { date } : {}),
        };
      });
    const removed = rows.filter((r) => ids.includes(r.id));
    setRows((p) => p.filter((r) => !ids.includes(r.id)));
    setSelected(new Set());
    try {
      await bulkReviewExpenses(items);
      router.refresh();
      toast({
        title: `Reviewed ${items.length} expense${items.length === 1 ? "" : "s"}`,
        variant: "success",
      });
    } catch {
      toast({ title: "Could not update", variant: "error" });
      setRows((p) => [...removed, ...p]); // restore
    }
  }

  if (initialCount === 0 || rows.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950">
          <CheckCheck className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold">All caught up</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {initialCount === 0
            ? "Nothing to review right now."
            : `You reviewed ${done} expense${done === 1 ? "" : "s"}. Nice work.`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {filtersActive
            ? `${visible.length} of ${rows.length} shown`
            : `${rows.length} to review`}
        </span>
        <span>
          {done} / {initialCount} done
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${(done / initialCount) * 100}%` }}
        />
      </div>

      {/* Search / filter / sort toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:max-w-xs sm:flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search description, category, notes…"
            className="pl-9"
          />
        </div>

        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={nwFilter} onValueChange={setNwFilter}>
          <SelectTrigger className="sm:w-36">
            <SelectValue placeholder="Need/Want" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All need/want</SelectItem>
            <SelectItem value="none">Unspecified</SelectItem>
            {NEED_WANT.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sortField}
          onValueChange={(v) => setSortField(v as SortField)}
        >
          <SelectTrigger className="sm:w-36">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Date</SelectItem>
            <SelectItem value="amount">Amount</SelectItem>
            <SelectItem value="description">Description</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon"
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          aria-label={`Sort ${sortDir === "asc" ? "ascending" : "descending"}`}
          title={sortDir === "asc" ? "Ascending" : "Descending"}
        >
          <ArrowUpDown className="h-4 w-4" />
        </Button>

        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4" /> Clear
          </Button>
        )}
      </div>

      {/* Select-all + bulk actions */}
      {visible.length > 0 && (
        <div className="glass flex flex-wrap items-center gap-3 rounded-xl px-3 py-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={toggleAllVisible}
              aria-label="Select all visible"
            />
            <span className="text-muted-foreground">
              {selectedVisible.length > 0
                ? `${selectedVisible.length} selected`
                : "Select all"}
            </span>
          </label>
          {selectedVisible.length === 0 && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Tip: shift-click a checkbox to select a range
            </span>
          )}

          {selectedVisible.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    Set category
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="max-h-72 overflow-y-auto"
                >
                  <DropdownMenuLabel>Set category to</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {categories.map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      onClick={() => bulkSetCategory(c.id)}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: c.color ?? "#94a3b8" }}
                      />
                      {c.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    Set need/want
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Set need/want to</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => bulkSetNeedWant("none")}>
                    Unspecified
                  </DropdownMenuItem>
                  {NEED_WANT.map((v) => (
                    <DropdownMenuItem
                      key={v}
                      onClick={() => bulkSetNeedWant(v)}
                    >
                      {v}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button size="sm" onClick={reviewSelected}>
                <Check className="h-4 w-4" /> Mark reviewed
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={deleteSelected}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
                aria-label="Clear selection"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="glass-strong rounded-2xl py-16 text-center text-sm text-muted-foreground">
          No expenses match these filters.
        </div>
      ) : (
        <div className="space-y-3">
          {pageRows.map((e) => {
          const edit = edits[e.id] ?? {};
          const catVal = edit.categoryId ?? e.categoryId ?? "none";
          const nwVal = edit.needWant ?? e.needWant ?? "none";
          const incomeVal = edit.incomeType ?? e.incomeType ?? "none";
          const descVal = edit.description ?? e.description;
          const dateVal = edit.date ?? e.date;
          return (
            <Card key={e.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <Checkbox
                  className="self-start sm:self-auto"
                  checked={selected.has(e.id)}
                  onClick={(ev) => {
                    if (ev.shiftKey) {
                      ev.preventDefault(); // suppress the single toggle
                      selectRangeTo(e.id);
                    }
                  }}
                  onCheckedChange={() => toggleOne(e.id)}
                  aria-label={`Select ${e.description}`}
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Input
                    value={descVal}
                    onChange={(ev) =>
                      setEdit(e.id, { description: ev.target.value })
                    }
                    className="h-8 font-medium"
                    aria-label="Description"
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={dateVal}
                      onChange={(ev) => setEdit(e.id, { date: ev.target.value })}
                      className="h-7 w-[9.5rem] text-xs text-muted-foreground"
                      aria-label="Date"
                    />
                    {e.sourceStatementLabel && (
                      <span className="truncate text-xs text-muted-foreground">
                        {e.sourceStatementLabel}
                      </span>
                    )}
                  </div>
                </div>
                {(() => {
                  const costValue =
                    edit.effectiveAmount ??
                    centsToDecimalString(e.effectiveCents ?? e.amountCents);
                  const overridden =
                    costValue.trim() !== "" &&
                    dollarsToCents(costValue) !== e.amountCents;
                  return (
                    <div className="flex flex-col items-end sm:w-28">
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          {symbol}
                        </span>
                        <Input
                          inputMode="decimal"
                          value={costValue}
                          onChange={(ev) =>
                            setEdit(e.id, { effectiveAmount: ev.target.value })
                          }
                          className="h-8 w-28 pl-8 text-right tabular font-semibold"
                          aria-label="Cost to me"
                          title="What it actually cost you (edit to override the charged amount)"
                        />
                      </div>
                      {overridden && (
                        <span className="mt-0.5 text-xs text-muted-foreground line-through">
                          {money(e.amountCents)}
                        </span>
                      )}
                    </div>
                  );
                })()}
                <Select
                  value={catVal}
                  onValueChange={(v) => setEdit(e.id, { categoryId: v })}
                >
                  <SelectTrigger className="sm:w-40">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {e.isIncome ? (
                  <Select
                    value={incomeVal}
                    onValueChange={(v) => setEdit(e.id, { incomeType: v })}
                  >
                    <SelectTrigger
                      className="sm:w-28"
                      title="Income type (this is incoming money, not spending)"
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
                    value={nwVal}
                    onValueChange={(v) => setEdit(e.id, { needWant: v })}
                  >
                    <SelectTrigger className="sm:w-28">
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
                <div className="flex items-center gap-1.5">
                  <Button size="sm" onClick={() => markReviewed(e)}>
                    <Check className="h-4 w-4" /> Reviewed
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteOne(e)}
                    aria-label={`Delete ${e.description}`}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
          })}
          {visible.length > pageRows.length && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <span className="text-xs text-muted-foreground">
                Showing {pageRows.length} of {visible.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                Show more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

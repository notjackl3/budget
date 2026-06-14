"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
} from "date-fns";
import {
  ArrowUpDown,
  Pencil,
  Trash2,
  Search,
  Repeat,
  X,
  Link2,
  Unlink,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useToast } from "@/components/ui/toast";
import { useMoney } from "@/components/currency-provider";
import { EditExpenseDialog } from "./edit-expense-dialog";
import {
  updateExpense,
  deleteExpense,
  bulkExpenseAction,
  linkRefund,
} from "@/app/actions";
import { ymdToDate } from "@/lib/dates";
import {
  NEED_WANT,
  INCOME_TYPES,
  OFFSET_INCOME_TYPES,
} from "@/lib/categories";
import { expensesQueryKey, fetchExpenses } from "@/lib/expenses-query";
import type { ExpenseInput } from "@/app/actions";
import type { ExpenseDTO, CategoryDTO } from "@/lib/types";

/** Apply an inline-edit patch to a DTO for optimistic cache updates. */
function patchExpense(
  e: ExpenseDTO,
  input: Partial<ExpenseInput>,
  categories: CategoryDTO[],
): ExpenseDTO {
  const next = { ...e };
  if (input.categoryId !== undefined) {
    const id =
      input.categoryId && input.categoryId !== "none" ? input.categoryId : null;
    const cat = id ? categories.find((c) => c.id === id) : null;
    next.categoryId = id;
    next.categoryName = cat?.name ?? null;
    next.categoryColor = cat?.color ?? null;
  }
  if (input.needWant !== undefined) {
    const v = input.needWant;
    next.needWant =
      typeof v === "string" && (NEED_WANT as readonly string[]).includes(v)
        ? v
        : null;
  }
  if (input.incomeType !== undefined) {
    const v = input.incomeType;
    next.incomeType =
      typeof v === "string" && (INCOME_TYPES as readonly string[]).includes(v)
        ? v
        : null;
  }
  if (input.reviewed !== undefined) next.reviewed = Boolean(input.reviewed);
  return next;
}

type Preset =
  | "all"
  | "week"
  | "month"
  | "category"
  | "needwant"
  | "recurring"
  | "unreviewed";

type SortField = "date" | "amount" | "description";

/** How many rows to render at once. Keeps the DOM small so filtering, sorting,
 * and tab switches stay snappy even with thousands of expenses; "Show more"
 * reveals the next page. */
const PAGE_SIZE = 100;

const PRESETS: { value: Preset; label: string }[] = [
  { value: "all", label: "All" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "category", label: "By Category" },
  { value: "needwant", label: "Needs vs Wants" },
  { value: "recurring", label: "Recurring" },
  { value: "unreviewed", label: "Unreviewed" },
];

export function ExpensesView({
  categories,
  initialPreset = "all",
}: {
  categories: CategoryDTO[];
  initialPreset?: Preset;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const money = useMoney();

  // Server-prefetched + hydrated, so this resolves instantly on first paint;
  // subsequent mutations invalidate this key to refetch in the background.
  const { data: expenses = [], isFetching } = useQuery({
    queryKey: expensesQueryKey,
    queryFn: fetchExpenses,
  });

  const invalidate = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: expensesQueryKey }),
    [queryClient],
  );

  const [preset, setPreset] = React.useState<Preset>(initialPreset);
  const [query, setQuery] = React.useState("");
  // Deferred copy of the search text: the input updates instantly while the
  // (expensive) filtering over the full list runs against this lagging value,
  // so typing never blocks on re-rendering hundreds of rows.
  const deferredQuery = React.useDeferredValue(query);
  const [sortField, setSortField] = React.useState<SortField>("date");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  // Column filters.
  const [catFilter, setCatFilter] = React.useState("all"); // "all" | "none" | categoryId
  const [nwFilter, setNwFilter] = React.useState("all"); // "all" | "none" | flag
  const [reviewedFilter, setReviewedFilter] = React.useState("all"); // "all" | "reviewed" | "unreviewed"
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [editing, setEditing] = React.useState<ExpenseDTO | null>(null);
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);

  // Filter relative to *today*.
  const filtered = React.useMemo(() => {
    const now = new Date();
    const wkStart = startOfWeek(now, { weekStartsOn: 1 });
    const wkEnd = endOfWeek(now, { weekStartsOn: 1 });
    const moStart = startOfMonth(now);
    const moEnd = endOfMonth(now);
    const q = deferredQuery.trim().toLowerCase();

    return expenses.filter((e) => {
      // Income/credit rows live in their own table below, not the spend table.
      if (e.isIncome) return false;
      if (q) {
        const hay = `${e.description} ${e.categoryName ?? ""} ${e.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Column filters (AND-combined with the preset/search).
      if (catFilter !== "all") {
        if (catFilter === "none" ? e.categoryId != null : e.categoryId !== catFilter)
          return false;
      }
      if (nwFilter !== "all") {
        if (nwFilter === "none" ? e.needWant != null : e.needWant !== nwFilter)
          return false;
      }
      if (reviewedFilter !== "all") {
        if (reviewedFilter === "reviewed" ? !e.reviewed : e.reviewed)
          return false;
      }
      const d = ymdToDate(e.date);
      switch (preset) {
        case "week":
          return d >= wkStart && d <= wkEnd;
        case "month":
          return d >= moStart && d <= moEnd;
        case "recurring":
          return e.recurring;
        case "unreviewed":
          return !e.reviewed;
        default:
          return true;
      }
    });
  }, [expenses, preset, deferredQuery, catFilter, nwFilter, reviewedFilter]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortField === "amount")
        cmp = a.effectiveAmountCents - b.effectiveAmountCents;
      else if (sortField === "description")
        cmp = a.description.localeCompare(b.description);
      else cmp = a.date.localeCompare(b.date);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  // Whenever the result set changes (new filter, search, or sort), collapse back
  // to the first page so we never render a stale, oversized window.
  React.useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [preset, deferredQuery, sortField, sortDir, catFilter, nwFilter, reviewedFilter]);

  // Only the current page of rows is handed to the table(s) below.
  const pageRows = React.useMemo(
    () => sorted.slice(0, visibleCount),
    [sorted, visibleCount],
  );
  const hasMore = sorted.length > pageRows.length;

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir(field === "description" ? "asc" : "desc");
    }
  }

  // Voided expenses (refunded/reimbursed) are shown greyed out but don't count
  // toward the spend total.
  const total = sorted.reduce(
    (a, e) => a + (e.voided ? 0 : e.effectiveAmountCents),
    0,
  );

  // Income / credit rows for the separate table below. Search applies; the
  // spend-only presets/column filters don't. Newest first.
  const incomeRows = React.useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return expenses
      .filter((e) => e.isIncome)
      .filter((e) =>
        q
          ? `${e.description} ${e.refundsDescription ?? ""}`
              .toLowerCase()
              .includes(q)
          : true,
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, deferredQuery]);

  // Spending rows offered as link targets for a refund/reimbursement.
  const spendingExpenses = React.useMemo(
    () => expenses.filter((e) => !e.isIncome),
    [expenses],
  );

  // Selection helpers
  const allVisibleSelected =
    sorted.length > 0 && sorted.every((e) => selected.has(e.id));
  function toggleAll() {
    setSelected((prev) => {
      if (allVisibleSelected) return new Set();
      return new Set(sorted.map((e) => e.id));
    });
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function inlineUpdate(id: string, data: Parameters<typeof updateExpense>[1]) {
    // Optimistically patch the cached row so the UI updates instantly, then
    // sync with the server and refetch to reconcile.
    queryClient.setQueryData<ExpenseDTO[]>(expensesQueryKey, (old) =>
      old?.map((e) => (e.id === id ? patchExpense(e, data, categories) : e)),
    );
    try {
      await updateExpense(id, data);
    } catch (err) {
      toast({ title: "Update failed", variant: "error" });
      throw err;
    } finally {
      invalidate();
    }
  }

  async function runBulk(action: Parameters<typeof bulkExpenseAction>[1]) {
    const ids = [...selected];
    await bulkExpenseAction(ids, action);
    setSelected(new Set());
    invalidate();
    toast({ title: `Updated ${ids.length} expense${ids.length === 1 ? "" : "s"}`, variant: "success" });
  }

  const groupKey = (e: ExpenseDTO) =>
    preset === "category"
      ? e.categoryName ?? "Miscellaneous"
      : e.needWant ?? "Unspecified";

  // Group totals computed over the *full* filtered set so each header shows the
  // real category/need-want total regardless of how many rows are paged in.
  const groupTotals = React.useMemo(() => {
    if (preset !== "category" && preset !== "needwant") return null;
    const totals = new Map<string, number>();
    for (const e of sorted) {
      totals.set(groupKey(e), (totals.get(groupKey(e)) ?? 0) + e.effectiveAmountCents);
    }
    return totals;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, preset]);

  // Grouping for category / needwant presets — rows come from the current page,
  // ordering/totals come from `groupTotals`.
  const grouped = React.useMemo(() => {
    if (!groupTotals) return null;
    const map = new Map<string, ExpenseDTO[]>();
    for (const e of pageRows) {
      if (!map.has(groupKey(e))) map.set(groupKey(e), []);
      map.get(groupKey(e))!.push(e);
    }
    return [...map.entries()].sort(
      (a, b) => (groupTotals.get(b[0]) ?? 0) - (groupTotals.get(a[0]) ?? 0),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageRows, groupTotals]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={preset} onValueChange={(v) => setPreset(v as Preset)}>
          <TabsList>
            {PRESETS.map((p) => (
              <TabsTrigger key={p.value} value={p.value}>
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full lg:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search description, category…"
            className="pl-9"
          />
        </div>
      </div>

      {/* Column filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={nwFilter} onValueChange={setNwFilter}>
          <SelectTrigger className="h-9 w-36">
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

        <Select value={reviewedFilter} onValueChange={setReviewedFilter}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Reviewed" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="unreviewed">Unreviewed</SelectItem>
          </SelectContent>
        </Select>

        {(catFilter !== "all" ||
          nwFilter !== "all" ||
          reviewedFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCatFilter("all");
              setNwFilter("all");
              setReviewedFilter("all");
            }}
          >
            <X className="h-4 w-4" /> Clear filters
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          {sorted.length} expense{sorted.length === 1 ? "" : "s"}
          {isFetching && (
            <span className="text-xs italic opacity-60">updating…</span>
          )}
        </span>
        <span className="tabular font-medium text-foreground">
          {money(total)}
        </span>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="glass glass-active flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => runBulk({ type: "markReviewed", value: true })}>
              Mark reviewed
            </Button>
            <Button size="sm" variant="outline" onClick={() => runBulk({ type: "markReviewed", value: false })}>
              Mark unreviewed
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  Set category
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                <DropdownMenuLabel>Change category to</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {categories.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onClick={() => runBulk({ type: "setCategory", categoryId: c.id })}
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
            <Button
              size="sm"
              variant="destructive"
              onClick={() => runBulk({ type: "delete" })}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="glass-strong rounded-2xl py-16 text-center text-sm text-muted-foreground">
          No expenses match this view.
        </div>
      ) : grouped ? (
        <div className="space-y-6">
          {grouped.map(([groupName, rows]) => (
            <div key={groupName}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{groupName}</h3>
                <span className="tabular text-sm text-muted-foreground">
                  {money(groupTotals?.get(groupName) ?? 0)}
                </span>
              </div>
              <ExpenseTable
                rows={rows}
                {...{ selected, toggleOne, toggleAll: undefined, allVisibleSelected: false, sortField, sortDir, toggleSort, categories, inlineUpdate, setEditing, money, invalidate, toast, hideSelectAll: true }}
              />
            </div>
          ))}
        </div>
      ) : (
        <ExpenseTable
          rows={pageRows}
          {...{ selected, toggleOne, toggleAll, allVisibleSelected, sortField, sortDir, toggleSort, categories, inlineUpdate, setEditing, money, invalidate, toast }}
        />
      )}

      {hasMore && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <span className="text-xs text-muted-foreground">
            Showing {pageRows.length} of {sorted.length}
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

      {/* Income & credits — salary, refunds, reimbursements. Refunds and
          reimbursements can be linked to the expense they cancel. */}
      <IncomeSection
        rows={incomeRows}
        spendingExpenses={spendingExpenses}
        money={money}
        invalidate={invalidate}
        toast={toast}
        setEditing={setEditing}
        inlineUpdate={inlineUpdate}
      />

      {editing && (
        <EditExpenseDialog
          expense={editing}
          categories={categories}
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------- Table */

interface TableProps {
  rows: ExpenseDTO[];
  selected: Set<string>;
  toggleOne: (id: string) => void;
  toggleAll?: () => void;
  allVisibleSelected: boolean;
  sortField: SortField;
  sortDir: "asc" | "desc";
  toggleSort: (f: SortField) => void;
  categories: CategoryDTO[];
  inlineUpdate: (id: string, data: Parameters<typeof updateExpense>[1]) => Promise<void>;
  setEditing: (e: ExpenseDTO) => void;
  money: (c: number) => string;
  invalidate: () => void;
  toast: ReturnType<typeof useToast>["toast"];
  hideSelectAll?: boolean;
}

function SortHeader({
  label,
  field,
  sortField,
  sortDir,
  toggleSort,
  className,
}: {
  label: string;
  field: SortField;
  sortField: SortField;
  sortDir: "asc" | "desc";
  toggleSort: (f: SortField) => void;
  className?: string;
}) {
  const active = sortField === field;
  return (
    <button
      onClick={() => toggleSort(field)}
      className={`inline-flex items-center gap-1 font-medium hover:text-foreground ${active ? "text-foreground" : ""} ${className ?? ""}`}
    >
      {label}
      <ArrowUpDown className="h-3 w-3 opacity-60" />
      {active && <span className="sr-only">{sortDir}</span>}
    </button>
  );
}

function ExpenseTable(props: TableProps) {
  const {
    rows,
    selected,
    toggleOne,
    toggleAll,
    allVisibleSelected,
    sortField,
    sortDir,
    toggleSort,
    categories,
    inlineUpdate,
    setEditing,
    money,
    invalidate,
    toast,
    hideSelectAll,
  } = props;

  async function onDelete(id: string) {
    await deleteExpense(id);
    invalidate();
    toast({ title: "Expense deleted", variant: "success" });
  }

  return (
    <div className="glass-strong overflow-x-auto rounded-2xl">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="eyebrow border-b border-[var(--glass-rim)] text-left text-muted-foreground">
            <th className="w-10 px-3 py-3">
              {!hideSelectAll && (
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={() => toggleAll?.()}
                  aria-label="Select all"
                />
              )}
            </th>
            <th className="px-3 py-2.5">
              <SortHeader label="Date" field="date" {...{ sortField, sortDir, toggleSort }} />
            </th>
            <th className="px-3 py-2.5">
              <SortHeader label="Description" field="description" {...{ sortField, sortDir, toggleSort }} />
            </th>
            <th className="px-3 py-2.5">Category</th>
            <th className="px-3 py-2.5">Need/Want</th>
            <th className="px-3 py-2.5 text-right">
              <SortHeader label="Amount" field="amount" {...{ sortField, sortDir, toggleSort }} className="justify-end" />
            </th>
            <th className="px-3 py-2.5 text-center">Reviewed</th>
            <th className="w-20 px-3 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr
              key={e.id}
              className={`border-b border-[var(--glass-rim)] last:border-0 transition-colors duration-200 ease-glass hover:bg-[var(--glass-fill)] ${
                e.voided ? "text-muted-foreground/60" : ""
              }`}
              title={e.voided ? "Refunded / reimbursed — not counted" : undefined}
            >
              <td className="px-3 py-2">
                <Checkbox
                  checked={selected.has(e.id)}
                  onCheckedChange={() => toggleOne(e.id)}
                  aria-label="Select row"
                />
              </td>
              <td className="whitespace-nowrap px-3 py-2 tabular text-muted-foreground">
                {format(ymdToDate(e.date), "MMM d")}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${e.voided ? "line-through" : ""}`}>
                    {e.description}
                  </span>
                  {e.recurring && (
                    <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  {e.voided && (
                    <Badge variant="outline" className="text-[10px]">
                      refunded
                    </Badge>
                  )}
                </div>
              </td>
              <td className="px-3 py-2">
                <Select
                  value={e.categoryId ?? "none"}
                  onValueChange={(v) => inlineUpdate(e.id, { categoryId: v })}
                >
                  <SelectTrigger className="h-8 w-[150px] rounded-md border-0 bg-transparent px-2 shadow-none [backdrop-filter:none] hover:bg-secondary">
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
              </td>
              <td className="px-3 py-2">
                {e.isIncome ? (
                  <Select
                    value={e.incomeType ?? "none"}
                    onValueChange={(v) => inlineUpdate(e.id, { incomeType: v })}
                  >
                    <SelectTrigger
                      className="h-8 w-[120px] rounded-md border-0 bg-transparent px-2 shadow-none [backdrop-filter:none] hover:bg-secondary"
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
                    value={e.needWant ?? "none"}
                    onValueChange={(v) => inlineUpdate(e.id, { needWant: v })}
                  >
                    <SelectTrigger className="h-8 w-[100px] rounded-md border-0 bg-transparent px-2 shadow-none [backdrop-filter:none] hover:bg-secondary">
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
              <td className="whitespace-nowrap px-3 py-2 text-right tabular font-medium">
                {e.effectiveCents != null &&
                e.effectiveCents !== e.amountCents ? (
                  <span className="flex flex-col items-end leading-tight">
                    <span>{money(e.effectiveAmountCents)}</span>
                    <span
                      className="text-xs font-normal text-muted-foreground line-through"
                      title="Originally charged"
                    >
                      {money(e.amountCents)}
                    </span>
                  </span>
                ) : (
                  money(e.amountCents)
                )}
              </td>
              <td className="px-3 py-2 text-center">
                <Checkbox
                  checked={e.reviewed}
                  onCheckedChange={(v) =>
                    inlineUpdate(e.id, { reviewed: Boolean(v) })
                  }
                  aria-label="Reviewed"
                />
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditing(e)}
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(e.id)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------ Income & credits table */

function IncomeSection({
  rows,
  spendingExpenses,
  money,
  invalidate,
  toast,
  setEditing,
  inlineUpdate,
}: {
  rows: ExpenseDTO[];
  spendingExpenses: ExpenseDTO[];
  money: (c: number) => string;
  invalidate: () => void;
  toast: ReturnType<typeof useToast>["toast"];
  setEditing: (e: ExpenseDTO) => void;
  inlineUpdate: (
    id: string,
    data: Parameters<typeof updateExpense>[1],
  ) => Promise<void>;
}) {
  async function onDelete(id: string) {
    await deleteExpense(id);
    invalidate();
    toast({ title: "Deleted", variant: "success" });
  }

  return (
    <div className="space-y-2 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Income &amp; credits</h2>
        <span className="text-xs text-muted-foreground">
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Salary counts as income. Refunds and reimbursements don&apos;t add
        income — link one to the expense it cancels and that expense stops
        counting.
      </p>
      {rows.length === 0 ? (
        <div className="glass-strong rounded-2xl py-10 text-center text-sm text-muted-foreground">
          No income or credits yet. Add a transaction with a negative amount
          (salary, refund, or reimbursement).
        </div>
      ) : (
        <div className="glass-strong overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="eyebrow border-b border-[var(--glass-rim)] text-left text-muted-foreground">
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Description</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Offsets expense</th>
                <th className="px-3 py-2.5 text-right">Amount</th>
                <th className="w-20 px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const isOffset =
                  e.incomeType != null &&
                  (OFFSET_INCOME_TYPES as readonly string[]).includes(
                    e.incomeType,
                  );
                return (
                  <tr
                    key={e.id}
                    className="border-b border-[var(--glass-rim)] last:border-0 transition-colors duration-200 ease-glass hover:bg-[var(--glass-fill)]"
                  >
                    <td className="whitespace-nowrap px-3 py-2 tabular text-muted-foreground">
                      {format(ymdToDate(e.date), "MMM d")}
                    </td>
                    <td className="px-3 py-2 font-medium">{e.description}</td>
                    <td className="px-3 py-2">
                      <Select
                        value={e.incomeType ?? "none"}
                        onValueChange={(v) =>
                          inlineUpdate(e.id, { incomeType: v })
                        }
                      >
                        <SelectTrigger className="h-8 w-[150px] rounded-md border-0 bg-transparent px-2 shadow-none [backdrop-filter:none] hover:bg-secondary">
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
                    </td>
                    <td className="px-3 py-2">
                      {isOffset ? (
                        <LinkRefundControl
                          refund={e}
                          spendingExpenses={spendingExpenses}
                          money={money}
                          invalidate={invalidate}
                          toast={toast}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular font-medium text-emerald-600">
                      + {money(-e.amountCents)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEditing(e)}
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => onDelete(e.id)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Searchable picker to link a refund/reimbursement to the expense it offsets. */
function LinkRefundControl({
  refund,
  spendingExpenses,
  money,
  invalidate,
  toast,
}: {
  refund: ExpenseDTO;
  spendingExpenses: ExpenseDTO[];
  money: (c: number) => string;
  invalidate: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");

  const matches = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    return spendingExpenses
      .filter((e) =>
        query ? e.description.toLowerCase().includes(query) : true,
      )
      .slice(0, 50);
  }, [spendingExpenses, q]);

  async function link(id: string | null) {
    try {
      await linkRefund(refund.id, id);
      invalidate();
      setOpen(false);
      setQ("");
      toast({ title: id ? "Linked" : "Unlinked", variant: "success" });
    } catch (err) {
      toast({
        title: "Could not link",
        description: err instanceof Error ? err.message : undefined,
        variant: "error",
      });
    }
  }

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 max-w-[220px]">
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {refund.refundsExpenseId
                ? refund.refundsDescription ?? "Linked expense"
                : "Link expense"}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <div className="p-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Search expenses…"
              className="h-8"
              autoFocus
            />
          </div>
          <DropdownMenuSeparator />
          <div className="max-h-64 overflow-y-auto">
            {matches.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                No matching expenses.
              </p>
            ) : (
              matches.map((e) => (
                <DropdownMenuItem
                  key={e.id}
                  onSelect={(ev) => {
                    ev.preventDefault();
                    link(e.id);
                  }}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="truncate">
                    {e.description}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {format(ymdToDate(e.date), "MMM d")}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-xs text-muted-foreground">
                    {money(e.amountCents)}
                  </span>
                </DropdownMenuItem>
              ))
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      {refund.refundsExpenseId && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => link(null)}
          aria-label="Unlink"
        >
          <Unlink className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

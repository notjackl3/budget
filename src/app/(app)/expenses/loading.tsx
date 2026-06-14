import { Skeleton } from "@/components/ui/skeleton";

/**
 * Streamed instantly while the server prefetches expenses (see page.tsx).
 * Mirrors the real ExpensesView layout so the shell doesn't jump on load.
 */
export default function ExpensesLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <p className="text-sm text-muted-foreground">
          Sort, filter, edit inline, and run bulk actions.
        </p>
      </div>

      <div className="space-y-4">
        {/* Tabs + search row */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Skeleton className="h-9 w-full max-w-md" />
          <Skeleton className="h-9 w-full lg:w-64" />
        </div>

        {/* Count + total row */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border">
          <div className="border-b bg-card px-3 py-2.5">
            <Skeleton className="h-4 w-32" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b px-3 py-3 last:border-0"
            >
              <Skeleton className="h-4 w-4 shrink-0" />
              <Skeleton className="h-4 w-16 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24 shrink-0" />
              <Skeleton className="h-4 w-16 shrink-0" />
              <Skeleton className="h-4 w-20 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

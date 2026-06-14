import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getCategories, getPaymentMethods, getExpenses } from "@/lib/queries";
import { getQueryClient } from "@/lib/query-client";
import { expensesQueryKey } from "@/lib/expenses-query";
import { ExpensesView } from "@/components/expenses/expenses-view";

const VALID = [
  "all",
  "week",
  "month",
  "category",
  "needwant",
  "recurring",
  "unreviewed",
] as const;
type Preset = (typeof VALID)[number];

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const queryClient = getQueryClient();

  const [categories, paymentMethods, { view }] = await Promise.all([
    getCategories(),
    getPaymentMethods(),
    searchParams,
    // Prefetch expenses into the React Query cache on the server. Awaiting this
    // is what makes the route segment suspend, so loading.tsx streams a
    // skeleton while it runs — and the client hydrates with data already there.
    queryClient.prefetchQuery({
      queryKey: expensesQueryKey,
      // Wrap so React Query's context arg isn't forwarded into `getExpenses` —
      // it's an `unstable_cache` fn and would fold that arg into its cache key.
      queryFn: () => getExpenses(),
    }),
  ]);

  const initialPreset: Preset = VALID.includes(view as Preset)
    ? (view as Preset)
    : "all";

  const cats = categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    color: c.color,
    sortOrder: c.sortOrder,
  }));
  const methods = paymentMethods.map((p) => ({
    id: p.id,
    name: p.name,
    sortOrder: p.sortOrder,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <p className="text-sm text-muted-foreground">
          Sort, filter, edit inline, and run bulk actions.
        </p>
      </div>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <ExpensesView
          categories={cats}
          paymentMethods={methods}
          initialPreset={initialPreset}
        />
      </HydrationBoundary>
    </div>
  );
}

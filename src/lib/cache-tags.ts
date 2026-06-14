// Tag constants for Next.js Data Cache (`unstable_cache` + `revalidateTag`).
// Read queries in `queries.ts` are cached under these tags; mutations in
// `actions.ts` call `revalidateTag` to bust exactly the affected caches.
// Kept dependency-free (no "server-only") so both layers can import it.
export const TAG = {
  expenses: "expenses",
  categories: "categories",
  paymentMethods: "payment-methods",
  settings: "settings",
  reflections: "reflections",
  statements: "statements",
  jobs: "jobs",
  holdings: "holdings",
  quotes: "quotes",
  snapshots: "snapshots",
} as const;

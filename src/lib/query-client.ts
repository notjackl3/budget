import {
  QueryClient,
  defaultShouldDehydrateQuery,
  isServer,
} from "@tanstack/react-query";

/**
 * Factory for a QueryClient with sensible defaults for this app.
 *
 * - A long `staleTime` means hydrated data isn't refetched on mount or on
 *   revisits, avoiding a client-side waterfall after SSR and redundant
 *   `/api/expenses` round-trips when navigating back to a list. Mutations call
 *   `invalidateQueries` explicitly, so this never serves stale data after an
 *   edit — it only suppresses time-based background refetches.
 * - We also dehydrate `pending` queries so server-prefetched-but-not-awaited
 *   queries can stream to the client.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * Returns a QueryClient. On the server a brand-new client is created per
 * request (so caches never leak between users); in the browser a single
 * long-lived client is reused.
 */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

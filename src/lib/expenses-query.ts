import type { ExpenseDTO } from "./types";

/** Shared query key so the server prefetch and client useQuery line up. */
export const expensesQueryKey = ["expenses"] as const;

/** Client-side fetcher used by React Query. Hits the JSON API route. */
export async function fetchExpenses(): Promise<ExpenseDTO[]> {
  const res = await fetch("/api/expenses");
  if (!res.ok) {
    throw new Error(`Failed to load expenses (${res.status})`);
  }
  return res.json();
}

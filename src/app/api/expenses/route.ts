import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getExpenses } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const expenses = await getExpenses();
  return NextResponse.json(expenses);
}

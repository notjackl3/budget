// TEMP DIAGNOSTIC — remove after debugging prod data. Public (allowlisted in
// middleware). Reports whether the Turso env is wired and does an UNCACHED count
// straight from the DB, then busts every Data Cache tag so the stale (empty)
// unstable_cache entries — cached while Turso was still empty — get refreshed.
// Leaks no secrets.
import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { TAG } from "@/lib/cache-tags";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.TURSO_DATABASE_URL ?? "";

  let expenseCount: number | string;
  try {
    expenseCount = await prisma.expense.count();
  } catch (e) {
    expenseCount = `ERROR: ${(e as Error).message}`;
  }

  // Bust every cached read so the UI re-queries Turso.
  for (const tag of Object.values(TAG)) revalidateTag(tag);
  revalidatePath("/", "layout");

  return NextResponse.json({
    tursoUrlSet: Boolean(url),
    tursoUrlLen: url.length,
    expenseCountUncached: expenseCount,
    bustedTags: Object.values(TAG),
  });
}

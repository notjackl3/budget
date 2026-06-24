// Persistent record of Gmail messages the user has already handled in the email
// picker — imported as an expense, or explicitly dismissed via "mark done". The
// picker reads this to tag re-fetched mail with a "Done" badge so the user never
// re-reviews the same receipt.
//
// This lives in the (Turso) database rather than the old /tmp JSON cache: the
// temp file was wiped on every restart and never existed at all on serverless
// cold starts, so "already seen" never actually stuck and emails kept popping
// back up. The DB keeps the mark for good. Dedupe on ingest still makes any
// missed mark harmless.

import { prisma } from "./prisma";

export interface DoneEmailInput {
  id: string;
  subject?: string | null;
  sender?: string | null;
  /** ISO string or Date; stored for display only. */
  receivedAt?: string | Date | null;
}

/** Index-based fallback ids ("idx-N") aren't stable across fetches, so never
 * persist them — they'd mark the wrong email next time. */
function isStableId(id: string): boolean {
  return Boolean(id) && !id.startsWith("idx-");
}

/** Ids of emails the user has already handled. */
export async function getDoneEmailIds(): Promise<Set<string>> {
  const rows = await prisma.processedEmail.findMany({ select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

/** Mark these emails as handled. Already-marked ids keep their original mark.
 * Returns how many were newly recorded. (`skipDuplicates` isn't supported on
 * SQLite/libSQL, so we drop already-marked ids by hand before inserting.) */
export async function markEmailsDone(emails: DoneEmailInput[]): Promise<number> {
  const stable = emails.filter((e) => isStableId(e.id));
  if (stable.length === 0) return 0;
  // De-dupe within the batch (first mention wins), then drop ids we already have.
  const byId = new Map<string, DoneEmailInput>();
  for (const e of stable) if (!byId.has(e.id)) byId.set(e.id, e);
  const existing = await getDoneEmailIds();
  const fresh = [...byId.values()].filter((e) => !existing.has(e.id));
  if (fresh.length === 0) return 0;
  await prisma.processedEmail.createMany({
    data: fresh.map((e) => ({
      id: e.id,
      subject: e.subject ?? null,
      sender: e.sender ?? null,
      receivedAt: e.receivedAt ? new Date(e.receivedAt) : null,
    })),
  });
  return fresh.length;
}

/** Undo: forget the "done" mark so the email is treated as unhandled again. */
export async function unmarkEmailsDone(ids: string[]): Promise<void> {
  const stable = ids.filter(isStableId);
  if (stable.length === 0) return;
  await prisma.processedEmail.deleteMany({ where: { id: { in: stable } } });
}

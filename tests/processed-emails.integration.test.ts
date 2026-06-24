// Integration test for the email "done"-tracking feature. Exercises the FULL
// stack — Prisma client → libSQL adapter → the real (Turso) DB — so it verifies
// the feature actually works against the database the app uses, not just pure
// logic. Uses a unique, obviously-fake id namespace and deletes every row it
// creates in afterAll, so it never touches real email marks.
//
// Skips itself when no DB is reachable (e.g. CI without TURSO_* secrets), so the
// normal unit suite stays hermetic.

import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getDoneEmailIds,
  markEmailsDone,
  unmarkEmailsDone,
} from "@/lib/processed-emails";
import { parseAlertEmail } from "@/lib/parse-alert-email";
import { makeDedupeHash } from "@/lib/parse-statement";
import { fuzzyMerchantMatch } from "@/lib/ingest";

const NS = "test-done-" + process.pid + "-";
const id = (n: number) => `${NS}${n}`;

// Only run when a DB is actually reachable.
let dbUp = false;
beforeAll(async () => {
  try {
    await prisma.processedEmail.count();
    dbUp = true;
  } catch {
    dbUp = false;
  }
});

afterAll(async () => {
  // Clean up everything this test created, by id prefix.
  await prisma.processedEmail
    .deleteMany({ where: { id: { startsWith: NS } } })
    .catch(() => {});
  await prisma.$disconnect().catch(() => {});
});

describe("processed-emails done-tracking (integration)", () => {
  it("marks emails done and reads them back", async () => {
    if (!dbUp) return; // skipped — no DB
    const fresh = await markEmailsDone([
      { id: id(1), subject: "Receipt A", sender: "a@x.com", receivedAt: "2026-06-01T00:00:00.000Z" },
      { id: id(2), subject: "Receipt B", sender: "b@x.com", receivedAt: new Date("2026-06-02") },
    ]);
    expect(fresh).toBe(2);

    const done = await getDoneEmailIds();
    expect(done.has(id(1))).toBe(true);
    expect(done.has(id(2))).toBe(true);
  });

  it("is idempotent — re-marking the same id records nothing new", async () => {
    if (!dbUp) return;
    const again = await markEmailsDone([
      { id: id(1), subject: "Receipt A (dup)" },
      { id: id(3), subject: "Receipt C" },
    ]);
    // id(1) already exists → only id(3) is fresh.
    expect(again).toBe(1);

    // And there is exactly one row for id(1), not two.
    const rows = await prisma.processedEmail.count({ where: { id: id(1) } });
    expect(rows).toBe(1);
  });

  it("never persists unstable idx- fallback ids", async () => {
    if (!dbUp) return;
    const n = await markEmailsDone([{ id: "idx-0", subject: "no stable id" }]);
    expect(n).toBe(0);
    const done = await getDoneEmailIds();
    expect(done.has("idx-0")).toBe(false);
  });

  it("de-dupes within a single batch", async () => {
    if (!dbUp) return;
    const n = await markEmailsDone([
      { id: id(4), subject: "first mention" },
      { id: id(4), subject: "second mention" },
    ]);
    expect(n).toBe(1);
  });

  it("unmark forgets the done mark", async () => {
    if (!dbUp) return;
    await markEmailsDone([{ id: id(5), subject: "to be undone" }]);
    expect((await getDoneEmailIds()).has(id(5))).toBe(true);

    await unmarkEmailsDone([id(5)]);
    expect((await getDoneEmailIds()).has(id(5))).toBe(false);
  });
});

// Verifies the retro-detect mechanism that flags the pre-feature backlog: a
// re-fetched alert email re-derives the SAME dedupe hash an imported expense
// carries (exact match), and a noisier posted/PDF description still matches via
// the fuzzy-merchant fallback. This is the logic fetchEmailCandidates uses to
// auto-mark already-imported emails "done" without any stored email id.
describe("retro-detect: re-fetched alert matches an existing expense", () => {
  const body =
    "A transaction of $42.50 was charged to your CIBC Dividend Visa card " +
    "ending in 1234 at TIM HORTONS #4021 on June 16, 2026.";

  it("re-derives the exact dedupe hash the import stored", () => {
    const parsed = parseAlertEmail(body);
    expect(parsed).not.toBeNull();
    // The hash the email produces NOW must equal the one ingest stored THEN
    // (same parser + same makeDedupeHash), so an exact-hash lookup flags it.
    const emailHash = makeDedupeHash(parsed!.date, parsed!.amountCents, parsed!.description);
    const storedHash = makeDedupeHash("2026-06-16", 4250, "TIM HORTONS #4021");
    expect(emailHash).toBe(storedHash);
  });

  it("fuzzy-matches a noisier posted/PDF description for the same charge", () => {
    const parsed = parseAlertEmail(body)!;
    // Posted statement line is longer/noisier than the alert's merchant label.
    const postedDescription = "TIM HORTONS #4021 TORONTO ON";
    expect(makeDedupeHash(parsed.date, parsed.amountCents, parsed.description)).not.toBe(
      makeDedupeHash("2026-06-16", 4250, postedDescription),
    );
    // Exact hash differs, but the fuzzy fallback (amount+date already equal) ties them.
    expect(fuzzyMerchantMatch(postedDescription, parsed.description)).toBe(true);
  });
});

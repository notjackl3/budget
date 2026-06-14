import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseStatementText,
  makeDedupeHash,
} from "@/lib/parse-statement";

const fixtures = path.join(__dirname, "fixtures");
const read = (name: string) =>
  fs.readFileSync(path.join(fixtures, name), "utf8");

describe("parseStatementText — CIBC Feb 2025 statement", () => {
  const result = parseStatementText(read("onlineStatement_2025-02-26.txt"));

  it("parses the statement period (same calendar year)", () => {
    expect(result.periodStart).toBe("2025-01-27");
    expect(result.periodEnd).toBe("2025-02-26");
    expect(result.label).toBe("CIBC Dividend Visa — February 2025");
  });

  it("extracts exactly the charge count from the bank's own spend report (47)", () => {
    expect(result.transactions.length).toBe(47);
  });

  it("the charge total matches the statement's 'Total for card' ($1,363.85)", () => {
    const total = result.transactions.reduce((a, t) => a + t.amountCents, 0);
    expect(total).toBe(136385);
  });

  it("excludes the 'Your payments' bill-payment rows", () => {
    const payments = result.transactions.filter((t) =>
      /PAYMENT THANK YOU|PAIEMENT MERCI/i.test(t.description),
    );
    expect(payments).toHaveLength(0);
  });

  it("parses the first charge row correctly (date, desc, amount, bank category)", () => {
    const first = result.transactions[0];
    expect(first.date).toBe("2025-01-24");
    expect(first.description).toBe("UTM BOOKSTORE MISS");
    expect(first.amountCents).toBe(4139);
    expect(first.bankCategory).toBe("Retail and Grocery");
  });

  it("handles multi-line rows split by the cash-back marker", () => {
    // This Uber Eats row is rendered across three lines in the PDF text.
    const uber = result.transactions.find(
      (t) => t.date === "2025-01-26" && t.amountCents === 1923,
    );
    expect(uber).toBeDefined();
    expect(uber!.bankCategory).toBe("Restaurants");
  });

  it("produces a stable dedupe hash", () => {
    const first = result.transactions[0];
    expect(first.dedupeHash).toBe(
      makeDedupeHash("2025-01-24", 4139, "UTM BOOKSTORE MISS"),
    );
  });
});

describe("parseStatementText — period crossing a year boundary", () => {
  const result = parseStatementText(read("onlineStatement_2026-01-26.txt"));

  it("resolves the start year to the previous calendar year", () => {
    expect(result.periodStart).toBe("2025-12-27");
    expect(result.periodEnd).toBe("2026-01-26");
  });

  it("assigns December transactions to 2025 and January to 2026", () => {
    const dec = result.transactions.filter((t) => t.date.startsWith("2025-12"));
    const jan = result.transactions.filter((t) => t.date.startsWith("2026-01"));
    expect(dec.length).toBeGreaterThan(0);
    expect(jan.length).toBeGreaterThan(0);
    // Transaction dates land in the right calendar years (a trans date may
    // precede periodStart by a few days, since the period is posting-based).
    for (const t of result.transactions) {
      expect(t.date.startsWith("2025-12") || t.date.startsWith("2026-01")).toBe(
        true,
      );
    }
  });
});

describe("parseStatementText — robustness across all 16 statements", () => {
  const files = fs
    .readdirSync(fixtures)
    .filter((f) => f.endsWith(".txt"))
    .sort();

  it("parses every statement with a valid period and >0 transactions", () => {
    for (const f of files) {
      const r = parseStatementText(read(f));
      expect(r.periodStart, `${f} periodStart`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.periodEnd, `${f} periodEnd`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.transactions.length, `${f} txn count`).toBeGreaterThan(0);
      // All amounts are non-zero integers; dates fall at or before the period
      // end and no earlier than ~15 days before the period start (a trans date
      // can precede the posting-based period start by a few days).
      const lower = new Date(r.periodStart!);
      lower.setDate(lower.getDate() - 15);
      const upper = new Date(r.periodEnd!);
      for (const t of r.transactions) {
        expect(Number.isInteger(t.amountCents)).toBe(true);
        expect(t.amountCents).not.toBe(0);
        const d = new Date(t.date);
        expect(d >= lower && d <= upper, `${f} date ${t.date}`).toBe(true);
      }
    }
  });
});

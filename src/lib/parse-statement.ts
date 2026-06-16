// Pure statement-text parser (no PDF/IO dependency, so it is trivially
// testable). Tuned for CIBC Visa "online statement" text as produced by
// pdf-parse, but written defensively. The PDF -> text step lives in
// `parse-pdf.ts` (server-only).

import { monthNameToIndex } from "./dates";
import { parseAmountToCents } from "./money";

export interface ParsedTransaction {
  /** Transaction date (YYYY-MM-DD resolved with the statement's year). */
  date: string;
  /** Cleaned merchant/description. */
  description: string;
  /** Integer cents. Positive = charge, negative = credit/return. */
  amountCents: number;
  /** Bank-provided spend category, if present. */
  bankCategory: string | null;
  /** Stable fingerprint for duplicate detection. */
  dedupeHash: string;
}

export interface ParsedStatement {
  periodStart: string | null; // YYYY-MM-DD
  periodEnd: string | null; // YYYY-MM-DD
  label: string | null;
  transactions: ParsedTransaction[];
}

// The fixed set of CIBC spend categories — used as anchors to find where a
// description ends and the amount begins.
const BANK_CATEGORIES = [
  "Personal and Household Expenses",
  "Professional and Financial Services",
  "Retail and Grocery",
  "Transportation",
  "Hotel, Entertainment and Recreation",
  "Restaurants",
  "Home and Office Improvement",
  "Health and Education",
  "Foreign Currency Transactions",
  "Other Transactions",
];

const MONTH_ABBR = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";

/** Pad to "YYYY-MM-DD". */
function isoDate(year: number, monthIndex0: number, day: number): string {
  const m = String(monthIndex0 + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function cleanDescription(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\s+(ON|BC|AB|QC|NS|NB|MB|SK|PE|NL|YT|NT|NU)$/i, "")
    .trim();
}

function normalizeForHash(desc: string): string {
  return desc.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function makeDedupeHash(
  date: string,
  amountCents: number,
  description: string,
): string {
  return `${date}|${amountCents}|${normalizeForHash(description)}`;
}

/**
 * Parse the statement period, returning fully-qualified start/end dates and a
 * friendly label. Handles periods that cross a year boundary (Dec -> Jan).
 */
function parsePeriod(text: string): {
  periodStart: string | null;
  periodEnd: string | null;
  label: string | null;
} {
  // e.g. "Transactions from January 27 to February 26, 2025" or, when the
  // period crosses a year boundary, "from December 27, 2025 to January 26, 2026".
  const m = text.match(
    /from\s+([A-Za-z]+)\s+(\d{1,2})(?:,?\s*\d{4})?\s+to\s+([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/,
  );
  if (!m) return { periodStart: null, periodEnd: null, label: null };

  const startMonth = monthNameToIndex(m[1]);
  const startDay = parseInt(m[2], 10);
  const endMonth = monthNameToIndex(m[3]);
  const endDay = parseInt(m[4], 10);
  const endYear = parseInt(m[5], 10);
  // If start month is after end month, the period wraps the new year.
  const startYear = startMonth > endMonth ? endYear - 1 : endYear;

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return {
    periodStart: isoDate(startYear, startMonth, startDay),
    periodEnd: isoDate(endYear, endMonth, endDay),
    label: `CIBC Dividend Visa — ${MONTHS[endMonth]} ${endYear}`,
  };
}

/**
 * Resolve a "MMM DD" transaction date (no year on the statement) to a full
 * year using the statement period as context.
 */
function resolveYear(
  monthIndex0: number,
  day: number,
  periodStart: string | null,
  periodEnd: string | null,
): number {
  const endYear = periodEnd ? parseInt(periodEnd.slice(0, 4), 10) : new Date(2000, 0).getFullYear();
  const startYear = periodStart ? parseInt(periodStart.slice(0, 4), 10) : endYear;
  if (startYear === endYear) return endYear;
  // Period wraps a year boundary: months in the latter part of the calendar
  // (>= the start month) belong to the earlier year.
  const startMonth = periodStart ? parseInt(periodStart.slice(5, 7), 10) - 1 : 0;
  return monthIndex0 >= startMonth ? startYear : endYear;
}

export function parseStatementText(text: string): ParsedStatement {
  const { periodStart, periodEnd, label } = parsePeriod(text);

  // Drop the "Your payments" section (credit-card bill payments, not spending)
  // so its dates can't leak into the first charge row. Charges live under
  // "Your new charges and credits"; start scanning from there.
  const chargesIdx = text.indexOf("Your new charges and credits");
  const body = chargesIdx >= 0 ? text.slice(chargesIdx) : text;

  // Collapse newlines to spaces so multi-line rows (split by the cash-back
  // marker) join back into one logical row. Each row is self-delimiting:
  // it starts with two dates and ends with an amount, so a global, non-greedy
  // scan extracts them cleanly without over-running into the next row.
  const flat = body.replace(/\s*\n\s*/g, " ");

  const catAlt = BANK_CATEGORIES.map((c) =>
    c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|");

  // <TransDate> <PostDate> [Ý/marker] <desc> <bankCategory> <amount[-]>
  // The description is length-bounded (real merchant names are short): an
  // unbounded lazy `.+?` here lets a hostile statement whose text is full of
  // date-like prefixes but no category/amount trigger catastrophic regex
  // backtracking (a ReDoS pinning the CPU). Capping it keeps each match attempt
  // O(1) in the description, so the overall scan stays linear.
  const rowRe = new RegExp(
    `(${MONTH_ABBR})\\s+(\\d{1,2})\\s*(${MONTH_ABBR})\\s+(\\d{1,2})\\s*[ÝY]?\\s*` +
      `(.{1,200}?)\\s*(${catAlt})\\s*(-?[\\d,]+\\.\\d{2}-?)`,
    "g",
  );

  const transactions: ParsedTransaction[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = rowRe.exec(flat)) !== null) {
    const [, transMonth, transDayStr, , , descRaw, bankCategory, amountStr] =
      match;
    const monthIndex0 = monthNameToIndex(transMonth);
    if (monthIndex0 < 0) continue;
    const day = parseInt(transDayStr, 10);
    const year = resolveYear(monthIndex0, day, periodStart, periodEnd);
    const date = isoDate(year, monthIndex0, day);

    const description = cleanDescription(descRaw);
    if (!description) continue;

    const amountCents = parseAmountToCents(amountStr);
    // Skip zero-amount noise.
    if (amountCents === 0) continue;

    const dedupeHash = makeDedupeHash(date, amountCents, description);
    // Within a single statement, the exact same fingerprint shouldn't repeat;
    // guard against accidental double-matches.
    const localKey = `${match.index}:${dedupeHash}`;
    if (seen.has(dedupeHash) && seen.has(localKey)) continue;
    seen.add(dedupeHash);

    transactions.push({
      date,
      description,
      amountCents,
      bankCategory: bankCategory.trim(),
      dedupeHash,
    });
  }

  return { periodStart, periodEnd, label, transactions };
}

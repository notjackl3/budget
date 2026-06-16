// Parser for CIBC transaction-alert emails.
//
// A transaction alert is a single-purchase notification CIBC sends within
// minutes of a card swipe. The real format (validated 2026-06-16, see the
// fixture in tests/parse-alert-email.test.ts) is:
//
//   "You've recently made a purchase with your CIBC Dividend Visa Card ending
//    in 5175 for $124.30 at SP DRMERS CLOTHING."
//
// Note the body carries NO transaction date — we fall back to the email's
// received date (close enough for a near-real-time alert). We extract just
// {date, description, amountCents}; everything downstream (category, need/want,
// dedupe) is handled by the shared ingest pipeline, the same way PDF rows are.
//
// The regexes also tolerate "transaction of $X at MERCHANT on <date>" phrasing
// in case CIBC varies the wording for other alert types (refunds, etc.).

import { parseAmountToCents } from "./money";
import { monthNameToIndex } from "./dates";

export interface ParsedAlert {
  /** YYYY-MM-DD. */
  date: string;
  description: string;
  /** Integer cents. Positive = charge; negative = refund/credit. */
  amountCents: number;
}

/** Strip HTML tags/entities so the regexes see plain text, and collapse space. */
function toPlainText(raw: string): string {
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Cheap pre-filter so the poller can ignore unrelated mail before parsing. */
export function looksLikeCibcAlert(raw: string): boolean {
  const text = toPlainText(raw);
  return /\bCIBC\b/i.test(text) && /transaction|purchase|spent|charged/i.test(text) && /\$\s?\d/.test(text);
}

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December|" +
  "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

// "June 16, 2026" / "Jun 16 2026" / "16 June 2026"
const DATE_MDY = new RegExp(`\\b(${MONTHS})\\.?\\s+(\\d{1,2})(?:,)?\\s+(\\d{4})\\b`, "i");
const DATE_DMY = new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS})\\.?\\s+(\\d{4})\\b`, "i");

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Find a transaction date in the alert; null if none is present. */
function extractDate(text: string): string | null {
  let m = DATE_MDY.exec(text);
  if (m) {
    const month = monthNameToIndex(m[1]);
    const day = parseInt(m[2], 10);
    if (month >= 0 && day >= 1 && day <= 31) return `${m[3]}-${pad2(month + 1)}-${pad2(day)}`;
  }
  m = DATE_DMY.exec(text);
  if (m) {
    const month = monthNameToIndex(m[2]);
    const day = parseInt(m[1], 10);
    if (month >= 0 && day >= 1 && day <= 31) return `${m[3]}-${pad2(month + 1)}-${pad2(day)}`;
  }
  return null;
}

// "$42.50" / "$1,234.00"
const AMOUNT = /\$\s?([\d,]+\.\d{2})\b/;

// Merchant after "at <MERCHANT>" up to a date/end-of-clause boundary. CIBC puts
// the merchant after the literal " at ". We stop at " on <date>", a period, or
// end of string.
const MERCHANT_AT = /\bat\s+(.+?)(?=\s+on\b|\.(?:\s|$)|\bending\b|$)/i;

/**
 * Parse one CIBC alert email (plain text or HTML) into a transaction, or null
 * if it doesn't look like a parseable single-transaction alert.
 *
 * @param opts.referenceDate Used only to infer the year if the alert omits it
 *        (rare). Defaults are intentionally NOT taken from a wall clock here so
 *        the function stays pure and testable; the caller passes "today".
 */
export function parseAlertEmail(
  raw: string,
  opts: { referenceDate?: Date } = {},
): ParsedAlert | null {
  const text = toPlainText(raw);

  const amountMatch = AMOUNT.exec(text);
  if (!amountMatch) return null;
  const cents = parseAmountToCents(amountMatch[1]);
  if (!Number.isFinite(cents) || cents === 0) return null;

  // Refunds/reversals are credits — store them negative so income logic applies.
  // A real purchase alert mentions "purchase"/"made a transaction"; treat it as
  // a charge even if the boilerplate says "credit card". We only flag a credit
  // on refund-ish wording, and the bare word "credit" is excluded when it's part
  // of "credit card"/"credit limit" (which appears in every alert's subject).
  const isPurchase = /\b(purchase|made a transaction|was charged|you spent)\b/i.test(text);
  const isCredit =
    !isPurchase &&
    /\brefund(?:ed)?\b|\breversal\b|\breturned\b|\bcredited\b|\bcredit\b(?!\s+(?:card|limit))/i.test(
      text,
    );
  const amountCents = isCredit ? -Math.abs(cents) : Math.abs(cents);

  let date = extractDate(text);
  if (!date && opts.referenceDate) {
    // No date in the alert — fall back to the day we received it.
    const d = opts.referenceDate;
    date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  if (!date) return null;

  const merchantMatch = MERCHANT_AT.exec(text);
  const description = merchantMatch
    ? merchantMatch[1].replace(/\s+/g, " ").trim()
    : "CIBC card transaction"; // last-resort label; review will let you fix it
  if (!description) return null;

  return { date, description, amountCents };
}

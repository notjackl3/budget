// Generic LLM-backed receipt parser. Catches the long tail of merchant emails
// (Apple, Amazon, subscription renewals, …) that the CIBC-specific regex
// parser in parse-alert-email.ts can't match. Hybrid by design: the regex
// parser runs first (free + instant for the common case); only when it bails
// do we pay the LLM cost. Haiku 4.5 — cheap, fast.
//
// Forced-tool-use shape (instead of structured outputs) for compatibility
// with this project's installed SDK version: we declare a `record_receipt`
// tool, set `tool_choice` to force its use, and read the typed input
// directly. The SDK returns it as a parsed object, no JSON parsing needed.

import Anthropic from "@anthropic-ai/sdk";

export interface ParsedReceipt {
  /** YYYY-MM-DD. */
  date: string;
  description: string;
  /** Integer cents. Positive = charge, negative = refund/credit. */
  amountCents: number;
}

export function isLlmReceiptConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

interface RecordReceiptInput {
  // Sentinel: false for marketing, shipping notices without prices, balance
  // summaries, etc. Other fields are ignored when this is false.
  isReceipt: boolean;
  // YYYY-MM-DD; empty when not a receipt.
  date: string;
  // Short merchant/brand name; empty when not a receipt.
  description: string;
  // Positive = charge; negative = refund. 0 when not a receipt.
  amountCents: number;
}

function ymdFromDate(d: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Try to extract a single purchase from an arbitrary merchant email. Returns
 * null when the email isn't a parseable receipt, when the LLM isn't
 * configured, or when the call fails — the poller then just skips this email.
 *
 * `emailText` is capped at ~6K chars to bound token spend; the salient fields
 * (subject, totals, merchant) are nearly always above the fold.
 */
export async function parseReceiptWithLLM(
  emailText: string,
  opts: { referenceDate?: Date; subject?: string; sender?: string } = {},
): Promise<ParsedReceipt | null> {
  if (!isLlmReceiptConfigured()) return null;
  const text = emailText.trim();
  if (!text) return null;

  const refYmd = opts.referenceDate ? ymdFromDate(opts.referenceDate) : null;

  const prompt = `Extract a single purchase transaction from this email receipt, if any.

Email metadata:
- Subject: ${opts.subject ?? "(unknown)"}
- From: ${opts.sender ?? "(unknown)"}
- Received: ${refYmd ?? "(unknown)"}

Email body (may be HTML or plain text, may include irrelevant header/footer):
"""
${text.slice(0, 6000)}
"""

Call the record_receipt tool with the extracted fields:
- isReceipt: true ONLY if this is a purchase or refund confirmation with a clear total. Marketing, newsletters, shipping/delivery notices without prices, account balance summaries, and order-placed-but-not-charged emails are NOT receipts — set false.
- date: the transaction date in YYYY-MM-DD. If the body has no date, use the received date (${refYmd ?? "leave empty"}). Empty string if not a receipt.
- description: a short, clean merchant/seller name — prefer the brand ("Apple", "Spotify", "Amazon") over generic email phrasing ("Your order"). Empty if not a receipt.
- amountCents: the GRAND TOTAL charged, as integer cents (e.g. $15.24 → 1524, $1,234.00 → 123400). Negative for refunds/credits. 0 if not a receipt. Pick the total, not subtotals or item prices.`;

  try {
    const resp = await getClient().messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      tool_choice: { type: "tool", name: "record_receipt" },
      tools: [
        {
          name: "record_receipt",
          description: "Record an extracted purchase transaction (or non-receipt sentinel).",
          input_schema: {
            type: "object",
            properties: {
              isReceipt: { type: "boolean" },
              date: { type: "string" },
              description: { type: "string" },
              amountCents: { type: "integer" },
            },
            required: ["isReceipt", "date", "description", "amountCents"],
            additionalProperties: false,
          },
        },
      ],
      messages: [{ role: "user", content: prompt }],
    });

    const toolUse = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUse) return null;
    const out = toolUse.input as RecordReceiptInput;

    if (!out.isReceipt) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(out.date)) return null;
    const desc = (out.description ?? "").trim();
    if (!desc) return null;
    if (!Number.isFinite(out.amountCents) || out.amountCents === 0) return null;

    return { date: out.date, description: desc, amountCents: Math.trunc(out.amountCents) };
  } catch (err) {
    // Non-fatal: the poller continues with whatever the regex parser produced
    // (typically nothing for the email that triggered this path).
    console.warn("[receipt-llm] parse failed:", (err as Error).message);
    return null;
  }
}

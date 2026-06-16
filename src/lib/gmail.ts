// Gmail access for the email-alert poller — brokered by Composio.
//
// Composio holds the OAuth tokens (managed Google app), so there's no Google
// Cloud project, no token storage, and no refresh logic here. We only persist
// which Composio user/connected-account the mailbox lives under, then call
// Composio's GMAIL_FETCH_EMAILS tool to read CIBC alerts.
//
// The public interface (getGmailStatus / fetchAlertTransactions / markSynced /
// disconnectGmail / isGmailConfigured) is intentionally identical to the prior
// hand-rolled OAuth version, so the routes, actions, UI card, and cron poller
// didn't have to change — only the transport underneath did.

import { Composio, AuthConfigTypes } from "@composio/core";
import { prisma } from "./prisma";
import { parseAlertEmail } from "./parse-alert-email";
import type { RawTxn } from "./ingest";

const DEFAULT_USER_ID = "budget-user";

export function isGmailConfigured(): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY);
}

function getUserId(): string {
  return process.env.COMPOSIO_USER_ID || DEFAULT_USER_ID;
}

let client: Composio | null = null;
function getComposio(): Composio {
  if (!process.env.COMPOSIO_API_KEY) {
    throw new Error("Gmail is not configured: set COMPOSIO_API_KEY in .env.");
  }
  if (!client) client = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
  return client;
}

/**
 * Find (or create) a Composio-managed Gmail auth config and return its id.
 * Honors COMPOSIO_GMAIL_AUTH_CONFIG_ID if set; otherwise reuses an existing
 * managed Gmail config or creates one. This is what lets the user connect with
 * only an API key — no dashboard step.
 */
export async function ensureGmailAuthConfig(): Promise<string> {
  if (process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID) {
    return process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID;
  }
  const composio = getComposio();
  const existing = await composio.authConfigs.list({ toolkit: "gmail" });
  const reusable = existing.items?.find((c) => c.toolkit?.slug?.toLowerCase() === "gmail");
  if (reusable) return reusable.id;

  const created = await composio.authConfigs.create("gmail", {
    type: AuthConfigTypes.COMPOSIO_MANAGED,
    name: "Budget Tracker Gmail",
  });
  return created.id;
}

/**
 * Start the OAuth flow: returns the hosted Google consent URL to redirect the
 * user to. Composio sends them to `callbackUrl` afterward with the result.
 */
export async function initiateGmailConnection(
  callbackUrl: string,
): Promise<{ redirectUrl: string | null; id: string }> {
  const composio = getComposio();
  const authConfigId = await ensureGmailAuthConfig();
  // `link` (not the deprecated `initiate`) is the supported call for
  // Composio-managed OAuth auth configs.
  const req = await composio.connectedAccounts.link(getUserId(), authConfigId, {
    callbackUrl,
  });
  return { redirectUrl: req.redirectUrl ?? null, id: req.id };
}

/** Persist the connection after the user consents (called from the callback). */
export async function finalizeGmailConnection(
  connectedAccountId: string,
): Promise<string | null> {
  let email: string | null = null;
  try {
    const account = await getComposio().connectedAccounts.get(connectedAccountId);
    // Best-effort: the mailbox address lives in different places across
    // toolkits/versions; probe the common ones without failing the connect.
    const data = account as unknown as Record<string, unknown>;
    email =
      pluck(data, "params", "email") ??
      pluck(data, "data", "email") ??
      (typeof data.email === "string" ? data.email : null);
  } catch {
    // Non-fatal — we can show "Connected" without the address.
  }

  await prisma.gmailConnection.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      composioUserId: getUserId(),
      connectedAccountId,
      email,
    },
    update: { composioUserId: getUserId(), connectedAccountId, email },
  });
  return email;
}

function pluck(obj: Record<string, unknown>, a: string, b: string): string | null {
  const inner = obj[a];
  if (inner && typeof inner === "object") {
    const v = (inner as Record<string, unknown>)[b];
    if (typeof v === "string") return v;
  }
  return null;
}

export interface GmailStatus {
  connected: boolean;
  configured: boolean;
  email: string | null;
  lastSyncAt: Date | null;
}

export async function getGmailStatus(): Promise<GmailStatus> {
  const c = await prisma.gmailConnection.findUnique({
    where: { id: "singleton" },
    select: { email: true, lastSyncAt: true, connectedAccountId: true },
  });
  return {
    connected: Boolean(c?.connectedAccountId),
    configured: isGmailConfigured(),
    email: c?.email ?? null,
    lastSyncAt: c?.lastSyncAt ?? null,
  };
}

/** Delete the Composio connection (best-effort) and forget it locally. */
export async function disconnectGmail(): Promise<void> {
  const c = await prisma.gmailConnection.findUnique({ where: { id: "singleton" } });
  if (c?.connectedAccountId) {
    try {
      await getComposio().connectedAccounts.delete(c.connectedAccountId);
    } catch {
      // Best-effort; we still drop the local record.
    }
  }
  await prisma.gmailConnection.delete({ where: { id: "singleton" } }).catch(() => {});
}

/**
 * Gmail search query. With an explicit `daysBack`, look that many days back
 * regardless of the last sync (the user asked for it). Otherwise sync
 * incrementally: after the first run, add `after:` (with a 2-day safety overlap)
 * so we only pull recent mail. Dedupe downstream makes any overlap harmless.
 */
function buildQuery(lastSyncAt: Date | null, daysBack?: number): string {
  const base = process.env.GMAIL_SEARCH_QUERY ?? "from:cibc.com";
  if (daysBack && daysBack > 0) {
    return `${base} newer_than:${Math.floor(daysBack)}d`;
  }
  if (lastSyncAt) {
    const afterSec = Math.floor(lastSyncAt.getTime() / 1000) - 2 * 24 * 3600;
    return `${base} after:${afterSec}`;
  }
  return `${base} newer_than:30d`;
}

export interface FetchResult {
  txns: RawTxn[];
  scanned: number;
  /** Raw tool response, surfaced by the poller's --dry-run for field tuning. */
  raw?: unknown;
}

/** Read recent CIBC alert emails via Composio and parse them into transactions.
 * `daysBack` overrides the incremental window when the user picks a range. */
export async function fetchAlertTransactions(daysBack?: number): Promise<FetchResult> {
  const conn = await prisma.gmailConnection.findUnique({
    where: { id: "singleton" },
    select: { lastSyncAt: true, connectedAccountId: true },
  });
  if (!conn?.connectedAccountId) throw new Error("Gmail is not connected.");

  const composio = getComposio();
  const result = await composio.tools.execute("GMAIL_FETCH_EMAILS", {
    userId: getUserId(),
    arguments: {
      query: buildQuery(conn.lastSyncAt, daysBack),
      max_results: 25,
      include_payload: true,
      verbose: true,
    },
    // Composio v3 requires a pinned toolkit version for manual execution;
    // we opt into "latest" instead. Safe here because the response readers
    // below are defensive about field names.
    dangerouslySkipVersionCheck: true,
  });

  const messages = extractMessages(result);
  const txns: RawTxn[] = [];
  for (const m of messages) {
    const alert = parseAlertEmail(emailText(m), { referenceDate: emailDate(m) });
    if (alert) txns.push(alert);
  }
  return { txns, scanned: messages.length, raw: result };
}

export async function markSynced(): Promise<void> {
  await prisma.gmailConnection
    .update({ where: { id: "singleton" }, data: { lastSyncAt: new Date() } })
    .catch(() => {});
}

// --- Response shaping ------------------------------------------------------
// GMAIL_FETCH_EMAILS' payload shape can vary by SDK version, so these readers
// are deliberately defensive. The poller's --dry-run prints the raw response so
// the field names can be confirmed against a live first fetch.

type AnyRecord = Record<string, unknown>;

function extractMessages(result: unknown): AnyRecord[] {
  const r = (result ?? {}) as AnyRecord;
  const data = (r.data ?? r) as AnyRecord;
  const candidates = [
    data.messages,
    (data.response_data as AnyRecord | undefined)?.messages,
    data.emails,
    data.items,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as AnyRecord[];
  }
  return [];
}

function emailText(m: AnyRecord): string {
  const parts = [
    str(m.subject),
    str(m.sender) || str(m.from),
    str(m.messageText) || str(m.snippet) || str(m.preview && (m.preview as AnyRecord).body),
    str(m.body) || decodePayload(m.payload),
  ].filter(Boolean);
  return parts.join("\n");
}

function emailDate(m: AnyRecord): Date | undefined {
  const ts = m.messageTimestamp ?? m.internalDate ?? m.date;
  if (typeof ts === "string") {
    const ms = /^\d+$/.test(ts) ? Number(ts) : Date.parse(ts);
    if (Number.isFinite(ms)) return new Date(ms);
  }
  if (typeof ts === "number") return new Date(ts);
  return undefined;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Decode a Gmail-style payload (base64url body, possibly nested in parts).
function decodePayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as AnyRecord;
  const bodyData = (p.body as AnyRecord | undefined)?.data;
  if (typeof bodyData === "string") {
    try {
      return Buffer.from(bodyData, "base64url").toString("utf8");
    } catch {
      return "";
    }
  }
  if (Array.isArray(p.parts)) {
    return (p.parts as unknown[]).map(decodePayload).join("\n");
  }
  return "";
}

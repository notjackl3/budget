// Persistent record of Gmail message IDs we've already surfaced in the email
// picker. Lets a repeat fetch skip emails the user has already seen, instead of
// re-listing the same receipts every time.
//
// Backed by a small JSON file under the OS temp dir — a "fetched emails" cache,
// not authoritative data. Losing it just means a future fetch re-shows recent
// mail (dedupe on ingest keeps that harmless), so cheap local persistence is the
// right tradeoff over a DB table.

import { promises as fs } from "fs";
import os from "os";
import path from "path";

const CACHE_DIR = path.join(os.tmpdir(), "budget-cache");
const CACHE_FILE = path.join(CACHE_DIR, "fetched-emails.json");

// Keep the file bounded — most-recently-seen IDs win once we pass this.
const MAX_IDS = 2000;

interface CacheShape {
  ids: string[];
}

/** Index-based fallback IDs aren't stable across fetches, so never cache them. */
function isStableId(id: string): boolean {
  return Boolean(id) && !id.startsWith("idx-");
}

async function readCache(): Promise<string[]> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw) as CacheShape;
    return Array.isArray(parsed.ids) ? parsed.ids : [];
  } catch {
    // Missing/corrupt file — treat as an empty cache.
    return [];
  }
}

/** IDs of emails already shown in a previous fetch. */
export async function getSeenEmailIds(): Promise<Set<string>> {
  return new Set(await readCache());
}

/** Record these message IDs as seen so future fetches skip them. New IDs are
 * appended (kept newest-last); the list is trimmed to {@link MAX_IDS}. */
export async function markEmailsSeen(ids: string[]): Promise<void> {
  const stable = ids.filter(isStableId);
  if (stable.length === 0) return;
  const existing = await readCache();
  // Drop any we're re-adding, then append so the freshest land at the tail.
  const fresh = new Set(stable);
  const merged = existing.filter((id) => !fresh.has(id)).concat(stable);
  const trimmed = merged.slice(-MAX_IDS);
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify({ ids: trimmed }), "utf8");
  } catch {
    // Best-effort — a write failure just means we may re-show these later.
  }
}

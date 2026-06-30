import {
  format,
  getISOWeek,
  getISOWeekYear,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
} from "date-fns";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-06" from a Date (derived, never stored). */
export function monthKey(date: Date): string {
  return format(date, "yyyy-MM");
}

/** "2026-W24" ISO week key (derived, never stored). */
export function weekKey(date: Date): string {
  return `${getISOWeekYear(date)}-W${String(getISOWeek(date)).padStart(2, "0")}`;
}

/** "June 2026" friendly label for a "YYYY-MM" key. */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Short "Jun 2026" label for a "YYYY-MM" key. */
export function monthShortLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

/** 0-based month index for a full or 3-letter month name. */
export function monthNameToIndex(name: string): number {
  const lower = name.trim().toLowerCase();
  return MONTHS.findIndex(
    (m) => m.toLowerCase() === lower || m.toLowerCase().startsWith(lower),
  );
}

/**
 * Whether `ymd` is a real calendar date in strict "YYYY-MM-DD" form. Rejects
 * malformed strings and overflow dates (e.g. "2026-02-30") that JS would
 * silently roll forward.
 */
export function isValidYmd(ymd: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return false;
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const d = Number(match[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, mo - 1, d, 12, 0, 0, 0);
  return (
    dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
  );
}

/**
 * Convert a strict "YYYY-MM-DD" string to a Date at local noon. Noon avoids the
 * calendar day shifting under DST/timezone conversions. Throws on a malformed
 * or impossible date so bad input can never be persisted (the single
 * validation chokepoint for every write path).
 */
export function ymdToDate(ymd: string): Date {
  if (!isValidYmd(ymd)) {
    throw new Error(`Invalid date "${ymd}". Expected YYYY-MM-DD.`);
  }
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** Local "YYYY-MM-DD" for a Date (never uses UTC, so the day can't drift). */
export function dateToYMD(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function monthRange(key: string): { start: Date; end: Date } {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return { start: startOfMonth(d), end: endOfMonth(d) };
}

/** Add `n` whole months (can be negative) to a "YYYY-MM" key, returning a new
 *  "YYYY-MM" key. Used to walk a projection's month index forward from today. */
export function addMonthsToKey(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export { startOfMonth, endOfMonth, startOfWeek, endOfWeek };

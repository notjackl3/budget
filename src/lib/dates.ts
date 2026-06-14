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
 * Convert a "YYYY-MM-DD" string to a Date at local noon. Noon avoids the
 * calendar day shifting under DST/timezone conversions.
 */
export function ymdToDate(ymd: string): Date {
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

export { startOfMonth, endOfMonth, startOfWeek, endOfWeek };

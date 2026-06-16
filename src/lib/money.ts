// Money is stored as integer cents everywhere to avoid floating-point drift.

/** Parse a money string like "1,363.85" or "41.39-" (trailing minus = credit). */
export function parseAmountToCents(raw: string): number {
  const trimmed = raw.trim();
  const negative = /^-/.test(trimmed) || /-$/.test(trimmed);
  const digits = trimmed.replace(/[^0-9.]/g, "");
  const value = Math.round(parseFloat(digits) * 100);
  if (!Number.isFinite(value)) return 0;
  return negative ? -value : value;
}

/** Convert dollars (number or numeric string) to integer cents. Non-finite
 * input (NaN/Infinity) collapses to 0 so it can never reach an Int column. */
export function dollarsToCents(dollars: number | string): number {
  // Strip thousands separators so "2,816.66" parses as 2816.66 rather than
  // collapsing to 2 (parseFloat stops at the comma).
  const n =
    typeof dollars === "string"
      ? parseFloat(dollars.replace(/,/g, ""))
      : dollars;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Cents -> plain decimal string, e.g. 123456 -> "1234.56" (for inputs). */
export function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Format cents for display, e.g. formatMoney(123456, "C$") -> "C$1,234.56".
 * Negative values render as "-C$5.00".
 */
export function formatMoney(cents: number, symbol = "C$"): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const formatted = (abs / 100).toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${negative ? "-" : ""}${symbol}${formatted}`;
}

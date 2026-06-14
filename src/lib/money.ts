// Money is stored as integer cents everywhere to avoid floating-point drift.

/** Parse a money string like "1,363.85" or "41.39-" (trailing minus = credit). */
export function parseAmountToCents(raw: string): number {
  const trimmed = raw.trim();
  const negative = /^-/.test(trimmed) || /-$/.test(trimmed);
  const digits = trimmed.replace(/[^0-9.]/g, "");
  const value = Math.round(parseFloat(digits) * 100);
  if (Number.isNaN(value)) return 0;
  return negative ? -value : value;
}

/** Convert dollars (number or numeric string) to integer cents. */
export function dollarsToCents(dollars: number | string): number {
  const n = typeof dollars === "string" ? parseFloat(dollars) : dollars;
  if (Number.isNaN(n)) return 0;
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

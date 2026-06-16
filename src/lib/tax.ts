// Per-job tax helpers. There are no province brackets here on purpose — the
// user's employers sit in different jurisdictions, so tax is derived purely from
// the gross and net amounts they enter: tax = gross - net, and the effective
// rate = tax / gross. All amounts are integer cents at the job's pay cadence.

import { dollarsToCents, centsToDecimalString } from "./money";

export interface JobTax {
  /** Tax withheld per pay period, in cents. 0 when gross is unknown or <= net. */
  taxCents: number;
  /** Effective rate, 0..1. 0 when gross is unknown or <= net. */
  rate: number;
}

/** Tax withheld and effective rate implied by a gross/net pair. */
export function taxFromGrossNet(
  grossCents: number | null | undefined,
  netCents: number,
): JobTax {
  if (
    grossCents == null ||
    !Number.isFinite(grossCents) ||
    grossCents <= netCents
  ) {
    return { taxCents: 0, rate: 0 };
  }
  const taxCents = grossCents - netCents;
  return { taxCents, rate: taxCents / grossCents };
}

/**
 * Net (take-home) implied by a gross amount and an effective tax rate. `rate` is
 * a fraction in 0..1 (e.g. 0.27 for 27%); out-of-range values are clamped.
 */
export function netFromGrossRate(grossCents: number, rate: number): number {
  const g = Number.isFinite(grossCents) ? grossCents : 0;
  const r = Number.isFinite(rate) ? Math.min(Math.max(rate, 0), 1) : 0;
  return Math.round(g * (1 - r));
}

// --------------------------------------------------------- Gross/Net/Tax triad
//
// Pay is three linked numbers — Gross, Net, Tax — bound by Gross = Net + Tax.
// The user fills any two and the third is derived. `priority` lists the fields
// most recently edited first, so when all three carry a value we know which two
// to trust and which one to recompute. Persisted data is always (net, gross?).

export type TaxField = "gross" | "net" | "tax";

export interface ResolvedTriad {
  gross: string; // normalized display strings (empty = unset)
  net: string;
  tax: string;
  netCents: number;
  grossCents: number | null; // null = take-home only (no tax tracked)
  taxCents: number;
}

export function resolveTriad(
  grossStr: string,
  netStr: string,
  taxStr: string,
  priority: TaxField[],
): ResolvedTriad {
  const raw: Record<TaxField, string> = {
    gross: grossStr,
    net: netStr,
    tax: taxStr,
  };
  const has = (f: TaxField) => raw[f].trim() !== "";
  // The two authoritative fields are the highest-priority filled ones.
  const ordered = ([...priority, "gross", "net", "tax"] as TaxField[]).filter(
    (f, i, a) => a.indexOf(f) === i,
  );
  const sources = ordered.filter(has).slice(0, 2);
  const set = new Set(sources);
  const g = dollarsToCents(grossStr);
  const n = dollarsToCents(netStr);
  const t = dollarsToCents(taxStr);

  let netCents = 0;
  let grossCents: number | null = null;
  if (set.has("gross") && set.has("net")) {
    grossCents = g;
    netCents = n;
  } else if (set.has("gross") && set.has("tax")) {
    grossCents = g;
    netCents = g - t;
  } else if (set.has("net") && set.has("tax")) {
    netCents = n;
    grossCents = n + t;
  } else if (sources.length === 1) {
    // Only one number known — treat it as take-home, no tax.
    netCents = sources[0] === "gross" ? g : sources[0] === "net" ? n : 0;
    grossCents = null;
  }

  const taxCents = grossCents != null ? Math.max(0, grossCents - netCents) : 0;
  return {
    gross: grossCents != null ? centsToDecimalString(grossCents) : "",
    net: centsToDecimalString(netCents),
    tax:
      grossCents != null && taxCents > 0 ? centsToDecimalString(taxCents) : "",
    netCents,
    grossCents,
    taxCents,
  };
}

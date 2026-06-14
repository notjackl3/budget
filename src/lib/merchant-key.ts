// Derive a stable "merchant key" from a transaction description so the same
// store recognised across different days/statements collapses to one key.
//
// The same merchant shows up with small variations between charges — a trailing
// store number, an order id, a city, different casing or punctuation
// ("TIM HORTONS #0421", "TIM HORTONS 1187 TORONTO"). We normalise all of those
// away: upper-case, split on non-alphanumerics, and drop any purely-numeric
// tokens (store numbers, dates, order ids). What's left is the merchant's word
// tokens, which stay constant across visits.
//
// Pure and side-effect free so it's trivially testable and usable on both the
// client and server.
export function merchantKey(description: string): string {
  return description
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ") // punctuation / symbols -> spaces
    .trim()
    .split(" ")
    .filter((tok) => tok.length > 0 && !/^\d+$/.test(tok)) // drop store numbers, dates, order ids
    .join(" ");
}

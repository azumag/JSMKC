/**
 * Strictly parse a manual-score text input into a non-negative integer.
 *
 * Rationale: `Number.parseInt` silently truncates fractional and exponential
 * notation ("12.5" → 12, "1e2" → 1), and those truncated values still pass
 * `Number.isInteger` / non-negative checks. For admin override flows where a
 * mis-typed value decides a match outcome, that silent coercion is unsafe.
 *
 * This helper only accepts a digit string (optionally surrounded by
 * whitespace) so any decimal point, sign, exponent, or non-numeric character
 * is rejected up-front.
 *
 * @returns the parsed integer, or `null` for any invalid input.
 */
export function parseManualScore(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

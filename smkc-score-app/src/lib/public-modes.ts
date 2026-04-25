/**
 * Independent per-mode publish state for the four qualification modes.
 *
 * `publicModes` on the Tournament is an unordered set serialized as a JSON
 * array. Each mode's published state is independent of the others —
 * publishing or unpublishing one mode does not affect any other mode.
 *
 * MODE_REVEAL_ORDER is the canonical mode list and the display order; it is
 * NOT a sequencing constraint on the stored value.
 */
export const MODE_REVEAL_ORDER = ["ta", "bm", "mr", "gp"] as const;
export type RevealableMode = (typeof MODE_REVEAL_ORDER)[number];

const REVEALABLE_SET: ReadonlySet<string> = new Set(MODE_REVEAL_ORDER);

function isRevealableMode(value: unknown): value is RevealableMode {
  return typeof value === "string" && REVEALABLE_SET.has(value);
}

/**
 * Returns `modes ∪ {mode}`, normalized: only valid modes are kept,
 * duplicates are removed, and the result is sorted by MODE_REVEAL_ORDER
 * for stable storage and readable audit logs.
 */
export function addPublicMode(
  modes: readonly string[],
  mode: RevealableMode
): RevealableMode[] {
  const set = new Set<RevealableMode>();
  for (const m of modes) {
    if (isRevealableMode(m)) set.add(m);
  }
  set.add(mode);
  return MODE_REVEAL_ORDER.filter((m) => set.has(m));
}

/**
 * Returns `modes \ {mode}`, normalized: only valid modes are kept,
 * duplicates are removed, sorted by MODE_REVEAL_ORDER.
 */
export function removePublicMode(
  modes: readonly string[],
  mode: RevealableMode
): RevealableMode[] {
  const set = new Set<RevealableMode>();
  for (const m of modes) {
    if (isRevealableMode(m) && m !== mode) set.add(m);
  }
  return MODE_REVEAL_ORDER.filter((m) => set.has(m));
}

/**
 * True iff `modes` is an array of valid mode names with no duplicates.
 * Order is irrelevant. Used by the API to validate `publicModes` payloads.
 */
export function isValidPublicModes(modes: readonly unknown[]): boolean {
  const seen = new Set<string>();
  for (const m of modes) {
    if (!isRevealableMode(m)) return false;
    if (seen.has(m)) return false;
    seen.add(m);
  }
  return true;
}

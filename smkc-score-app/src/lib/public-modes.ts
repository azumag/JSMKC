/**
 * Sequential publication order for qualification modes.
 *
 * Admins publish modes to non-admin viewers one stage at a time, matching the
 * tournament flow (TA → BM → MR → GP). A mode can only be public if every mode
 * earlier in this list is also public, so `publicModes` stored on the
 * Tournament must always be a prefix of this list.
 *
 * Publishing mode X ⇒ publish X and every earlier mode.
 * Unpublishing mode X ⇒ unpublish X and every later mode (cascade).
 */
export const MODE_REVEAL_ORDER = ["ta", "bm", "mr", "gp"] as const;
export type RevealableMode = (typeof MODE_REVEAL_ORDER)[number];

/** Prefix of {@link MODE_REVEAL_ORDER} up to and including `mode`. */
export function publishMode(mode: RevealableMode): RevealableMode[] {
  const idx = MODE_REVEAL_ORDER.indexOf(mode);
  return MODE_REVEAL_ORDER.slice(0, idx + 1);
}

/** Prefix of {@link MODE_REVEAL_ORDER} strictly before `mode` (cascades unpublish). */
export function unpublishMode(mode: RevealableMode): RevealableMode[] {
  const idx = MODE_REVEAL_ORDER.indexOf(mode);
  return MODE_REVEAL_ORDER.slice(0, idx);
}

/**
 * True iff `modes` is a valid prefix of {@link MODE_REVEAL_ORDER}: no gaps,
 * canonical order, no duplicates. Used by the API to reject non-sequential
 * `publicModes` payloads from clients.
 */
export function isSequentialPrefix(modes: readonly string[]): boolean {
  if (modes.length > MODE_REVEAL_ORDER.length) return false;
  for (let i = 0; i < modes.length; i++) {
    if (modes[i] !== MODE_REVEAL_ORDER[i]) return false;
  }
  return true;
}

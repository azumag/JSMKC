/**
 * Pure tournament-phase resolver for the OBS dashboard footer.
 *
 * Tournaments can run all four modes (TA / BM / MR / GP) in parallel, often
 * at different phases. The dashboard surfaces a single combined label —
 * "the most-progressed phase across the tournament" — so producers can show
 * one source of truth in the broadcast footer.
 *
 * The function is intentionally I/O-free: the route handler does the queries
 * and feeds primitive inputs in, the same pattern used by `buildOverlayEvents`.
 * That keeps the decision tree unit-testable without Prisma.
 */

import type { OverlayMode } from "./types";

/** Decision-tree input. All fields come from a handful of cheap DB lookups. */
export interface ComputeCurrentPhaseInput {
  /** Whether qualification has been confirmed for the tournament as a whole. */
  qualificationConfirmed: boolean;
  /**
   * The most-advanced TA stage that has any entries. `"qualification"` when
   * no phase rows exist yet — matches the contract of the existing
   * `getPhaseStatus()` helper in `src/lib/ta/finals-phase-manager.ts`.
   */
  taCurrentPhase: "qualification" | "phase1" | "phase2" | "phase3";
  /**
   * Round number of the latest TTPhaseRound row in `taCurrentPhase`, or null
   * if none exist (e.g. the phase has been entered via TTEntry but no round
   * has been started yet).
   */
  taLatestPhaseRoundNumber: number | null;
  /**
   * The `round` column of the most recently created BM/MR/GP `stage='finals'`
   * match, across all three modes. Null when no finals match exists yet.
   */
  latestFinalsRound: string | null;
  /**
   * Which 2P mode (BM/MR/GP) the `latestFinalsRound` belongs to. Used to look
   * up the matching format ("First to 5" etc.) in `computeCurrentPhaseFormat`.
   * Null when there is no finals match yet, or when the latest match has no mode.
   */
  latestFinalsMode?: OverlayMode | null;
}

/**
 * Map a raw `round` column value (as written by the bracket generator in
 * `src/lib/double-elimination.ts`) to an English label suitable for the
 * footer. Unknown strings fall through unchanged so a future bracket variant
 * doesn't silently disappear from the broadcast.
 */
const FINALS_ROUND_LABEL: Record<string, string> = {
  qf: "Quarter Final",
  winners_qf: "Winners Quarter Final",
  sf: "Semi Final",
  winners_sf: "Winners Semi Final",
  winners_final: "Winners Final",
  losers_r1: "Losers Round 1",
  losers_r2: "Losers Round 2",
  losers_r3: "Losers Round 3",
  losers_r4: "Losers Round 4",
  losers_sf: "Losers Semi Final",
  losers_final: "Losers Final",
  grand_final: "Grand Final",
  grand_final_reset: "Grand Final Reset",
};

function labelFinalsRound(round: string): string {
  return FINALS_ROUND_LABEL[round] ?? round;
}

/**
 * Resolve the current tournament phase string.
 *
 * Branches in priority order — first match wins:
 *  1. Any BM/MR/GP finals match exists       → `Finals <round>`
 *  2. TA has reached phase 3                 → `Time Attack Phase 3 Round <n>`
 *  3. TA is in phase 2                       → `Time Attack Phase 2 Round <n>`
 *  4. TA is in phase 1                       → `Time Attack Phase 1 Round <n>`
 *  5. Qualification has been confirmed       → `Qualification Locked`
 *  6. Default                                → `Qualification`
 */
export function computeCurrentPhase(input: ComputeCurrentPhaseInput): string {
  const {
    qualificationConfirmed,
    taCurrentPhase,
    taLatestPhaseRoundNumber,
    latestFinalsRound,
    latestFinalsMode,
  } = input;

  if (latestFinalsRound) {
    return `Finals ${labelFinalsRound(latestFinalsRound)}`;
  }
  if (taCurrentPhase === "phase3") {
    return taLatestPhaseRoundNumber
      ? `Time Attack Phase 3 Round ${taLatestPhaseRoundNumber}`
      : "Time Attack Phase 3";
  }
  if (taCurrentPhase === "phase2") {
    return taLatestPhaseRoundNumber
      ? `Time Attack Phase 2 Round ${taLatestPhaseRoundNumber}`
      : "Time Attack Phase 2";
  }
  if (taCurrentPhase === "phase1") {
    return taLatestPhaseRoundNumber
      ? `Time Attack Phase 1 Round ${taLatestPhaseRoundNumber}`
      : "Time Attack Phase 1";
  }
  if (qualificationConfirmed) {
    // Interregnum: qualification locked but barrage/finals haven't started
    // anywhere yet. Visually distinct from the live qualification state.
    return "Qualification Locked";
  }
  return "Qualification";
}

/**
 * Build a human-readable match label for the overlay footer (issue #649).
 *
 * Called by the "配信に反映" handler in BM/MR/GP finals pages to construct
 * the `overlayMatchLabel` stored in the DB. The label mirrors the format
 * used by `computeCurrentPhase` so the footer stays visually consistent
 * whether it shows the auto-computed phase or an admin-pinned one.
 *
 * @param roundKey   - The raw `round` value from the DB (e.g. "winners_qf")
 * @param roundNames - Locale map from the API (e.g. { winners_qf: "Winners Quarter Final" })
 * @param mode       - Accepted for backward-compatible call sites; footer labels
 *                     intentionally omit BM/MR/GP mode names.
 */
export function buildMatchLabel(
  roundKey: string | null | undefined,
  roundNames: Record<string, string>,
  mode?: OverlayMode,
): string {
  void mode;
  if (!roundKey) return "Finals";
  const roundName = FINALS_ROUND_LABEL[roundKey] ?? roundNames[roundKey] ?? roundKey;
  return roundName ? `Finals ${roundName}` : "Finals";
}

/**
 * Format ("First To" / equivalent) string shown next to the phase label —
 * for example, BM bracket finals are best-of-9 / First to 5. Returns `null` when
 * the active phase has no meaningful FT value (e.g. TA tournaments are
 * scored by accumulated time, GP runs are scored by points across races).
 *
 * Kept as its own function so the dashboard can drop the FT badge cleanly
 * when there is nothing to show — joining it onto `computeCurrentPhase`'s
 * label would force a placeholder in the no-FT case.
 */
export function computeCurrentPhaseFormat(
  input: ComputeCurrentPhaseInput,
): string | null {
  const { latestFinalsRound, latestFinalsMode } = input;

  // BM / MR finals are double-elimination best-of-9 (first to 5) per §4. GP
  // finals are point-totals over races and have no "first to N" notion.
  if (latestFinalsRound && latestFinalsMode) {
    if (latestFinalsMode === "bm" || latestFinalsMode === "mr") return "First to 5";
    return null;
  }

  // No FT label for qualification, barrage, or TA finals — those are scored
  // by sums (points / time) rather than win-count thresholds.
  return null;
}

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

const MODE_LABEL: Partial<Record<OverlayMode, string>> = {
  ta: "TA",
  bm: "BM",
  mr: "MR",
  gp: "GP",
};

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
   * up the matching format ("FT5" etc.) in `computeCurrentPhaseFormat`. Null
   * when there is no finals match yet, or when the latest match has no mode.
   */
  latestFinalsMode?: OverlayMode | null;
}

/**
 * Map a raw `round` column value (as written by the bracket generator in
 * `src/lib/double-elimination.ts`) to a Japanese label suitable for the
 * footer. Unknown strings fall through unchanged so a future bracket variant
 * doesn't silently disappear from the broadcast.
 */
const FINALS_ROUND_LABEL: Record<string, string> = {
  qf: "QF",
  winners_qf: "QF",
  sf: "SF",
  winners_sf: "SF",
  winners_final: "勝者決勝",
  losers_r1: "敗者R1",
  losers_r2: "敗者R2",
  losers_r3: "敗者R3",
  losers_r4: "敗者R4",
  losers_sf: "敗者準決勝",
  losers_final: "敗者決勝",
  grand_final: "グランドF",
  grand_final_reset: "リセット",
};

function labelFinalsRound(round: string): string {
  return FINALS_ROUND_LABEL[round] ?? round;
}

/**
 * Resolve the current tournament phase string.
 *
 * Branches in priority order — first match wins:
 *  1. Any BM/MR/GP finals match exists       → `<mode> 決勝 <Japanese round>`
 *  2. TA has reached phase 3                 → `TA フェーズ3 ラウンド<n>`
 *  3. TA is in phase 2                       → `TA フェーズ2 ラウンド<n>`
 *  4. TA is in phase 1                       → `TA フェーズ1 ラウンド<n>`
 *  5. Qualification has been confirmed       → `予選確定`
 *  6. Default                                → `予選`
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
    const modePrefix = latestFinalsMode ? `${MODE_LABEL[latestFinalsMode] ?? latestFinalsMode} ` : "";
    return `${modePrefix}決勝 ${labelFinalsRound(latestFinalsRound)}`;
  }
  if (taCurrentPhase === "phase3") {
    return taLatestPhaseRoundNumber
      ? `TA フェーズ3 ラウンド${taLatestPhaseRoundNumber}`
      : "TA フェーズ3";
  }
  if (taCurrentPhase === "phase2") {
    return taLatestPhaseRoundNumber
      ? `TA フェーズ2 ラウンド${taLatestPhaseRoundNumber}`
      : "TA フェーズ2";
  }
  if (taCurrentPhase === "phase1") {
    return taLatestPhaseRoundNumber
      ? `TA フェーズ1 ラウンド${taLatestPhaseRoundNumber}`
      : "TA フェーズ1";
  }
  if (qualificationConfirmed) {
    // Interregnum: qualification locked but barrage/finals haven't started
    // anywhere yet. Visually distinct from the live "予選" state.
    return "予選確定";
  }
  return "予選";
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
 * @param roundNames - Locale map from the API (e.g. { winners_qf: "QF" })
 * @param mode       - Optional mode prefix for footer clarity (BM/MR/GP)
 */
export function buildMatchLabel(
  roundKey: string | null | undefined,
  roundNames: Record<string, string>,
  mode?: OverlayMode,
): string {
  const modePrefix = mode ? `${MODE_LABEL[mode] ?? mode} ` : "";
  if (!roundKey) return `${modePrefix}決勝`;
  const roundName = roundNames[roundKey] ?? roundKey;
  return roundName ? `${modePrefix}決勝 ${roundName}` : `${modePrefix}決勝`;
}

/**
 * Format ("First To" / equivalent) string shown next to the phase label —
 * for example, BM bracket finals are best-of-9 / FT5. Returns `null` when
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

  // BM / MR finals are double-elimination best-of-9 (FT5) per §4. GP finals
  // are point-totals over races and have no "first to N" notion.
  if (latestFinalsRound && latestFinalsMode) {
    if (latestFinalsMode === "bm" || latestFinalsMode === "mr") return "FT5";
    return null;
  }

  // No FT label for qualification, barrage, or TA finals — those are scored
  // by sums (points / time) rather than win-count thresholds.
  return null;
}

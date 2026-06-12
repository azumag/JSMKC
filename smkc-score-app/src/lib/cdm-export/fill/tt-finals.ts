/**
 * CDM "TT Finals" fill map (pure function: app data → CdmCellWrite[]).
 *
 * The TT Finals sheet is a 24-row life ledger spanning up to 40 round blocks
 * (TT_FINALS_MAX_ROUNDS). Standings, the per-round name ordering and the
 * running "Left" (lives remaining) column are Excel dynamic-array formulas; the
 * workbook accepts only three human inputs per round block — the per-player
 * Gain, the per-player Time and the per-player Lost flag — plus the round-1
 * initial "Left" column and the per-round display header. See
 * docs/cdm-export-design.md §3.5 and cdm-constants.ts for the verified
 * geometry, and tt-lives-replay.ts for how each round's inputs are reconstructed
 * from the TA-finals engine state.
 *
 * Column geometry (verified against /tmp/cdm-analysis/sheet2025/sheet_TT_Finals.txt):
 *   round r (1-based) input block first column  = 1 + 13*(r-1)  (A, N, AA, …)
 *   round r display block first column          = 7 + 13*(r-1)  (G, T, AG, …)
 *   input block:  +0 #(formula) +1 Name(formula) +2 Left +3 Gain +4 Time
 *   display block: +0 #(f) +1 Name(f) +2 Flag(f) +3 Time(f) +4 Lost +5 Left(f)
 *   • Left (+2) is a human input ONLY in round 1 (template C3..C26 = 1). From
 *     round 2 it is the spill formula `=SORT(...)` (dump P3 etc.) and MUST NOT
 *     be written — doing so would corrupt the ledger's life carry.
 *   • The display block's row-1 header cell holds the typed string
 *     `Round {r} - {course full name}`.
 *   • The final standings block TA..TD is pure formulas (Overall Ranking reads
 *     its TT Bonus from there) and is never written.
 *
 * Clearing contract: the template ships with CDM 2025's real data in these
 * input cells (e.g. C3..C26=1, E19..E26=times, K26=1). Every input cell we do
 * not set for a given round must therefore be CLEARED, and every round block
 * the current tournament does not use must be cleared wholesale — otherwise the
 * exported workbook would show last year's finals. We emit clears first and let
 * the SheetWriteBuilder's last-wins Map collapse a "clear then set" into the
 * single set op (so the output array stays one op per cell, matching the
 * one-op-per-ref invariant the patcher and tests rely on).
 */

import {
  TT_FINALS_MAX_ROUNDS,
  TT_FINALS_ROUND_STRIDE,
  TT_FINALS_INPUT_FIRST_COLUMN,
  TT_FINALS_DISPLAY_FIRST_COLUMN,
  TT_FINALS_FIRST_DATA_ROW,
  TT_FINALS_MAX_FINALISTS,
  TT_FINALS_INPUT_LEFT_OFFSET,
  TT_FINALS_INPUT_GAIN_OFFSET,
  TT_FINALS_INPUT_TIME_OFFSET,
  TT_FINALS_DISPLAY_LOST_OFFSET,
  CDM_COURSE_NAMES,
  toColumnLetters,
} from "../cdm-constants";
import { msToCdmTime } from "../time-format";
import type { CdmCellWrite, CdmTournamentData } from "../types";
import { SheetWriteBuilder } from "./sheet-player-order";
import { replayTTFinals, type TTFinalsReplayRound } from "./tt-lives-replay";

const SHEET = "TT Finals" as const;

/** Last data row of a block (inclusive): 24 finalists → rows 3..26. */
const LAST_DATA_ROW = TT_FINALS_FIRST_DATA_ROW + TT_FINALS_MAX_FINALISTS - 1;

/**
 * The 1-based column numbers of one round block's input cells and the display
 * "Lost" cell. Computed from the verified stride so r=1 → C/D/E + K, r=2 →
 * P/Q/R + X, … (see cdm-constants.ts and the dump).
 */
interface BlockColumns {
  /** Input "Left" column (typed only in round 1). */
  left: number;
  /** Input "Gain" column. */
  gain: number;
  /** Input "Time" column. */
  time: number;
  /** Display "Lost" column. */
  lost: number;
  /** Display block first column — its row-1 cell is the header string. */
  displayFirst: number;
}

function blockColumns(round: number): BlockColumns {
  const inputFirst =
    TT_FINALS_INPUT_FIRST_COLUMN + (round - 1) * TT_FINALS_ROUND_STRIDE;
  const displayFirst =
    TT_FINALS_DISPLAY_FIRST_COLUMN + (round - 1) * TT_FINALS_ROUND_STRIDE;
  return {
    left: inputFirst + TT_FINALS_INPUT_LEFT_OFFSET,
    gain: inputFirst + TT_FINALS_INPUT_GAIN_OFFSET,
    time: inputFirst + TT_FINALS_INPUT_TIME_OFFSET,
    lost: displayFirst + TT_FINALS_DISPLAY_LOST_OFFSET,
    displayFirst,
  };
}

/** A1 ref for (1-based column, 1-based row). */
function ref(column: number, row: number): string {
  return `${toColumnLetters(column)}${row}`;
}

/**
 * Clear all human-input cells of a round block: Gain and Time for every round,
 * the display Lost flag, and (only in round 1) the initial Left column. The
 * display header is cleared too. From round 2 the Left column is a spill formula
 * and is deliberately left untouched.
 */
function clearBlockInputs(builder: SheetWriteBuilder, round: number): void {
  const cols = blockColumns(round);
  // Header (display block row 1): a typed string in the template.
  builder.clear(ref(cols.displayFirst, 1));
  for (let row = TT_FINALS_FIRST_DATA_ROW; row <= LAST_DATA_ROW; row++) {
    if (round === 1) {
      // Left is a human input only in round 1 (initial lives). For r>=2 it is a
      // formula; never clear it.
      builder.clear(ref(cols.left, row));
    }
    builder.clear(ref(cols.gain, row));
    builder.clear(ref(cols.time, row));
    builder.clear(ref(cols.lost, row));
  }
}

/**
 * Write one reconstructed round into its block. Caller has already cleared the
 * block (clear-then-set collapses to a single op per cell via the builder).
 *
 * @param round   the 1-based sheet round number (== array index + 1)
 * @param replay  the reconstructed round from replayTTFinals
 */
function writeRound(
  builder: SheetWriteBuilder,
  round: number,
  replay: TTFinalsReplayRound,
): void {
  const cols = blockColumns(round);

  // --- Header: "Round {r} - {course full name}" -----------------------------
  const courseName = CDM_COURSE_NAMES[replay.course] ?? replay.course;
  builder.setString(ref(cols.displayFirst, 1), `Round ${round} - ${courseName}`);

  // --- Input rows: map each player to its physical row via inputRowOrder. ----
  // inputRowOrder lists players top→bottom for this round's input block. Row of
  // the k-th player = TT_FINALS_FIRST_DATA_ROW + k. Any player beyond
  // TT_FINALS_MAX_FINALISTS cannot be placed (the block only has 24 rows); the
  // universe is capped at 24 upstream so this is defensive.
  const inputOrder = replay.inputRowOrder.slice(0, TT_FINALS_MAX_FINALISTS);
  inputOrder.forEach((playerId, index) => {
    const row = TT_FINALS_FIRST_DATA_ROW + index;

    // Round 1 only: seed the initial life ledger with 1 for every universe row
    // (template C3..C26 = 1). From round 2 the Left cell is a formula and was
    // intentionally not cleared above, so we never touch it here either.
    if (round === 1) {
      builder.setNumber(ref(cols.left, row), 1);
    }

    // Gain: bonus lives granted this round (phase-3 entry top-up / reset). Rows
    // without a grant keep the cleared blank — a blank Gain reads as 0 in the
    // ledger formula `Left = inputLeft + Gain - Lost`.
    const gain = replay.gains.get(playerId);
    if (gain !== undefined && gain !== 0) {
      builder.setNumber(ref(cols.gain, row), gain);
    }

    // Time: a runner writes its MSSCC-encoded time; a universe player who sat
    // the round out writes 0 (the template uses 0 to mean "did not run", which
    // also sorts that row to the top of the display block). A runner with a
    // null time (should not occur for stored results — submitRoundResults
    // requires a numeric time, retries become RETRY_PENALTY_MS) is treated as
    // a non-runner 0, matching how the replay sorts a null time.
    if (replay.participants.has(playerId)) {
      const timeMs = replay.participants.get(playerId) ?? null;
      if (timeMs === null) {
        builder.setNumber(ref(cols.time, row), 0);
      } else {
        builder.setNumber(ref(cols.time, row), msToCdmTime(timeMs));
      }
    } else {
      builder.setNumber(ref(cols.time, row), 0);
    }
  });

  // --- Display rows: Lost flag on the loser's SORTED display row. ------------
  // displayRowOrder lists players top→bottom in the display block (sorted by
  // Time ASC). Lost=1 marks every player that lost a life this round. By
  // construction lostLife ⊆ participants ⊆ displayRowOrder (the replay builds
  // lostLife only from universe participants and displayRowOrder is a
  // permutation of the universe input order), so every loser has a row.
  const displayOrder = replay.displayRowOrder.slice(0, TT_FINALS_MAX_FINALISTS);
  displayOrder.forEach((playerId, index) => {
    if (replay.lostLife.has(playerId)) {
      const row = TT_FINALS_FIRST_DATA_ROW + index;
      builder.setNumber(ref(cols.lost, row), 1);
    }
  });
}

/**
 * Build the "TT Finals" fill map.
 *
 * With no TT-finals data every round block's input cells are cleared so the
 * template's leftover CDM 2025 inputs do not surface in the export. With data,
 * the reconstructed rounds (replayTTFinals) are written into their blocks and
 * any trailing unused blocks are cleared.
 */
export function buildTTFinalsWrites(data: CdmTournamentData): CdmCellWrite[] {
  const builder = new SheetWriteBuilder(SHEET);

  const rounds = replayTTFinals(data);

  for (let round = 1; round <= TT_FINALS_MAX_ROUNDS; round++) {
    // Always clear the block first so unused input cells (and any unused
    // trailing round) drop their leftover template values. For used rounds the
    // subsequent writes overwrite the clears via the builder's last-wins Map.
    clearBlockInputs(builder, round);

    const replay = rounds[round - 1];
    if (replay) {
      writeRound(builder, round, replay);
    }
  }

  return builder.build();
}

/**
 * BM/MR/GP Qualifications fill map — per-player match blocks.
 *
 * Layout verified against /tmp/cdm-analysis/sheet2025/sheet_{BM,MR,GP}_Qualifications.txt:
 *
 *   Block i (0-based) data rows QUAL_BLOCK_FIRST_DATA_ROW + i*QUAL_BLOCK_STRIDE,
 *   for QUAL_BLOCK_DATA_ROWS rows. Block 0 = rows 2..16; row 17 is a repeated
 *   header ('Match','TV #','Player','Name','Score','Name','Player') and MUST NOT
 *   be written or cleared. Block 1 = rows 18..32, … up to 48 blocks (last data
 *   row 768). The owner column V is constant down a block (V2..V16 = 'Drew').
 *
 *   Block i is owned by computeSheetPlayerOrder(quals)[i] — the sheet's G2#
 *   spill order (group A by app seeding asc, then B, C, D). Each qualification
 *   match appears once in EACH of its two players' blocks, written from that
 *   owner's perspective.
 *
 *   Per row (owner perspective), the INPUT cells are:
 *     S  matchNumber
 *     T  tvNumber                     (null -> clear)
 *     U  owner side                   (owner is p1 -> player1Side??1, else player2Side??2)
 *     V  owner nickname
 *     W  owner score                  (BM/MR: score1/score2; GP: points1/points2)
 *     Z  opponent nickname            (BREAK_PLAYER_ID -> 'Break')
 *     AA opponent side
 *     Y  GP ONLY: opponent points     (BM/MR keep the template formula =4-W)
 *     AB..AE  MR ONLY: assignedCourses[0..3]   /   AB GP ONLY: cup name
 *
 *   Never touched: X (literal '-'), the BM/MR Y formula, the W/T/L formula
 *   columns (BM AB/AC/AD, MR AF/AG/AH, GP AC/AD/AE), the standings block E..Q,
 *   and everything from AF onward (sorted-rank / out-order spills). Writing
 *   there is exactly what produced the old exporter's #SPILL! corruption.
 *
 * Incomplete matches clear the score cell(s) (never write a bogus 0); the
 * template formulas treat blank scores as "not played yet". Unused rows within
 * an owned block and every cell of an unused block are cleared so a re-used
 * template never keeps stale data.
 */

import { createLogger } from "@/lib/logger";
import { BREAK_PLAYER_ID } from "@/lib/round-robin";
import {
  CDM_QUALIFICATION_SHEETS,
  QUAL_BLOCK_FIRST_DATA_ROW,
  QUAL_BLOCK_STRIDE,
  QUAL_BLOCK_DATA_ROWS,
  QUAL_BLOCK_MAX_BLOCKS,
  QUAL_MATCH_COLUMNS,
  toColumnLetters,
} from "../cdm-constants";
import type {
  CdmCellWrite,
  CdmMatch,
  CdmModeQualification,
  CdmPlayer,
  CdmTournamentData,
  CdmVersusMode,
} from "../types";
import { SheetWriteBuilder, computeSheetPlayerOrder } from "./sheet-player-order";

const logger = createLogger("cdm-export");

const COLS = QUAL_MATCH_COLUMNS;

/** MR course columns AB..AE (4 assigned courses), derived from AB. */
const MR_COURSE_COLUMNS = (() => {
  const first = columnNumber(COLS.extraFirstColumn); // AB
  return [0, 1, 2, 3].map((d) => toColumnLetters(first + d)); // AB, AC, AD, AE
})();

/** 1-based column number for an A1 column-letters string (inverse of toColumnLetters). */
function columnNumber(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** First data row of block i (0-based). */
function blockFirstRow(i: number): number {
  return QUAL_BLOCK_FIRST_DATA_ROW + i * QUAL_BLOCK_STRIDE;
}

/**
 * Read MR assignedCourses (typed `unknown`) as a string[]. Returns an empty
 * array when absent/!array; non-string entries become null slots downstream.
 */
function readAssignedCourses(value: unknown): (string | null)[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => (typeof v === "string" ? v : null));
}

/** Pick the per-mode qualifications and matches off the tournament data. */
function selectMode(
  data: CdmTournamentData,
  mode: CdmVersusMode,
): { quals: CdmModeQualification[]; matches: CdmMatch[] } {
  switch (mode) {
    case "bm":
      return { quals: data.bmQualifications, matches: data.bmMatches };
    case "mr":
      return { quals: data.mrQualifications, matches: data.mrMatches };
    case "gp":
      return { quals: data.gpQualifications, matches: data.gpMatches };
  }
}

/**
 * Owner score for a match, from the owner's side. BM/MR use the round-win
 * scores (score1/score2); GP uses driver points (points1/points2). Returns
 * null when the field is absent so the caller clears the cell.
 */
function ownerScore(match: CdmMatch, ownerIsP1: boolean, mode: CdmVersusMode): number | null {
  if (mode === "gp") {
    const v = ownerIsP1 ? match.points1 : match.points2;
    return v ?? null;
  }
  const v = ownerIsP1 ? match.score1 : match.score2;
  return v ?? null;
}

/** Opponent score (GP only writes this column). */
function opponentScore(match: CdmMatch, ownerIsP1: boolean): number | null {
  // From the owner's perspective the opponent is the other player.
  const v = ownerIsP1 ? match.points2 : match.points1;
  return v ?? null;
}

/** A match listed under one owner, with the owner/opponent already resolved. */
interface OwnerView {
  match: CdmMatch;
  ownerIsP1: boolean;
  opponent: CdmPlayer;
}

/**
 * All qualification matches an owner plays, from the owner's perspective,
 * ordered by roundNumber then matchNumber ascending (the sheet lists a player's
 * matches top-to-bottom in schedule order). BREAK matches store the real player
 * as player1, so they only surface in the real player's block.
 */
function ownerMatches(matches: CdmMatch[], ownerId: string): OwnerView[] {
  const views: OwnerView[] = [];
  for (const match of matches) {
    if (match.stage !== "qualification") continue;
    if (match.player1.id === ownerId) {
      views.push({ match, ownerIsP1: true, opponent: match.player2 });
    } else if (match.player2.id === ownerId) {
      views.push({ match, ownerIsP1: false, opponent: match.player1 });
    }
  }
  views.sort((a, b) => {
    const ra = a.match.roundNumber ?? 0;
    const rb = b.match.roundNumber ?? 0;
    if (ra !== rb) return ra - rb;
    return a.match.matchNumber - b.match.matchNumber;
  });
  return views;
}

export function buildQualificationWrites(
  data: CdmTournamentData,
  mode: CdmVersusMode,
): CdmCellWrite[] {
  const sheet = CDM_QUALIFICATION_SHEETS[mode];
  const builder = new SheetWriteBuilder(sheet);
  const { quals, matches } = selectMode(data, mode);

  const owners = computeSheetPlayerOrder(quals); // block i owner = owners[i]

  /**
   * Clear every input cell of one data row. Includes the mode-specific extras
   * (GP: opponent points Y + cup AB; MR: courses AB..AE) so a re-used template
   * never keeps stale values in a now-unused row/block. X / Y(BM,MR) / W-T-L
   * formula columns are deliberately excluded — they are never inputs.
   */
  const clearRow = (row: number) => {
    builder.clear(`${COLS.matchNumber}${row}`);
    builder.clear(`${COLS.tvNumber}${row}`);
    builder.clear(`${COLS.ownerSide}${row}`);
    builder.clear(`${COLS.ownerNickname}${row}`);
    builder.clear(`${COLS.ownerScore}${row}`);
    builder.clear(`${COLS.opponentNickname}${row}`);
    builder.clear(`${COLS.opponentSide}${row}`);
    if (mode === "gp") {
      builder.clear(`${COLS.opponentScore}${row}`); // Y opponent points
      builder.clear(`${COLS.extraFirstColumn}${row}`); // AB cup
    } else if (mode === "mr") {
      for (const col of MR_COURSE_COLUMNS) builder.clear(`${col}${row}`); // AB..AE
    }
  };

  /** Write one owner-perspective match into a data row. */
  const writeRow = (row: number, view: OwnerView) => {
    const { match, ownerIsP1, opponent } = view;
    const owner = ownerIsP1 ? match.player1 : match.player2;

    builder.setNumber(`${COLS.matchNumber}${row}`, match.matchNumber);
    builder.setNumberOrClear(`${COLS.tvNumber}${row}`, match.tvNumber ?? null);
    // Side defaults mirror the schema (player1Side default 1, player2Side 2).
    const ownerSide = ownerIsP1 ? (match.player1Side ?? 1) : (match.player2Side ?? 2);
    const oppSide = ownerIsP1 ? (match.player2Side ?? 2) : (match.player1Side ?? 1);
    builder.setNumber(`${COLS.ownerSide}${row}`, ownerSide);
    builder.setString(`${COLS.ownerNickname}${row}`, owner.nickname);
    // Score is cleared while pending so a blank (not 0) feeds the template.
    builder.setNumberOrClear(
      `${COLS.ownerScore}${row}`,
      match.completed ? ownerScore(match, ownerIsP1, mode) : null,
    );
    // BREAK opponents render as the literal 'Break' the sheet expects.
    const opponentNickname = opponent.id === BREAK_PLAYER_ID ? "Break" : opponent.nickname;
    builder.setString(`${COLS.opponentNickname}${row}`, opponentNickname);
    builder.setNumber(`${COLS.opponentSide}${row}`, oppSide);

    if (mode === "gp") {
      // GP Y is a real input (opponent driver points); cleared while pending.
      builder.setNumberOrClear(
        `${COLS.opponentScore}${row}`,
        match.completed ? opponentScore(match, ownerIsP1) : null,
      );
      // AB = cup name (null -> clear).
      builder.setStringOrClear(`${COLS.extraFirstColumn}${row}`, match.cup ?? null);
    } else if (mode === "mr") {
      // AB..AE = the four assigned battle courses; missing slots clear.
      const courses = readAssignedCourses(match.assignedCourses);
      MR_COURSE_COLUMNS.forEach((col, idx) => {
        builder.setStringOrClear(`${col}${row}`, courses[idx] ?? null);
      });
    }
  };

  // --- Fill / clear every block (always all 48 so stale data can't survive) -
  for (let block = 0; block < QUAL_BLOCK_MAX_BLOCKS; block++) {
    const firstRow = blockFirstRow(block);
    const owner = owners[block];
    const views = owner ? ownerMatches(matches, owner.player.id) : [];

    if (views.length > QUAL_BLOCK_DATA_ROWS) {
      logger.warn("qualification matches exceed block capacity; truncating", {
        sheet,
        owner: owner?.player.nickname,
        total: views.length,
        kept: QUAL_BLOCK_DATA_ROWS,
      });
    }

    for (let r = 0; r < QUAL_BLOCK_DATA_ROWS; r++) {
      const row = firstRow + r; // header row 17/33/… is never in this range
      const view = views[r];
      if (view) writeRow(row, view);
      else clearRow(row);
    }
  }

  return builder.build();
}

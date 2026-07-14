/**
 * CDM workbook export — template coordinates and lookup tables.
 *
 * Every constant below was verified against a full cell dump of
 * public/templates/cdm-2025-template.xlsm (the workbook used at CDM 2025).
 * The template is formula-driven; these constants describe ONLY the regions
 * the workbook treats as human inputs, plus the geometry needed to clear
 * leftover data. Do not invent coordinates that are not documented in
 * docs/cdm-export-design.md — writing anywhere else risks destroying the
 * dynamic-array spill ranges that compute standings and brackets.
 */

import type { CdmSheetName, CdmVersusMode } from "./types";

/**
 * The 20 SMK courses in the exact column order of the TT Qualifications
 * sheet (G1..Z1 headers) and of TTEntry.times keys.
 */
export const CDM_COURSES = [
  "MC1", "DP1", "GV1", "BC1", "MC2", "CI1", "GV2", "DP2", "BC2", "MC3",
  "KB1", "CI2", "VL1", "BC3", "MC4", "DP3", "KB2", "GV3", "VL2", "RR",
] as const;

/** Course abbreviation → full display name (Parameters!C2:D21 "Tracks" table). */
export const CDM_COURSE_NAMES: Record<string, string> = {
  MC1: "Mario Circuit 1", DP1: "Donut Plains 1", GV1: "Ghost Valley 1",
  BC1: "Bowser Castle 1", MC2: "Mario Circuit 2", CI1: "Choco Island 1",
  GV2: "Ghost Valley 2", DP2: "Donut Plains 2", BC2: "Bowser Castle 2",
  MC3: "Mario Circuit 3", KB1: "Koopa Beach 1", CI2: "Choco Island 2",
  VL1: "Vanilla Lake 1", BC3: "Bowser Castle 3", MC4: "Mario Circuit 4",
  DP3: "Donut Plains 3", KB2: "Koopa Beach 2", GV3: "Ghost Valley 3",
  VL2: "Vanilla Lake 2", RR: "Rainbow Road",
};

export const CDM_QUALIFICATION_SHEETS: Record<CdmVersusMode, CdmSheetName> = {
  bm: "BM Qualifications",
  mr: "MR Qualifications",
  gp: "GP Qualifications",
};

export const CDM_FINALS_SHEETS: Record<CdmVersusMode, CdmSheetName> = {
  bm: "BM Finals",
  mr: "MR Finals",
  gp: "GP Finals",
};

/* ------------------------------------------------------------------ *
 * Main Hub — Registration table A1:L61 (60 player rows) plus the
 * "Qualifying" / "Groups" count inputs at O3:R3 / O4:R4.
 * Column A (=ROW()-1), N2:R2 (COUNTIF) and T/U spills are formulas.
 * ------------------------------------------------------------------ */
export const MAIN_HUB_FIRST_PLAYER_ROW = 2;
export const MAIN_HUB_MAX_PLAYERS = 60;
export const MAIN_HUB_LAST_PLAYER_ROW =
  MAIN_HUB_FIRST_PLAYER_ROW + MAIN_HUB_MAX_PLAYERS - 1; // 61
/** Mode column order for Order (E..H) and participation Yes/No (I..L). */
export const MAIN_HUB_MODE_ORDER = ["tt", "bm", "mr", "gp"] as const;
export const MAIN_HUB_QUALIFYING_ROW = 3; // O3..R3
export const MAIN_HUB_GROUPS_ROW = 4; // O4..R4
/** O..R column letters indexed like MAIN_HUB_MODE_ORDER. */
export const MAIN_HUB_COUNT_COLUMNS = ["O", "P", "Q", "R"] as const;

/* ------------------------------------------------------------------ *
 * TT Qualifications — time inputs only.
 * Row r hosts the player at position (r-2) of the sheet's
 * SORT(FILTER(Registration[Nickname], TT="Yes")) spill, i.e. nicknames in
 * case-insensitive ascending order. Columns G..Z = CDM_COURSES order.
 * Times are integers M*10000 + SS*100 + CC (e.g. 1:10.34 → 11034).
 * ------------------------------------------------------------------ */
export const TT_QUAL_FIRST_ROW = 2;
export const TT_QUAL_MAX_PLAYERS = 47; // template rows 2..48
export const TT_QUAL_FIRST_TIME_COLUMN = 7; // G
export const TT_QUAL_LAST_TIME_COLUMN = 26; // Z

/* ------------------------------------------------------------------ *
 * BM/MR/GP Qualifications — per-player match blocks.
 * Block 0 data rows 2..16, header row 17, then stride 16 (max 48 blocks).
 * Block order equals the sheet's G2# spill: group A players in synthesized
 * order, then group B, ... Each match appears once in each player's block.
 * Input columns: S,T,U,V,W,Z,AA (+ Y for GP; AB..AE MR courses; AB GP cup).
 * X ('-'), Y (BM/MR formula =4-W) and the W/T/L formula columns are not inputs.
 * ------------------------------------------------------------------ */
export const QUAL_BLOCK_FIRST_DATA_ROW = 2;
export const QUAL_BLOCK_STRIDE = 16;
export const QUAL_BLOCK_DATA_ROWS = 15;
export const QUAL_BLOCK_MAX_BLOCKS = 48;
export const QUAL_MATCH_COLUMNS = {
  matchNumber: "S",
  tvNumber: "T",
  ownerSide: "U",
  ownerNickname: "V",
  ownerScore: "W",
  opponentScore: "Y", // GP only — BM/MR keep the template formula =4-W
  opponentNickname: "Z",
  opponentSide: "AA",
  /** MR: assignedCourses[0..3] → AB..AE. GP: cup name → AB. */
  extraFirstColumn: "AB",
} as const;

/* ------------------------------------------------------------------ *
 * BM/MR/GP Finals — fixed 24-player CDM bracket geometry.
 * A block holds one match in two consecutive rows; columns within a block:
 * +0 label/match#, +1 seed#, +2 name, +3 flag, +4 score.
 * Only the seed cells listed as "typed" in the design doc and the score
 * cells are inputs; name/advancement cells are formulas.
 * ------------------------------------------------------------------ */
export const FINALS_SEED_LIST_COLUMN = "B"; // B3:B26 qualified nicknames
export const FINALS_SEED_LIST_FIRST_ROW = 3;
export const FINALS_SEED_LIST_MAX_ROWS = 24; // rows 3..26
/**
 * Upper-bracket B-positions of the 12 direct qualifiers, in seed order.
 * generateBracketStructure(16) pairs [1,16],[8,9],[4,13],[5,12],[2,15],
 * [7,10],[3,14],[6,11]; playoff winners occupy upper seeds 13..16 (a bye
 * winner keeps their own seed number — see double-elimination.ts), so
 * direct players hold upper seeds 1..12 directly, one-to-one with
 * B-positions 1..12 (verified against the CDM 2025 official results
 * workbook, whose B3:B26 seed list is contiguous seeds 1-24).
 */
export const FINALS_DIRECT_UPPER_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export interface FinalsSlotGeometry {
  /** 1-based column of the block's label column (+0 offset). */
  blockStart: number;
  /** Row of the match's first (slot1) row; slot2 is row + 1. */
  row: number;
}

/**
 * Verified block geometry per app round id, in app match order
 * (k-th match of a round → k-th entry). Upper rows hold the winners path,
 * rows 41..54 the losers path of the same column blocks.
 */
export const FINALS_BRACKET_SLOTS: Record<string, FinalsSlotGeometry[]> = {
  playoff_r1: [5, 13, 21, 29].map((row) => ({ blockStart: 4, row })), // D "Barrage 1"
  playoff_r2: [5, 13, 21, 29].map((row) => ({ blockStart: 11, row })), // K "Barrage 2"
  winners_r1: [5, 9, 13, 17, 21, 25, 29, 33].map((row) => ({ blockStart: 18, row })), // R "Top 16"
  winners_qf: [7, 15, 23, 31].map((row) => ({ blockStart: 25, row })), // Y
  winners_sf: [11, 27].map((row) => ({ blockStart: 32, row })), // AF
  winners_final: [{ blockStart: 39, row: 19 }], // AM
  grand_final: [{ blockStart: 46, row: 19 }], // AT
  grand_final_reset: [{ blockStart: 53, row: 19 }], // BA
  losers_r1: [41, 45, 49, 53].map((row) => ({ blockStart: 18, row })),
  losers_r2: [41, 45, 49, 53].map((row) => ({ blockStart: 25, row })),
  losers_r3: [43, 51].map((row) => ({ blockStart: 32, row })),
  losers_r4: [43, 51].map((row) => ({ blockStart: 39, row })),
  losers_sf: [{ blockStart: 46, row: 47 }],
  losers_final: [{ blockStart: 53, row: 47 }],
};

export const FINALS_BLOCK_SEED_OFFSET = 1;
export const FINALS_BLOCK_NAME_OFFSET = 2;
export const FINALS_BLOCK_SCORE_OFFSET = 4;

/* ------------------------------------------------------------------ *
 * TT Finals — 40 pre-built round blocks, stride 13 columns.
 * Round r (1-based): input block first column 1 + 13(r-1) (A, N, AA, ...),
 * display block first column 7 + 13(r-1) (G, T, AG, ...).
 * Input block columns: +0 #(formula), +1 name(formula), +2 Left
 * (typed only in round 1), +3 Gain (typed), +4 Time (typed, MSSHH; 0 = sat out).
 * Display block columns: +0 #, +1 name, +2 flag, +3 time, +4 Lost (typed 1),
 * +5 Left — all formulas except Lost.
 * Rows 3..26 hold up to 24 finalists; the final standings block TA..TD is
 * pure formulas and must never be written.
 * ------------------------------------------------------------------ */
export const TT_FINALS_MAX_ROUNDS = 40;
export const TT_FINALS_ROUND_STRIDE = 13;
export const TT_FINALS_INPUT_FIRST_COLUMN = 1; // A
export const TT_FINALS_DISPLAY_FIRST_COLUMN = 7; // G
export const TT_FINALS_FIRST_DATA_ROW = 3;
export const TT_FINALS_MAX_FINALISTS = 24; // rows 3..26
export const TT_FINALS_INPUT_LEFT_OFFSET = 2;
export const TT_FINALS_INPUT_GAIN_OFFSET = 3;
export const TT_FINALS_INPUT_TIME_OFFSET = 4;
export const TT_FINALS_DISPLAY_LOST_OFFSET = 4;

/** Convert a 1-based column number to its A1 letters (1→A, 27→AA). */
export function toColumnLetters(column: number): string {
  let result = "";
  let n = column;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

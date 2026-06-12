/**
 * CDM finals — slot-semantics table (machine-readable form of design §3.4.1).
 *
 * The 24-player BM/MR/GP Finals sheet is a formula-driven double-elimination
 * bracket. Every match block holds two stacked rows ("slots"); each slot's
 * NAME cell is either:
 *
 *   - a *typed seed* — the template stores a literal B-position number in the
 *     seed cell (offset +1) and an XLOOKUP-on-A:A formula in the name cell. We
 *     model this as { kind: "seed" }. The fill map writes the B-position number.
 *
 *   - an *advancement formula* — the template name cell holds
 *     `IF(COUNTA(scores)<2,"Winner of N",INDEX(SORTBY(prevNames,prevScores,±1),1))`
 *     i.e. the winner (descending sort) or loser (ascending sort) of an upstream
 *     match N. We model this as { kind: "winnerOf"|"loserOf", round, index }
 *     using *round-local* indices (0-based, app match order), NOT the template's
 *     absolute match numbers. The fill map writes nothing here in faithful mode.
 *
 * Each formula below is transcribed from the verified template dump
 * /tmp/cdm-analysis/sheet2025/sheet_BM_Finals.txt (MR/GP share the layout). The
 * template's absolute match numbers map to round-local indices as:
 *   Top16 (winners_r1)      = matches 1..8   -> idx 0..7
 *   UBQ   (winners_qf)      = matches 13..16 -> idx 0..3
 *   UBS   (winners_sf)      = matches 23,24  -> idx 0,1
 *   UBF   (winners_final)   = match 28       -> idx 0
 *   GF1   (grand_final)     = match 30       -> idx 0
 *   GF2   (grand_final_reset)= match 31      -> idx 0
 *   LBR1  (losers_r1)       = matches 9..12  -> idx 0..3 (rows 41,45,49,53)
 *   LBR2  (losers_r2)       = matches 17..20 -> idx 0..3 (rows 41,45,49,53)
 *   LB1/8 (losers_r3)       = matches 21,22  -> idx 0,1
 *   LBQ   (losers_r4)       = matches 25,26  -> idx 0,1
 *   LBSF  (losers_sf)       = match 27       -> idx 0
 *   LBF   (losers_final)    = match 29       -> idx 0
 *   B1/B2 (playoff_r1/r2)   = "B1,k"/"B2,k"  -> idx k-1
 *
 * This table is the single source of truth that ties the app's bracket rounds to
 * the template's formula web; a regression test (finals-slot-semantics.test.ts)
 * pins every entry to its template formula so an edit cannot silently desync it.
 */

/** A reference to the winner/loser of another bracket match (round-local index). */
export interface FinalsSlotRef {
  kind: "winnerOf" | "loserOf";
  /** App round id (key of FINALS_SLOT_SEMANTICS). */
  round: string;
  /** 0-based match index within that round (app match order). */
  index: number;
}

/** One match slot: either a typed seed cell or an advancement reference. */
export type FinalsSlotSemantics = { kind: "seed" } | FinalsSlotRef;

/** A match is a [slot1, slot2] pair (app player1 side, player2 side). */
type FinalsMatchSlots = readonly [FinalsSlotSemantics, FinalsSlotSemantics];

const seed: FinalsSlotSemantics = { kind: "seed" };
const winnerOf = (round: string, index: number): FinalsSlotRef => ({
  kind: "winnerOf",
  round,
  index,
});
const loserOf = (round: string, index: number): FinalsSlotRef => ({
  kind: "loserOf",
  round,
  index,
});

/**
 * Per-round slot semantics, indexed by round id then by match index. Verified
 * cell-by-cell against the BM Finals template dump (citations per round).
 */
export const FINALS_SLOT_SEMANTICS: Record<
  string,
  readonly FinalsMatchSlots[]
> = {
  // Barrage 1 (D block). E5/E6, E13/E14, … are literal seed values -> both typed.
  playoff_r1: [
    [seed, seed],
    [seed, seed],
    [seed, seed],
    [seed, seed],
  ],
  // Barrage 2 (K block). L5/L13/L21/L29 are literal seed values (the BYE seed);
  // M6 = IF(COUNTA(H5:H6)<2,"Winner of B1,1",…) -> slot2 = winner of playoff_r1[k].
  playoff_r2: [
    [seed, winnerOf("playoff_r1", 0)],
    [seed, winnerOf("playoff_r1", 1)],
    [seed, winnerOf("playoff_r1", 2)],
    [seed, winnerOf("playoff_r1", 3)],
  ],
  // Top 16 (R block). Even matches (idx 0,2,4,6): S5/S13/S21/S29 are literal seed
  // values (slot1 typed); T6/T14/… = IF(COUNTA(O…)<2,"Winner of B2,k",…) ->
  // slot2 = winner of playoff_r2[k]. Odd matches (idx 1,3,5,7): S9/S10,… both
  // literal seed values -> both typed.
  winners_r1: [
    [seed, winnerOf("playoff_r2", 0)], // R5/R6  (Top16 m1)  T6  "Winner of B2,1"
    [seed, seed], // R9/R10  (Top16 m2)
    [seed, winnerOf("playoff_r2", 1)], // R13/R14 (Top16 m3) T14 "Winner of B2,2"
    [seed, seed], // R17/R18 (Top16 m4)
    [seed, winnerOf("playoff_r2", 2)], // R21/R22 (Top16 m5) T22 "Winner of B2,3"
    [seed, seed], // R25/R26 (Top16 m6)
    [seed, winnerOf("playoff_r2", 3)], // R29/R30 (Top16 m7) T30 "Winner of B2,4"
    [seed, seed], // R33/R34 (Top16 m8)
  ],
  // Upper Bracket Quarters (Y block). AA7="Winner of 1", AA8="Winner of 2" ->
  // each qf[k] = winners of winners_r1[2k] and winners_r1[2k+1].
  winners_qf: [
    [winnerOf("winners_r1", 0), winnerOf("winners_r1", 1)], // AA7/AA8
    [winnerOf("winners_r1", 2), winnerOf("winners_r1", 3)], // AA15/AA16
    [winnerOf("winners_r1", 4), winnerOf("winners_r1", 5)], // AA23/AA24
    [winnerOf("winners_r1", 6), winnerOf("winners_r1", 7)], // AA31/AA32
  ],
  // Upper Bracket Semi (AF block). AH11="Winner of 13"(qf m1=idx0),
  // AH12="Winner of 14"(idx1); AH27="Winner of 15"(idx2),AH28="Winner of 16"(idx3).
  winners_sf: [
    [winnerOf("winners_qf", 0), winnerOf("winners_qf", 1)], // AH11/AH12
    [winnerOf("winners_qf", 2), winnerOf("winners_qf", 3)], // AH27/AH28
  ],
  // Upper Bracket Final (AM block). AO19="Winner of 23"(sf m23=idx0),
  // AO20="Winner of 24"(idx1).
  winners_final: [[winnerOf("winners_sf", 0), winnerOf("winners_sf", 1)]],
  // Lower Bracket Round 1 (R block rows 41..54). T41="Loser of 1",T42="Loser of 2"
  // -> losers of winners_r1[2k], winners_r1[2k+1].
  losers_r1: [
    [loserOf("winners_r1", 0), loserOf("winners_r1", 1)], // T41/T42
    [loserOf("winners_r1", 2), loserOf("winners_r1", 3)], // T45/T46
    [loserOf("winners_r1", 4), loserOf("winners_r1", 5)], // T49/T50
    [loserOf("winners_r1", 6), loserOf("winners_r1", 7)], // T53/T54
  ],
  // Lower Bracket Round 2 (Y block rows 41..54). slot1 = loser of winners_qf in
  // *reverse* visual order: AA41="Loser of 16"(qf idx3), AA45="Loser of 15"
  // (idx2), AA49="Loser of 14"(idx1), AA53="Loser of 13"(idx0) -> loserOf qf[3-k].
  // slot2: AA42="Winner of 9"(losers_r1 idx0) -> winnerOf losers_r1[k].
  losers_r2: [
    [loserOf("winners_qf", 3), winnerOf("losers_r1", 0)], // AA41/AA42
    [loserOf("winners_qf", 2), winnerOf("losers_r1", 1)], // AA45/AA46
    [loserOf("winners_qf", 1), winnerOf("losers_r1", 2)], // AA49/AA50
    [loserOf("winners_qf", 0), winnerOf("losers_r1", 3)], // AA53/AA54
  ],
  // Lower Bracket 1/8s (AF block rows 43,51). AH43="Winner of 20"(losers_r2 idx0),
  // AH44="Winner of 19"(idx1); AH51="Winner of 18"(idx2),AH52="Winner of 17"(idx3).
  losers_r3: [
    [winnerOf("losers_r2", 0), winnerOf("losers_r2", 1)], // AH43/AH44
    [winnerOf("losers_r2", 2), winnerOf("losers_r2", 3)], // AH51/AH52
  ],
  // Lower Bracket Quarters (AM block rows 43,51). AO43="Loser of 23"(winners_sf
  // idx0), AO44="Winner of 22"(losers_r3 idx0); AO51="Loser of 24"(sf idx1),
  // AO52="Winner of 21"(losers_r3 idx1).
  losers_r4: [
    [loserOf("winners_sf", 0), winnerOf("losers_r3", 0)], // AO43/AO44
    [loserOf("winners_sf", 1), winnerOf("losers_r3", 1)], // AO51/AO52
  ],
  // Lower Bracket Semi (AT block row 47). AV47="Winner of 25"(losers_r4 idx0),
  // AV48="Winner of 26"(idx1).
  losers_sf: [[winnerOf("losers_r4", 0), winnerOf("losers_r4", 1)]],
  // Lower Bracket Final (BA block row 47). BC47="Loser of 28"(winners_final idx0),
  // BC48="Winner of 27"(losers_sf idx0). NOTE: slot1/slot2 are REVERSED vs the
  // app, which seeds the losers_sf winner as player1 (see double-elimination.ts
  // losers_final position:2). The fill map accounts for this when writing scores.
  losers_final: [[loserOf("winners_final", 0), winnerOf("losers_sf", 0)]],
  // Grand Final 1 (AT block row 19). AV19="Winner of 28"(winners_final idx0),
  // AV20="Winner of 29"(losers_final idx0).
  grand_final: [[winnerOf("winners_final", 0), winnerOf("losers_final", 0)]],
  // Grand Final 2 / reset (BA block row 19). BC19="Winner of 30"(grand_final
  // idx0); BC20 sorts ascending -> the LOSER of grand_final[0].
  grand_final_reset: [[winnerOf("grand_final", 0), loserOf("grand_final", 0)]],
};

/**
 * Look up the semantics of a single slot. Returns null for an unknown round or an
 * out-of-range match index, so callers can skip gracefully (with a warning) when
 * an app match cannot be placed.
 *
 * @param round      app round id
 * @param matchIndex 0-based match index within the round
 * @param slotIndex  0 (player1 side) or 1 (player2 side)
 */
export function getSlotSemantics(
  round: string,
  matchIndex: number,
  slotIndex: number,
): FinalsSlotSemantics | null {
  const matches = FINALS_SLOT_SEMANTICS[round];
  if (!matches) return null;
  const slots = matches[matchIndex];
  if (!slots) return null;
  const slot = slots[slotIndex];
  return slot ?? null;
}

/**
 * Tests for the CDM finals slot-semantics table.
 *
 * The table is the machine-readable form of design doc §3.4.1 and of the
 * advancement formulas dumped from the template
 * (/tmp/cdm-analysis/sheet2025/sheet_BM_Finals.txt). Each round/slot is one
 * of:
 *   - { kind: "seed" }                 — the template holds a *typed value*
 *     cell here (a B-position number), e.g. S5=1 in winners_r1[0] slot1.
 *   - { kind: "winnerOf"|"loserOf", round, index } — the template holds an
 *     advancement *formula* here, e.g. T6 = INDEX(SORTBY(...)) "Winner of B2,1"
 *     which is the winner of playoff_r2[0].
 *
 * These tests pin the table to the exact formulas in the dump so a future
 * edit cannot silently desync the fill map from the template.
 */

import {
  FINALS_SLOT_SEMANTICS,
  getSlotSemantics,
  type FinalsSlotRef,
} from '@/lib/cdm-export/fill/finals-slot-semantics';

describe('FINALS_SLOT_SEMANTICS', () => {
  it('marks both playoff_r1 slots as typed seeds (template E5/E6 are values)', () => {
    expect(getSlotSemantics('playoff_r1', 0, 0)).toEqual({ kind: 'seed' });
    expect(getSlotSemantics('playoff_r1', 0, 1)).toEqual({ kind: 'seed' });
  });

  it('playoff_r2 slot1 is the bye seed (typed), slot2 is winnerOf playoff_r1[k]', () => {
    // Template M6 = IF(COUNTA(H5:H6)<2,"Winner of B1,1", ...) → winner of barrage1 match 1.
    expect(getSlotSemantics('playoff_r2', 0, 0)).toEqual({ kind: 'seed' });
    expect(getSlotSemantics('playoff_r2', 0, 1)).toEqual({
      kind: 'winnerOf',
      round: 'playoff_r1',
      index: 0,
    });
    expect(getSlotSemantics('playoff_r2', 2, 1)).toEqual({
      kind: 'winnerOf',
      round: 'playoff_r1',
      index: 2,
    });
  });

  it('even winners_r1 slot2 is winnerOf playoff_r2[k]; odd is fully typed', () => {
    // Template T6 = "Winner of B2,1" → winner of barrage2 (playoff_r2) match 1.
    expect(getSlotSemantics('winners_r1', 0, 0)).toEqual({ kind: 'seed' });
    expect(getSlotSemantics('winners_r1', 0, 1)).toEqual({
      kind: 'winnerOf',
      round: 'playoff_r2',
      index: 0,
    });
    expect(getSlotSemantics('winners_r1', 2, 1)).toEqual({
      kind: 'winnerOf',
      round: 'playoff_r2',
      index: 1,
    });
    // Odd index (idx1) both typed: S9=8, S10=9.
    expect(getSlotSemantics('winners_r1', 1, 0)).toEqual({ kind: 'seed' });
    expect(getSlotSemantics('winners_r1', 1, 1)).toEqual({ kind: 'seed' });
  });

  it('winners_qf slots reference the two feeding winners_r1 matches', () => {
    // Template AA7 = "Winner of 1" (winners_r1 match 1) and AA8 = "Winner of 2".
    expect(getSlotSemantics('winners_qf', 0, 0)).toEqual({
      kind: 'winnerOf',
      round: 'winners_r1',
      index: 0,
    });
    expect(getSlotSemantics('winners_qf', 0, 1)).toEqual({
      kind: 'winnerOf',
      round: 'winners_r1',
      index: 1,
    });
    expect(getSlotSemantics('winners_qf', 3, 1)).toEqual({
      kind: 'winnerOf',
      round: 'winners_r1',
      index: 7,
    });
  });

  it('winners_sf and winners_final chain the winners path', () => {
    expect(getSlotSemantics('winners_sf', 0, 0)).toEqual({
      kind: 'winnerOf',
      round: 'winners_qf',
      index: 0,
    });
    expect(getSlotSemantics('winners_sf', 0, 1)).toEqual({
      kind: 'winnerOf',
      round: 'winners_qf',
      index: 1,
    });
    expect(getSlotSemantics('winners_final', 0, 0)).toEqual({
      kind: 'winnerOf',
      round: 'winners_sf',
      index: 0,
    });
    expect(getSlotSemantics('winners_final', 0, 1)).toEqual({
      kind: 'winnerOf',
      round: 'winners_sf',
      index: 1,
    });
  });

  it('losers_r1 slots are the losers of the two feeding winners_r1 matches', () => {
    // Template T41 = "Loser of 1", T42 = "Loser of 2".
    expect(getSlotSemantics('losers_r1', 0, 0)).toEqual({
      kind: 'loserOf',
      round: 'winners_r1',
      index: 0,
    });
    expect(getSlotSemantics('losers_r1', 0, 1)).toEqual({
      kind: 'loserOf',
      round: 'winners_r1',
      index: 1,
    });
  });

  it('losers_r2 slot1 is loserOf winners_qf[3-k] (reverse), slot2 winnerOf losers_r1[k]', () => {
    // Template AA41 = "Loser of 16" (winners_qf match 16 = qf index 3) for losers_r2[0].
    // AA45 = "Loser of 15" (qf index 2) for losers_r2[1], etc.
    expect(getSlotSemantics('losers_r2', 0, 0)).toEqual({
      kind: 'loserOf',
      round: 'winners_qf',
      index: 3,
    });
    expect(getSlotSemantics('losers_r2', 1, 0)).toEqual({
      kind: 'loserOf',
      round: 'winners_qf',
      index: 2,
    });
    expect(getSlotSemantics('losers_r2', 0, 1)).toEqual({
      kind: 'winnerOf',
      round: 'losers_r1',
      index: 0,
    });
  });

  it('losers_final matches app P1/P2: slot1 loserOf winners_final, slot2 winnerOf losers_sf', () => {
    // Template BC47 = "Loser of 28"? No — the BM dump shows BC47 = "Loser of 28"
    // is losers_sf area; losers_final block (BA col, row 47) BC47 references
    // the winners_final loser and BC48 the losers_sf winner.
    expect(getSlotSemantics('losers_final', 0, 0)).toEqual({
      kind: 'loserOf',
      round: 'winners_final',
      index: 0,
    });
    expect(getSlotSemantics('losers_final', 0, 1)).toEqual({
      kind: 'winnerOf',
      round: 'losers_sf',
      index: 0,
    });
  });

  it('grand_final and reset chain the two champions', () => {
    expect(getSlotSemantics('grand_final', 0, 0)).toEqual({
      kind: 'winnerOf',
      round: 'winners_final',
      index: 0,
    });
    expect(getSlotSemantics('grand_final', 0, 1)).toEqual({
      kind: 'winnerOf',
      round: 'losers_final',
      index: 0,
    });
    expect(getSlotSemantics('grand_final_reset', 0, 0)).toEqual({
      kind: 'winnerOf',
      round: 'grand_final',
      index: 0,
    });
    expect(getSlotSemantics('grand_final_reset', 0, 1)).toEqual({
      kind: 'loserOf',
      round: 'grand_final',
      index: 0,
    });
  });

  it('getSlotSemantics returns null for unknown round or out-of-range index', () => {
    expect(getSlotSemantics('not_a_round', 0, 0)).toBeNull();
    expect(getSlotSemantics('winners_final', 9, 0)).toBeNull();
  });

  it('every referenced round exists in the table (no dangling refs)', () => {
    const refs: FinalsSlotRef[] = [];
    for (const slots of Object.values(FINALS_SLOT_SEMANTICS)) {
      for (const matchSlots of slots) {
        for (const slot of matchSlots) {
          if (slot.kind !== 'seed') refs.push(slot);
        }
      }
    }
    for (const ref of refs) {
      expect(FINALS_SLOT_SEMANTICS[ref.round]).toBeDefined();
      expect(FINALS_SLOT_SEMANTICS[ref.round].length).toBeGreaterThan(ref.index);
    }
  });
});

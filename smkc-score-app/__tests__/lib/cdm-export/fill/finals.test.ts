/**
 * Tests for the BM/MR/GP Finals fill map (buildFinalsWrites).
 *
 * The Finals sheet is a formula-driven 24-player double-elimination bracket. The
 * fill map reconstructs each slot's B-position from the app match records (no DB
 * seed column) using the canonical structures in double-elimination.ts, writes
 * typed seed cells + visible name/score cells in faithful mode, and
 * value-overwrites the degraded 16-/8-player brackets the template formulas
 * cannot represent.
 *
 * Ground truth for cell coordinates is the verified template dump
 * /tmp/cdm-analysis/sheet2025/sheet_BM_Finals.txt; the B-position map below was
 * hand-derived from generateBracketStructure(16)/generatePlayoffStructure(12)
 * and cross-checked against that dump (e.g. S5=B-pos1, S9=B-pos8, S10=B-pos9).
 */

import { buildFinalsWrites } from '@/lib/cdm-export/fill/finals';
import type {
  CdmMatch,
  CdmModeQualification,
  CdmPlayer,
  CdmTournamentData,
  CdmVersusMode,
} from '@/lib/cdm-export/types';
import { createLogger } from '@/lib/logger';
import { indexWrites, expectString, expectNumber, expectClear, expectUntouched } from './write-helpers';

jest.mock('@/lib/logger', () => {
  const warn = jest.fn();
  return {
    createLogger: () => ({ warn, info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  };
});
const warnMock = (createLogger('x') as unknown as { warn: jest.Mock }).warn;

beforeEach(() => warnMock.mockClear());

/* ----------------------------------------------------------------- *
 * Fixture helpers — players are named "B{n}" for the B-position n they hold,
 * so assertions read directly (e.g. seed list B5 should hold nickname "B1").
 * ----------------------------------------------------------------- */

function bp(n: number): CdmPlayer {
  return { id: `bp${n}`, name: `Name ${n}`, nickname: `B${n}` };
}

function emptyData(over: Partial<CdmTournamentData> = {}): CdmTournamentData {
  return {
    name: 'T',
    date: new Date('2025-01-01'),
    bmQualifications: [],
    mrQualifications: [],
    gpQualifications: [],
    bmMatches: [],
    mrMatches: [],
    gpMatches: [],
    ttEntries: [],
    ttPhaseRounds: [],
    ...over,
  };
}

interface MatchSpec {
  matchNumber: number;
  stage: string;
  round: string;
  p1: number; // B-position of player1
  p2: number; // B-position of player2
  s1?: number; // score1 (BM/MR) — omit for incomplete
  s2?: number;
  bracketPosition?: string;
}

function mk(spec: MatchSpec, mode: CdmVersusMode = 'bm'): CdmMatch {
  const completed = spec.s1 != null && spec.s2 != null;
  const base: CdmMatch = {
    matchNumber: spec.matchNumber,
    stage: spec.stage,
    round: spec.round,
    bracketPosition: spec.bracketPosition,
    player1: bp(spec.p1),
    player2: bp(spec.p2),
    completed,
  };
  if (completed) {
    if (mode === 'gp') {
      base.points1 = spec.s1;
      base.points2 = spec.s2;
    } else {
      base.score1 = spec.s1;
      base.score2 = spec.s2;
    }
  }
  return base;
}

/**
 * Build a full 24-player faithful bracket's winners_r1 + playoff matches with the
 * B-positions wired exactly as the structures dictate (B-position == real overall
 * seed, 1-12 direct / 13-24 barrage — see double-elimination.ts). The four playoff
 * winners are the BYE seeds (B13/B16/B15/B14), which advance into winners_r1
 * slot2 of the even matches (idx 0/2/4/6 -- see generate16PlayerBracket's
 * seedPairs16 = [1,16],[8,9],[4,13],[5,12],[2,15],[7,10],[3,14],[6,11]).
 */
function build24WinnersAndPlayoff(mode: CdmVersusMode = 'bm'): CdmMatch[] {
  // winners_r1: [p1 Bpos, p2 Bpos], mirroring seedPairs16 directly since
  // B-position == seed now. Even matches (idx 0,2,4,6) pair a direct seed with
  // a barrage seed (13-16); odd matches (idx 1,3,5,7) are direct-vs-direct.
  const wr1: Array<[number, number]> = [
    [1, 16], // idx0: B1 vs playoff winner B16
    [8, 9], // idx1
    [4, 13], // idx2: B4 vs playoff winner B13
    [5, 12], // idx3
    [2, 15], // idx4: B2 vs playoff winner B15
    [7, 10], // idx5
    [3, 14], // idx6: B3 vs playoff winner B14
    [6, 11], // idx7
  ];
  const winnersR1 = wr1.map(([p1, p2], i) =>
    mk({ matchNumber: i + 1, stage: 'finals', round: 'winners_r1', p1, p2, s1: 4, s2: 1 }, mode),
  );

  // playoff_r1 (matches 1-4): structural pairs map to B-positions directly
  // (seeds 17-24, the standard 5v12/6v11/7v10/8v9 shape within the 12-entrant
  // barrage pool -- see generatePlayoffStructure's r1Pairs).
  const pr1: Array<[number, number]> = [
    [17, 24],
    [20, 21],
    [18, 23],
    [19, 22],
  ];
  const playoffR1 = pr1.map(([p1, p2], i) =>
    mk({ matchNumber: i + 1, stage: 'playoff', round: 'playoff_r1', p1, p2, s1: 4, s2: 0 }, mode),
  );

  // playoff_r2 (matches 5-8): BYE seed (B16/13/15/14) beats the r1 winner and
  // advances, keeping its own seed number. p2 = the r1 winner (slot0 of the
  // corresponding r1 match, which wins 4-0 above).
  const pr2: Array<[number, number]> = [
    [16, 17], // bye seed16 vs r1[0] (17v24) winner B17
    [13, 20], // bye seed13 vs r1[1] (20v21) winner B20
    [15, 18], // bye seed15 vs r1[2] (18v23) winner B18
    [14, 19], // bye seed14 vs r1[3] (19v22) winner B19
  ];
  const playoffR2 = pr2.map(([p1, p2], i) =>
    mk({ matchNumber: i + 5, stage: 'playoff', round: 'playoff_r2', p1, p2, s1: 4, s2: 1 }, mode),
  );

  return [...playoffR1, ...playoffR2, ...winnersR1];
}

const SHEET_BY_MODE: Record<CdmVersusMode, 'BM Finals' | 'MR Finals' | 'GP Finals'> = {
  bm: 'BM Finals',
  mr: 'MR Finals',
  gp: 'GP Finals',
};

/* ----------------------------------------------------------------- *
 * Faithful 24-player bracket.
 * ----------------------------------------------------------------- */

describe('buildFinalsWrites — faithful 24-player bracket', () => {
  const data = emptyData({ bmMatches: build24WinnersAndPlayoff() });
  const map = indexWrites(buildFinalsWrites(data, 'bm'), 'BM Finals');

  it('writes the seed list B3:B26 with the nickname at each B-position', () => {
    // B-position p -> row p+2; player bp(p) has nickname "B{p}".
    expectString(map, 'B3', 'B1'); // B-pos 1
    expectString(map, 'B10', 'B8'); // B-pos 8
    expectString(map, 'B11', 'B9'); // B-pos 9
    expectString(map, 'B15', 'B13'); // B-pos 13 (first playoff entrant)
    expectString(map, 'B26', 'B24'); // B-pos 24 (last)
  });

  it('writes typed winners_r1 seed cells as B-positions and never the formula slot2 of even matches', () => {
    // winners_r1[0] slot0 typed (S5 = B-pos 1); slot1 is a "Winner of B2,1"
    // formula (S6) and must stay untouched.
    expectNumber(map, 'S5', 1);
    expectUntouched(map, 'S6');
    // winners_r1[1] both typed: S9 = B-pos 8, S10 = B-pos 9.
    expectNumber(map, 'S9', 8);
    expectNumber(map, 'S10', 9);
    // winners_r1[3] both typed: S17 = B-pos 5, S18 = B-pos 12.
    expectNumber(map, 'S17', 5);
    expectNumber(map, 'S18', 12);
  });

  it('writes typed playoff seed cells (E both slots, L slot1 only)', () => {
    // playoff_r1[0]: E5 = B17, E6 = B24 (both typed).
    expectNumber(map, 'E5', 17);
    expectNumber(map, 'E6', 24);
    // playoff_r2[0]: L5 = B16 (BYE seed typed); M6 is a "Winner of B1,1" formula.
    expectNumber(map, 'L5', 16);
    expectUntouched(map, 'L6');
  });

  it('writes visible match names from the app record in faithful path', () => {
    expect(map.get('F5')).toMatchObject({ op: 'overwriteString', value: 'B17' });
    expect(map.get('F6')).toMatchObject({ op: 'overwriteString', value: 'B24' });
    expect(map.get('M5')).toMatchObject({ op: 'overwriteString', value: 'B16' });
    expect(map.get('M6')).toMatchObject({ op: 'overwriteString', value: 'B17' });
    expect(map.get('T5')).toMatchObject({ op: 'overwriteString', value: 'B1' });
    expect(map.get('T6')).toMatchObject({ op: 'overwriteString', value: 'B16' });
    // Downstream matches that do not yet exist are still left alone.
    for (const ref of ['AA7', 'AV19', 'BC47']) expectUntouched(map, ref);
  });

  it('writes scores by identity resolution into the slot the template expects', () => {
    // winners_r1[1] both typed: bp8 (slot0, score 4) -> V9, bp9 (slot1, score 1) -> V10.
    expectNumber(map, 'V9', 4);
    expectNumber(map, 'V10', 1);
    // winners_r1[0]: slot0=bp1(score4)->V5; slot1 expects winner of playoff_r2[0]
    // = bp16 (BYE seed won) which is this match's player2 (score1) -> V6.
    expectNumber(map, 'V5', 4);
    expectNumber(map, 'V6', 1);
  });

  it('writes playoff match scores by identity resolution', () => {
    // playoff_r1[0]: bp17 (slot0, score 4) -> H5, bp24 (slot1, score 0) -> H6.
    expectNumber(map, 'H5', 4);
    expectNumber(map, 'H6', 0);
    // playoff_r2[0]: bye seed bp16 (slot0, score 4) -> O5; slot1 expects the
    // winner of playoff_r1[0] = bp17 (this match's player2, score 1) -> O6.
    expectNumber(map, 'O5', 4);
    expectNumber(map, 'O6', 1);
  });

  it('does not emit duplicate ops for any cell (clear-then-write collapsed)', () => {
    // indexWrites throws on a duplicate ref; reaching here means it held.
    expect(map.size).toBeGreaterThan(0);
  });
});

describe('buildFinalsWrites — official two-group displayed-seed layout', () => {
  const player = (token: string): CdmPlayer => ({ id: token, name: token, nickname: token });
  const match = (
    matchNumber: number,
    stage: 'playoff' | 'finals',
    round: 'playoff_r1' | 'playoff_r2' | 'winners_r1',
    player1: string,
    player2: string,
  ): CdmMatch => ({
    matchNumber,
    stage,
    round,
    player1: player(player1),
    player2: player(player2),
    score1: 4,
    score2: 1,
    completed: true,
  });

  const matches: CdmMatch[] = [
    match(1, 'playoff', 'playoff_r1', 'A9', 'B12'),
    match(2, 'playoff', 'playoff_r1', 'B10', 'A11'),
    match(3, 'playoff', 'playoff_r1', 'B9', 'A12'),
    match(4, 'playoff', 'playoff_r1', 'A10', 'B11'),
    match(5, 'playoff', 'playoff_r2', 'B8', 'A9'),
    match(6, 'playoff', 'playoff_r2', 'A7', 'B10'),
    match(7, 'playoff', 'playoff_r2', 'A8', 'B9'),
    match(8, 'playoff', 'playoff_r2', 'B7', 'A10'),
    match(1, 'finals', 'winners_r1', 'A1', 'B8'),
    match(2, 'finals', 'winners_r1', 'B4', 'A5'),
    match(3, 'finals', 'winners_r1', 'B2', 'A7'),
    match(4, 'finals', 'winners_r1', 'A3', 'B6'),
    match(5, 'finals', 'winners_r1', 'B1', 'A8'),
    match(6, 'finals', 'winners_r1', 'A4', 'B5'),
    match(7, 'finals', 'winners_r1', 'A2', 'B7'),
    match(8, 'finals', 'winners_r1', 'B3', 'A6'),
  ];
  const qualifications: CdmModeQualification[] = ['A', 'B'].flatMap((group) =>
    Array.from({ length: 12 }, (_, index) => ({
      player: player(`${group}${index + 1}`),
      group,
      seeding: index + 1,
      points: 12 - index,
      score: 12 - index,
    })),
  );

  it('reconstructs the fixed alternating direct and barrage seed-list order', () => {
    const data = emptyData({ bmMatches: matches, bmQualifications: qualifications });
    const map = indexWrites(buildFinalsWrites(data, 'bm'), 'BM Finals');

    expectString(map, 'B3', 'A1');
    expectString(map, 'B4', 'B1');
    expectString(map, 'B14', 'B6');
    expectString(map, 'B15', 'A7');
    expectString(map, 'B26', 'B12');
  });
});

describe('buildFinalsWrites — losers_final slot reversal (faithful)', () => {
  it("writes the WF loser's score to slot1 and the LSF winner's score to slot2", () => {
    // App losers_final: player1 = Losers-SF winner, player2 = Winners-Final loser.
    // Template slot1 (BE47) = loserOf winners_final; slot2 (BE48) = winnerOf losers_sf.
    // Stack the feeders onto a real 24 bracket so the faithful path is selected.
    const matches: CdmMatch[] = [
      ...build24WinnersAndPlayoff(),
      // winners_final[0]: bp101 beats bp102 -> WF loser = bp102.
      mk({ matchNumber: 28, stage: 'finals', round: 'winners_final', p1: 101, p2: 102, s1: 4, s2: 2 }),
      // losers_sf[0]: bp201 beats bp202 -> LSF winner = bp201.
      mk({ matchNumber: 27, stage: 'finals', round: 'losers_sf', p1: 201, p2: 202, s1: 4, s2: 0 }),
      // losers_final[0]: app p1 = LSF winner (bp201), app p2 = WF loser (bp102).
      mk({ matchNumber: 29, stage: 'finals', round: 'losers_final', p1: 201, p2: 102, s1: 1, s2: 4 }),
    ];
    const map = indexWrites(buildFinalsWrites(emptyData({ bmMatches: matches }), 'bm'), 'BM Finals');
    // Names are written under the same template slot order as the scores.
    expect(map.get('BC47')).toMatchObject({ op: 'overwriteString', value: 'B102' });
    expect(map.get('BC48')).toMatchObject({ op: 'overwriteString', value: 'B201' });
    // bp102 (WF loser, app player2, score 4) -> template slot1 score cell BE47.
    expectNumber(map, 'BE47', 4);
    // bp201 (LSF winner, app player1, score 1) -> template slot2 score cell BE48.
    expectNumber(map, 'BE48', 1);
  });
});

/* ----------------------------------------------------------------- *
 * Identity-resolution fallback.
 * ----------------------------------------------------------------- */

describe('buildFinalsWrites — identity fallback', () => {
  it('falls back to positional score mapping and warns when the record disagrees', () => {
    // Real 24 bracket (winners of winners_r1[0]/[1] resolve to bp1/bp8), plus a
    // winners_qf[0] whose recorded players (bp97/bp98) match NEITHER expected
    // winner -> resolution disagrees -> positional fallback + warn.
    const matches: CdmMatch[] = [
      ...build24WinnersAndPlayoff(),
      mk({ matchNumber: 13, stage: 'finals', round: 'winners_qf', p1: 97, p2: 98, s1: 4, s2: 3 }),
    ];
    const map = indexWrites(buildFinalsWrites(emptyData({ bmMatches: matches }), 'bm'), 'BM Finals');
    // Positional: player1 score (4) -> slot1 (AC7), player2 score (3) -> slot2 (AC8).
    expectNumber(map, 'AC7', 4);
    expectNumber(map, 'AC8', 3);
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining('positional fallback'),
      expect.objectContaining({ round: 'winners_qf' }),
    );
  });

  // Issue #2749: writeMatchNames' resolvedBoth=false fallback path (name
  // cells, as opposed to the score cells asserted above) had no direct
  // coverage even though the same match fixture exercises it — the fallback
  // must preserve the app record's p1/p2 order (AA7<-player1, AA8<-player2),
  // matching writeMatchScores' positional fallback for the same match.
  it('falls back to positional name mapping when the record disagrees', () => {
    const matches: CdmMatch[] = [
      ...build24WinnersAndPlayoff(),
      mk({ matchNumber: 13, stage: 'finals', round: 'winners_qf', p1: 97, p2: 98, s1: 4, s2: 3 }),
    ];
    const map = indexWrites(buildFinalsWrites(emptyData({ bmMatches: matches }), 'bm'), 'BM Finals');
    expect(map.get('AA7')).toMatchObject({ op: 'overwriteString', value: 'B97' });
    expect(map.get('AA8')).toMatchObject({ op: 'overwriteString', value: 'B98' });
  });
});

/* ----------------------------------------------------------------- *
 * Incomplete matches + Grand Final reset absence.
 * ----------------------------------------------------------------- */

describe('buildFinalsWrites — incomplete matches and GF reset', () => {
  it('clears the score cells of an incomplete match', () => {
    const matches = build24WinnersAndPlayoff();
    // Make winners_r1[1] incomplete (drop its scores).
    const incomplete = matches.map((m) =>
      m.round === 'winners_r1' && m.matchNumber === 2
        ? { ...m, completed: false, score1: undefined, score2: undefined }
        : m,
    );
    const map = indexWrites(buildFinalsWrites(emptyData({ bmMatches: incomplete }), 'bm'), 'BM Finals');
    expectClear(map, 'V9'); // winners_r1[1] slot0 score cleared
    expectClear(map, 'V10'); // slot1 score cleared
  });

  it('clears the GF2 (reset) score cells when no reset match exists', () => {
    const map = indexWrites(buildFinalsWrites(emptyData({ bmMatches: build24WinnersAndPlayoff() }), 'bm'), 'BM Finals');
    // grand_final_reset score cells BE19 / BE20 — no reset match -> cleared.
    expectClear(map, 'BE19');
    expectClear(map, 'BE20');
  });

  it("maps a grand_final_reset match flagged only via bracketPosition='reset'", () => {
    // round is NOT a known bracket round (empty) so the bracketPosition="reset"
    // alias is what routes this match to the GF2 (reset) block — mirrors the
    // export route's cdmFinalsSlotRound precedence.
    const matches: CdmMatch[] = [
      ...build24WinnersAndPlayoff(),
      mk({
        matchNumber: 31,
        stage: 'finals',
        round: '',
        bracketPosition: 'reset',
        p1: 1,
        p2: 2,
        s1: 4,
        s2: 3,
      }),
    ];
    const map = indexWrites(buildFinalsWrites(emptyData({ bmMatches: matches }), 'bm'), 'BM Finals');
    // The reset match scores land in GF2 cells (positional fallback: no feeders).
    expectNumber(map, 'BE19', 4);
    expectNumber(map, 'BE20', 3);
  });
});

/* ----------------------------------------------------------------- *
 * 24-player, playoff-only partial state.
 * ----------------------------------------------------------------- */

describe('buildFinalsWrites — 24-player playoff-only partial', () => {
  function qual(p: CdmPlayer, seeding: number, score = 0): CdmModeQualification {
    return { player: p, group: 'A', seeding, points: 0, score };
  }
  it('fills B13..24 from the playoff and B1..12 from the qualification-rank fallback', () => {
    // Playoff matches only (no winners_r1). 12 direct qualifiers q1..q12 ranked by
    // seeding ascending fill B1..12; the 12 playoff entrants fill B13..24.
    const playoff = build24WinnersAndPlayoff().filter((m) => m.stage === 'playoff');
    const directQuals = Array.from({ length: 12 }, (_, i) =>
      qual({ id: `q${i + 1}`, name: `Q${i + 1}`, nickname: `Q${i + 1}` }, i + 1),
    );
    const data = emptyData({ bmMatches: playoff, bmQualifications: directQuals });
    const map = indexWrites(buildFinalsWrites(data, 'bm'), 'BM Finals');
    // B1 = top seed Q1, B12 = Q12.
    expectString(map, 'B3', 'Q1');
    expectString(map, 'B14', 'Q12');
    // B13 = first playoff entrant (B13 player), B24 = last.
    expectString(map, 'B15', 'B13');
    expectString(map, 'B26', 'B24');
    // Playoff seed cells still typed (E5 = B17).
    expectNumber(map, 'E5', 17);
  });
});

/* ----------------------------------------------------------------- *
 * Degraded 16-player bracket (no playoff).
 * ----------------------------------------------------------------- */

describe('buildFinalsWrites — degraded 16-player', () => {
  // 16 direct qualifiers; B-position = upper seed 1..16. winners_r1 wiring uses
  // the structure pairs directly (no playoff slot).
  function build16(): CdmMatch[] {
    const pairs: Array<[number, number]> = [
      [1, 16],
      [8, 9],
      [5, 12],
      [4, 13],
      [3, 14],
      [6, 11],
      [7, 10],
      [2, 15],
    ];
    return pairs.map(([p1, p2], i) =>
      mk({ matchNumber: i + 1, stage: 'finals', round: 'winners_r1', p1, p2, s1: 4, s2: 1 }),
    );
  }
  // Built per-`it` so the warn mock (cleared by beforeEach) captures this call.
  const map16 = () => indexWrites(buildFinalsWrites(emptyData({ bmMatches: build16() }), 'bm'), 'BM Finals');

  it('writes the 16-player seed list and B-positions equal to the upper seeds', () => {
    const map = map16();
    expectString(map, 'B3', 'B1'); // B-pos 1
    expectString(map, 'B18', 'B16'); // B-pos 16
    expectClear(map, 'B19'); // B-pos 17 unused -> cleared
  });

  it("value-overwrites the even-match slot2 (former 'Winner of B2,k' formula) seed + name", () => {
    const map = map16();
    // winners_r1[0] slot1 (S6/T6) was the Barrage formula -> overwrite both.
    expect(map.get('S6')).toMatchObject({ op: 'overwriteNumber', value: 16 }); // B-pos 16
    expect(map.get('T6')).toMatchObject({ op: 'overwriteString', value: 'B16' });
    // The genuinely-typed slot0 stays a plain typed number.
    expect(map.get('S5')).toMatchObject({ op: 'number', value: 1 });
  });

  it('strips the unused Barrage blocks (seed, name and score cells)', () => {
    const map = map16();
    for (const ref of ['E5', 'F5', 'H5', 'L5', 'M5', 'O5']) {
      expect(map.get(ref)?.op).toBe('strip');
    }
  });

  it('logs the degradation', () => {
    map16();
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining('16-player'),
      expect.objectContaining({ mode: 'bm' }),
    );
  });
});

/* ----------------------------------------------------------------- *
 * Degraded 8-player bracket.
 * ----------------------------------------------------------------- */

describe('buildFinalsWrites — degraded 8-player', () => {
  // 8-player structure winners_qf seedPairs [1,8],[4,5],[2,7],[3,6]; B-pos 1..8.
  function build8(): CdmMatch[] {
    const qf: Array<[number, number]> = [
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ];
    const qfMatches = qf.map(([p1, p2], i) =>
      mk({ matchNumber: i + 1, stage: 'finals', round: 'winners_qf', p1, p2, s1: 4, s2: 2 }),
    );
    // Add a winners_final so we can check name overwrite on a downstream block.
    const wf = mk({ matchNumber: 7, stage: 'finals', round: 'winners_final', p1: 1, p2: 4, s1: 4, s2: 1 });
    return [...qfMatches, wf];
  }
  const map8 = () => indexWrites(buildFinalsWrites(emptyData({ bmMatches: build8() }), 'bm'), 'BM Finals');

  it('writes the 8-player seed list (B1..8)', () => {
    const map = map8();
    expectString(map, 'B3', 'B1');
    expectString(map, 'B10', 'B8');
    expectClear(map, 'B11'); // B-pos 9 unused
  });

  it('value-overwrites winners_qf slot names and scores from the records', () => {
    const map = map8();
    // winners_qf[0]: slot0 name Z->AA7 = "B1", score AC7 = 4; slot1 AA8 = "B8", AC8 = 2.
    expect(map.get('AA7')).toMatchObject({ op: 'overwriteString', value: 'B1' });
    expect(map.get('AC7')).toMatchObject({ op: 'overwriteNumber', value: 4 });
    expect(map.get('AA8')).toMatchObject({ op: 'overwriteString', value: 'B8' });
    expect(map.get('AC8')).toMatchObject({ op: 'overwriteNumber', value: 2 });
  });

  it('value-overwrites a downstream winners_final name from the record', () => {
    const map = map8();
    expect(map.get('AO19')).toMatchObject({ op: 'overwriteString', value: 'B1' });
    expect(map.get('AO20')).toMatchObject({ op: 'overwriteString', value: 'B4' });
  });

  it('strips unused regions (Top16, Barrage, losers_r4, surplus losers slots)', () => {
    const map = map8();
    // Top16 winners_r1 name cell, Barrage, losers_r4 name, and losers_r1 idx2 (row49).
    expect(map.get('T5')?.op).toBe('strip'); // winners_r1[0] slot0 name (unused)
    expect(map.get('F5')?.op).toBe('strip'); // Barrage1 name
    expect(map.get('AO43')?.op).toBe('strip'); // losers_r4[0] name (unused)
    expect(map.get('T49')?.op).toBe('strip'); // losers_r1[2] name (row 49, surplus)
  });

  it('empties unused seed cells per type: typed -> clearValue, formula -> strip', () => {
    const map = map8();
    // Top16 winners_r1[0] slot0 seed (S5) is a TYPED seed cell -> cleared.
    expect(map.get('S5')?.op).toBe('clearValue');
    // losers_r4[0] slot0 seed (AN43) is a reverse-lookup FORMULA cell -> stripped.
    expect(map.get('AN43')?.op).toBe('strip');
  });

  it('logs the 8-player degradation', () => {
    map8();
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining('8-player'), expect.objectContaining({ mode: 'bm' }));
  });
});

/* ----------------------------------------------------------------- *
 * No finals — everything cleared.
 * ----------------------------------------------------------------- */

describe('buildFinalsWrites — no finals', () => {
  const map = indexWrites(buildFinalsWrites(emptyData(), 'bm'), 'BM Finals');

  it('clears the whole seed list B3:B26', () => {
    expectClear(map, 'B3');
    expectClear(map, 'B26');
  });

  it('clears every typed seed and score cell and touches no formula cell', () => {
    expectClear(map, 'S5'); // a typed seed
    expectClear(map, 'V5'); // a score cell
    expectClear(map, 'E5'); // playoff seed
    expectUntouched(map, 'T5'); // name formula never touched
    expectUntouched(map, 'F5'); // playoff name formula never touched
    // Formula seed cells (reverse XLOOKUP in formula slots) stay intact too, so
    // the empty template recomputes a clean blank bracket.
    expectUntouched(map, 'Z7'); // winners_qf[0] slot0 reverse-lookup seed cell
    expectUntouched(map, 'AA7'); // winners_qf[0] slot0 advancement formula
  });
});

/* ----------------------------------------------------------------- *
 * GP mode uses points instead of scores; MR/GP target their own sheets.
 * ----------------------------------------------------------------- */

describe('buildFinalsWrites — GP points and per-mode sheet targeting', () => {
  it('writes GP scores from points1/points2', () => {
    const matches = build24WinnersAndPlayoff('gp');
    const map = indexWrites(buildFinalsWrites(emptyData({ gpMatches: matches }), 'gp'), 'GP Finals');
    // winners_r1[1] both typed: bp8 points 4 -> V9, bp9 points 1 -> V10.
    expectNumber(map, 'V9', 4);
    expectNumber(map, 'V10', 1);
  });

  it('writes MR scores from score1/score2 onto the MR Finals sheet', () => {
    const matches = build24WinnersAndPlayoff('mr');
    const map = indexWrites(buildFinalsWrites(emptyData({ mrMatches: matches }), 'mr'), 'MR Finals');
    expectNumber(map, 'V9', 4);
    expectNumber(map, 'V10', 1);
    expectString(map, 'B3', 'B1'); // seed list lands on the MR sheet
  });

  it('targets the sheet that matches the mode', () => {
    for (const mode of ['bm', 'mr', 'gp'] as const) {
      const writes = buildFinalsWrites(emptyData(), mode);
      expect(writes.every((w) => w.sheet === SHEET_BY_MODE[mode])).toBe(true);
      expect(writes.length).toBeGreaterThan(0);
    }
  });
});

/* ----------------------------------------------------------------- *
 * GP's original seed list is a qualification-derived spill. KO export replaces
 * it with canonical bracket entrants because later qualification corrections
 * must not rewrite a published KO seed.
 * ----------------------------------------------------------------- */

describe('buildFinalsWrites — GP seed list is canonical KO data', () => {
  it('writes GP scores and replaces the B3:B26 spill with the bracket seed list', () => {
    const map = indexWrites(
      buildFinalsWrites(emptyData({ gpMatches: build24WinnersAndPlayoff('gp') }), 'gp'),
      'GP Finals',
    );
    // Scores still land (GP uses points1/points2): winners_r1[1] bp8/bp9 -> V9/V10.
    expectNumber(map, 'V9', 4);
    expectNumber(map, 'V10', 1);
    expect(map.get('B3')).toEqual(expect.objectContaining({ op: 'overwriteString', value: 'B1' }));
    expect(map.get('B26')).toEqual(expect.objectContaining({ op: 'overwriteString', value: 'B24' }));
  });

  it('removes the GP seed list on the no-finals path and still clears typed seeds', () => {
    const map = indexWrites(buildFinalsWrites(emptyData(), 'gp'), 'GP Finals');
    for (let row = 3; row <= 26; row++) expect(map.get(`B${row}`)).toEqual(expect.objectContaining({ op: 'strip' }));
    expectClear(map, 'S5'); // a typed winners_r1 seed cell is still cleared.
  });

  it('writes seed lists for BM/MR and the canonical overwrite list for GP', () => {
    const bm = indexWrites(
      buildFinalsWrites(emptyData({ bmMatches: build24WinnersAndPlayoff('bm') }), 'bm'),
      'BM Finals',
    );
    const gp = indexWrites(
      buildFinalsWrites(emptyData({ gpMatches: build24WinnersAndPlayoff('gp') }), 'gp'),
      'GP Finals',
    );
    expectString(bm, 'B3', 'B1'); // BM seed list is a typed input.
    expect(gp.get('B3')).toEqual(expect.objectContaining({ op: 'overwriteString', value: 'B1' }));
  });
});

/* ----------------------------------------------------------------- *
 * Edge cases: unmappable matches, excess match index, ranking tiebreaks.
 * ----------------------------------------------------------------- */

describe('buildFinalsWrites — unmappable matches', () => {
  it('clears to a blank bracket and warns when no match maps to a bracket round', () => {
    // A non-finals stray (qualification stage, unknown round) maps to no bracket
    // round and is not a playoff -> treated as blank.
    const matches: CdmMatch[] = [
      mk({ matchNumber: 1, stage: 'qualification', round: 'qualification', p1: 1, p2: 2, s1: 4, s2: 1 }),
    ];
    const map = indexWrites(buildFinalsWrites(emptyData({ bmMatches: matches }), 'bm'), 'BM Finals');
    expectClear(map, 'B3'); // seed list cleared
    expectClear(map, 'S5'); // typed seed cleared
    expectUntouched(map, 'T5'); // formula preserved
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining('no recognizable bracket rounds'),
      expect.objectContaining({ mode: 'bm', count: 1 }),
    );
  });
});

describe('buildFinalsWrites — excess match index in a round', () => {
  it('skips and warns when a round has more matches than its geometry', () => {
    // winners_final geometry holds 1 match; supply 2 (a corrupt record) on top of
    // a real bracket so the faithful path runs and the surplus is skipped.
    const matches: CdmMatch[] = [
      ...build24WinnersAndPlayoff(),
      mk({ matchNumber: 28, stage: 'finals', round: 'winners_final', p1: 1, p2: 2, s1: 4, s2: 1 }),
      mk({ matchNumber: 99, stage: 'finals', round: 'winners_final', p1: 3, p2: 4, s1: 4, s2: 1 }),
    ];
    buildFinalsWrites(emptyData({ bmMatches: matches }), 'bm');
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining('exceeds round geometry'),
      expect.objectContaining({ round: 'winners_final', matchIndex: 1 }),
    );
  });
});

describe('buildFinalsWrites — playoff-only B1..12 ranking tiebreaks', () => {
  function qual(id: string, over: Partial<CdmModeQualification> = {}): CdmModeQualification {
    return {
      player: { id, name: id, nickname: id },
      group: 'A',
      seeding: null,
      points: 0,
      score: 0,
      ...over,
    };
  }
  it('orders direct qualifiers rankOverride asc (nulls last) then score/points/nickname', () => {
    const playoff = build24WinnersAndPlayoff().filter((m) => m.stage === 'playoff');
    const quals: CdmModeQualification[] = [
      qual('zNickHighScore', { score: 50 }), // no rankOverride; highest score
      qual('aNickLowScore', { score: 10 }), // no rankOverride; lower score
      qual('ranked1', { rankOverride: 1, score: 0 }), // explicit rank wins
      qual('tieA', { score: 30, points: 5 }), // tie on score -> points decides
      qual('tieB', { score: 30, points: 9 }), // higher points first
    ];
    const data = emptyData({ bmMatches: playoff, bmQualifications: quals });
    const map = indexWrites(buildFinalsWrites(data, 'bm'), 'BM Finals');
    // Expected order: ranked1 (rankOverride 1) -> tieB (score30/pts9) ->
    // tieA (score30/pts5) -> zNickHighScore (score50? no: it has no rankOverride,
    // so it sorts after all rankOverride rows) ...
    // rankOverride rows first: only ranked1. Then null-rankOverride rows by score
    // desc: zNickHighScore(50) -> tieB(30) -> tieA(30) -> aNickLowScore(10).
    // Within score-30 tie, points desc: tieB before tieA.
    expectString(map, 'B3', 'ranked1'); // B-pos 1
    expectString(map, 'B4', 'zNickHighScore'); // B-pos 2 (highest score, no rank)
    expectString(map, 'B5', 'tieB'); // B-pos 3 (score30, points9)
    expectString(map, 'B6', 'tieA'); // B-pos 4 (score30, points5)
    expectString(map, 'B7', 'aNickLowScore'); // B-pos 5 (lowest score)
  });
});

/**
 * Tests for the BM/MR/GP Qualifications fill map (per-player match blocks).
 *
 * Ground truth: /tmp/cdm-analysis/sheet2025/sheet_{BM,MR,GP}_Qualifications.txt
 *
 *   Block 0 data rows 2..16 (15 rows), header row 17 ('Match','TV #',…),
 *   block 1 data rows 18..32, stride 16. Owner column V is constant per block
 *   (e.g. V2..V16 all 'Drew'); block 1 owner is 'KVD' on row 18.
 *
 *   Per row (owner perspective):
 *     S = match #            (S2 = 1)
 *     T = TV #               (blank when unset)
 *     U = owner side         (U2 = 2)
 *     V = owner nickname     (V2 = 'Drew')
 *     W = owner score        (BM/MR: rounds won 0..4; GP: driver points 0..45)
 *     X = '-'                (literal — never touched)
 *     Z = opponent nickname  (Z2 = 'Break' for a BYE)
 *     AA = opponent side     (AA2 = 1)
 *
 *   BM:  Y2 = '=IF(W2="","",4-W2)' (formula), AB2/AC2/AD2 = W/T/L formulas.
 *   MR:  Y2 formula; AB..AE = Round 1..4 courses (inputs); AF/AG/AH formulas.
 *   GP:  Y2 = 0 (a RAW number input = opponent points); AB = cup (input);
 *        AC/AD/AE = W/T/L formulas.
 *
 * The fill map writes only S,T,U,V,W,Z,AA (+ GP:Y, AB; MR:AB..AE) and clears
 * unused input cells. It must never touch X, the BM/MR Y formula, the W/T/L
 * columns, the standings E..Q, or anything from AF onward.
 */

import { buildQualificationWrites } from '@/lib/cdm-export/fill/qualifications';
import { QUAL_BLOCK_FIRST_DATA_ROW, QUAL_BLOCK_STRIDE } from '@/lib/cdm-export/cdm-constants';
import type {
  CdmMatch,
  CdmModeQualification,
  CdmPlayer,
  CdmTournamentData,
  CdmVersusMode,
} from '@/lib/cdm-export/types';
import { indexWrites, expectString, expectNumber, expectClear, expectUntouched, writtenRefs } from './write-helpers';

const BREAK_PLAYER_ID = '__BREAK__';

function player(id: string, nickname: string, name = nickname): CdmPlayer {
  return { id, name, nickname };
}

const BREAK_PLAYER: CdmPlayer = player(BREAK_PLAYER_ID, 'Break');

function qual(p: CdmPlayer, group: string, seeding: number | null): CdmModeQualification {
  return { player: p, group, seeding, points: 0, score: 0 };
}

interface MatchOpts {
  matchNumber: number;
  roundNumber?: number | null;
  tvNumber?: number | null;
  player1: CdmPlayer;
  player2: CdmPlayer;
  player1Side?: number | null;
  player2Side?: number | null;
  score1?: number | null;
  score2?: number | null;
  points1?: number | null;
  points2?: number | null;
  completed?: boolean;
  assignedCourses?: unknown;
  cup?: string | null;
  isBye?: boolean;
}

function match(opts: MatchOpts): CdmMatch {
  return {
    stage: 'qualification',
    completed: opts.completed ?? true,
    ...opts,
  };
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

/** First data row of block i (i 0-based). */
function blockRow(i: number, offset = 0): number {
  return QUAL_BLOCK_FIRST_DATA_ROW + i * QUAL_BLOCK_STRIDE + offset;
}

/** Build a 2-player, single-group BM tournament with one real match. */
function twoPlayerBm(matchOver: Partial<MatchOpts> = {}): { data: CdmTournamentData; a: CdmPlayer; b: CdmPlayer } {
  const a = player('pa', 'Drew');
  const b = player('pb', 'Lio');
  const data = emptyData({
    bmQualifications: [qual(a, 'A', 1), qual(b, 'A', 2)],
    bmMatches: [
      match({
        matchNumber: 1,
        roundNumber: 1,
        player1: a,
        player2: b,
        player1Side: 1,
        player2Side: 2,
        score1: 4,
        score2: 1,
        ...matchOver,
      }),
    ],
  });
  return { data, a, b };
}

const sheetOf: Record<CdmVersusMode, 'BM Qualifications' | 'MR Qualifications' | 'GP Qualifications'> = {
  bm: 'BM Qualifications',
  mr: 'MR Qualifications',
  gp: 'GP Qualifications',
};

describe('buildQualificationWrites — block placement', () => {
  it('owns block i to computeSheetPlayerOrder[i] (group A seed asc, then B)', () => {
    const a1 = player('a1', 'A1');
    const a2 = player('a2', 'A2');
    const b1 = player('b1', 'B1');
    const b2 = player('b2', 'B2');
    const data = emptyData({
      bmQualifications: [qual(a1, 'A', 1), qual(a2, 'A', 2), qual(b1, 'B', 1), qual(b2, 'B', 2)],
      // One real match between a1 and b1 so each owner's block has a row.
      bmMatches: [
        match({
          matchNumber: 5,
          roundNumber: 1,
          player1: a1,
          player2: b1,
          player1Side: 1,
          player2Side: 2,
          score1: 4,
          score2: 0,
        }),
      ],
    });
    const map = indexWrites(buildQualificationWrites(data, 'bm'), sheetOf.bm);
    // Block order: a1(0), a2(1), b1(2), b2(3).
    expectString(map, `V${blockRow(0)}`, 'A1'); // a1 owns block 0
    expectString(map, `V${blockRow(2)}`, 'B1'); // b1 owns block 2
    // a1's block 0 row 0: match 5 vs B1.
    expectNumber(map, `S${blockRow(0)}`, 5);
    expectString(map, `Z${blockRow(0)}`, 'B1');
    // b1's block 2 row 0: same match, owner B1 vs A1.
    expectNumber(map, `S${blockRow(2)}`, 5);
    expectString(map, `Z${blockRow(2)}`, 'A1');
  });

  it('never writes the header row 17 (between block 0 and block 1)', () => {
    // 17 players forces a block 1; the header row 17 must be left intact.
    // Sequential seeds so the block order is deterministic; one group of 17.
    const players = Array.from({ length: 17 }, (_, i) => player(`p${i}`, `N${String(i).padStart(2, '0')}`));
    const data = emptyData({
      bmQualifications: players.map((p, i) => qual(p, 'A', i + 1)),
    });
    const writes = buildQualificationWrites(data, 'bm');
    const map = indexWrites(writes, sheetOf.bm);
    for (const col of ['S', 'T', 'U', 'V', 'W', 'Z', 'AA']) {
      expectUntouched(map, `${col}17`); // header row never written or cleared
    }
  });
});

describe('buildQualificationWrites — owner-perspective row (BM)', () => {
  it("writes S,T,U,V,W,Z,AA from the owner's side", () => {
    const { data } = twoPlayerBm({ tvNumber: 7, player1Side: 2, player2Side: 1 });
    const map = indexWrites(buildQualificationWrites(data, 'bm'), sheetOf.bm);
    // a (Drew) is player1, owns block 0.
    expectNumber(map, `S${blockRow(0)}`, 1); // matchNumber
    expectNumber(map, `T${blockRow(0)}`, 7); // tvNumber
    expectNumber(map, `U${blockRow(0)}`, 2); // owner side = player1Side
    expectString(map, `V${blockRow(0)}`, 'Drew');
    expectNumber(map, `W${blockRow(0)}`, 4); // owner score = score1
    expectString(map, `Z${blockRow(0)}`, 'Lio');
    expectNumber(map, `AA${blockRow(0)}`, 1); // opponent side = player2Side
  });

  it("writes the opponent's perspective in the other player's block", () => {
    const { data } = twoPlayerBm({ player1Side: 1, player2Side: 2 });
    const map = indexWrites(buildQualificationWrites(data, 'bm'), sheetOf.bm);
    // b (Lio) owns block 1; from Lio's view owner score = score2 = 1.
    expectString(map, `V${blockRow(1)}`, 'Lio');
    expectNumber(map, `U${blockRow(1)}`, 2); // Lio is player2 -> side 2
    expectNumber(map, `W${blockRow(1)}`, 1); // owner score = score2
    expectString(map, `Z${blockRow(1)}`, 'Drew');
    expectNumber(map, `AA${blockRow(1)}`, 1); // opponent (Drew) side
  });

  it('clears T when tvNumber is null and defaults sides when null', () => {
    const { data } = twoPlayerBm({ tvNumber: null, player1Side: null, player2Side: null });
    const map = indexWrites(buildQualificationWrites(data, 'bm'), sheetOf.bm);
    expectClear(map, `T${blockRow(0)}`); // null tvNumber -> clear
    expectNumber(map, `U${blockRow(0)}`, 1); // player1 default side 1
    expectNumber(map, `AA${blockRow(0)}`, 2); // player2 default side 2
  });

  it('never writes X, the BM Y formula, or the W/T/L formula columns', () => {
    const { data } = twoPlayerBm();
    const map = indexWrites(buildQualificationWrites(data, 'bm'), sheetOf.bm);
    for (const col of ['X', 'Y', 'AB', 'AC', 'AD']) {
      expectUntouched(map, `${col}${blockRow(0)}`);
    }
  });
});

describe('buildQualificationWrites — incomplete matches', () => {
  it('clears the BM score (W) when the match is not completed', () => {
    const { data } = twoPlayerBm({ completed: false, score1: 0, score2: 0 });
    const map = indexWrites(buildQualificationWrites(data, 'bm'), sheetOf.bm);
    // Match meta still written, but the score is cleared (never a bogus 0).
    expectNumber(map, `S${blockRow(0)}`, 1);
    expectString(map, `V${blockRow(0)}`, 'Drew');
    expectClear(map, `W${blockRow(0)}`);
    expectClear(map, `W${blockRow(1)}`); // opponent block too
  });

  it('clears both GP scores (W and Y) when the match is not completed', () => {
    const a = player('pa', 'Lafungo');
    const b = player('pb', 'Rival');
    const data = emptyData({
      gpQualifications: [qual(a, 'A', 1), qual(b, 'A', 2)],
      gpMatches: [
        match({
          matchNumber: 1,
          roundNumber: 1,
          player1: a,
          player2: b,
          points1: 0,
          points2: 0,
          completed: false,
          cup: 'Star',
        }),
      ],
    });
    const map = indexWrites(buildQualificationWrites(data, 'gp'), sheetOf.gp);
    expectClear(map, `W${blockRow(0)}`);
    expectClear(map, `Y${blockRow(0)}`); // GP opponent points also cleared
    // Cup is metadata and is still written even while scores are pending.
    expectString(map, `AB${blockRow(0)}`, 'Star');
  });
});

describe('buildQualificationWrites — BREAK matches', () => {
  it('omits a BM BREAK from the real player block', () => {
    const a = player('pa', 'Drew');
    const data = emptyData({
      bmQualifications: [qual(a, 'A', 1)],
      bmMatches: [
        match({
          matchNumber: 1,
          roundNumber: 1,
          player1: a, // real player is always player1 for a BYE
          player2: BREAK_PLAYER,
          player1Side: 2,
          player2Side: 1,
          score1: 4,
          score2: 0,
          isBye: true,
        }),
      ],
    });
    const writes = buildQualificationWrites(data, 'bm');
    const map = indexWrites(writes, sheetOf.bm);
    expectClear(map, `V${blockRow(0)}`);
    expectClear(map, `W${blockRow(0)}`);
    expectClear(map, `Z${blockRow(0)}`);
    expectClear(map, `AA${blockRow(0)}`);
  });

  it('omits a GP BREAK and its cup from the data row', () => {
    const a = player('pa', 'Lafungo');
    const data = emptyData({
      gpQualifications: [qual(a, 'A', 1)],
      gpMatches: [
        match({
          matchNumber: 1,
          roundNumber: 1,
          player1: a,
          player2: BREAK_PLAYER,
          points1: 45,
          points2: 0,
          cup: 'Star',
          isBye: true,
        }),
      ],
    });
    const map = indexWrites(buildQualificationWrites(data, 'gp'), sheetOf.gp);
    expectClear(map, `W${blockRow(0)}`); // BREAK is schedule-only
    expectClear(map, `Y${blockRow(0)}`); // BREAK is schedule-only
    expectClear(map, `Z${blockRow(0)}`);
    expectClear(map, `AB${blockRow(0)}`);
  });
});

describe('buildQualificationWrites — MR courses and GP cup', () => {
  it('writes MR assignedCourses[0..3] to AB..AE and clears missing slots', () => {
    const a = player('pa', 'Sami');
    const b = player('pb', 'Lio');
    const data = emptyData({
      mrQualifications: [qual(a, 'A', 1), qual(b, 'A', 2)],
      mrMatches: [
        match({
          matchNumber: 1,
          roundNumber: 1,
          player1: a,
          player2: b,
          score1: 4,
          score2: 0,
          assignedCourses: ['BC1', 'DP1', 'VL1'], // only 3 -> AE cleared
        }),
      ],
    });
    const map = indexWrites(buildQualificationWrites(data, 'mr'), sheetOf.mr);
    expectString(map, `AB${blockRow(0)}`, 'BC1');
    expectString(map, `AC${blockRow(0)}`, 'DP1');
    expectString(map, `AD${blockRow(0)}`, 'VL1');
    expectClear(map, `AE${blockRow(0)}`); // 4th course absent -> clear
    // MR must never touch Y (it is the =4-W formula) or the W/T/L cols AF..AH.
    for (const col of ['Y', 'AF', 'AG', 'AH']) {
      expectUntouched(map, `${col}${blockRow(0)}`);
    }
  });

  it('writes GP cup to AB and clears it when null', () => {
    const a = player('pa', 'Lafungo');
    const b = player('pb', 'Rival');
    const data = emptyData({
      gpQualifications: [qual(a, 'A', 1), qual(b, 'A', 2)],
      gpMatches: [
        match({
          matchNumber: 1,
          roundNumber: 1,
          player1: a,
          player2: b,
          points1: 30,
          points2: 15,
          cup: null, // -> clear
        }),
      ],
    });
    const map = indexWrites(buildQualificationWrites(data, 'gp'), sheetOf.gp);
    expectClear(map, `AB${blockRow(0)}`);
    // GP writes opponent points into Y for completed matches.
    expectNumber(map, `Y${blockRow(0)}`, 15);
  });
});

describe('buildQualificationWrites — ordering within a block', () => {
  it("lists the owner's matches by roundNumber then matchNumber ascending", () => {
    const a = player('pa', 'Drew');
    const b = player('pb', 'Lio');
    const c = player('pc', 'KVD');
    const data = emptyData({
      bmQualifications: [qual(a, 'A', 1), qual(b, 'A', 2), qual(c, 'A', 3)],
      bmMatches: [
        // Intentionally out of order; round 2 before round 1, higher match# first.
        match({ matchNumber: 9, roundNumber: 2, player1: a, player2: c, score1: 4, score2: 1 }),
        match({ matchNumber: 2, roundNumber: 1, player1: a, player2: b, score1: 4, score2: 0 }),
      ],
    });
    const map = indexWrites(buildQualificationWrites(data, 'bm'), sheetOf.bm);
    // Drew owns block 0. Row 0 = round1 (match 2 vs Lio), row 1 = round2 (match 9 vs KVD).
    expectNumber(map, `S${blockRow(0, 0)}`, 2);
    expectString(map, `Z${blockRow(0, 0)}`, 'Lio');
    expectNumber(map, `S${blockRow(0, 1)}`, 9);
    expectString(map, `Z${blockRow(0, 1)}`, 'KVD');
  });

  it('ignores non-qualification matches (finals/playoff)', () => {
    const a = player('pa', 'Drew');
    const b = player('pb', 'Lio');
    const data = emptyData({
      bmQualifications: [qual(a, 'A', 1), qual(b, 'A', 2)],
      bmMatches: [
        match({
          matchNumber: 1,
          roundNumber: 1,
          player1: a,
          player2: b,
          score1: 4,
          score2: 0,
          stage: 'finals',
        } as MatchOpts & { stage: string }),
      ],
    });
    const map = indexWrites(buildQualificationWrites(data, 'bm'), sheetOf.bm);
    // No qualification match -> block 0 row 0 input cells are all cleared.
    expectClear(map, `S${blockRow(0)}`);
    expectClear(map, `V${blockRow(0)}`);
  });
});

describe('buildQualificationWrites — clearing unused rows and blocks', () => {
  it('clears the input cells of unused rows within an owned block', () => {
    const { data } = twoPlayerBm();
    const map = indexWrites(buildQualificationWrites(data, 'bm'), sheetOf.bm);
    // Block 0 (Drew) has exactly one match on row 0; rows 1..14 are cleared.
    for (const col of ['S', 'T', 'U', 'V', 'W', 'Z', 'AA']) {
      expectClear(map, `${col}${blockRow(0, 1)}`);
      expectClear(map, `${col}${blockRow(0, 14)}`); // last data row of block 0 (row 16)
    }
  });

  it("clears all 48 blocks' input cells even when far more blocks exist than players", () => {
    const { data } = twoPlayerBm();
    const writes = buildQualificationWrites(data, 'bm');
    const map = indexWrites(writes, sheetOf.bm);
    // Block 2 (unused, row 34) input cells cleared; block 47 (last) too.
    expectClear(map, `S${blockRow(2)}`);
    expectClear(map, `V${blockRow(47)}`);
    // Last block's last data row = 2 + 47*16 + 14 = 768.
    expectClear(map, `S${blockRow(47, 14)}`);
    // Nothing is written below the table (row 769+).
    for (const ref of writtenRefs(writes, sheetOf.bm)) {
      const row = Number(ref.replace(/[A-Z]/g, ''));
      expect(row).toBeLessThanOrEqual(768);
    }
  });

  it('clears GP Y and AB on unused rows, MR AB..AE on unused rows', () => {
    const a = player('pa', 'Lafungo');
    const dataGp = emptyData({
      gpQualifications: [qual(a, 'A', 1)],
      gpMatches: [], // no matches -> all rows of block 0 cleared
    });
    const mapGp = indexWrites(buildQualificationWrites(dataGp, 'gp'), sheetOf.gp);
    expectClear(mapGp, `Y${blockRow(0)}`);
    expectClear(mapGp, `AB${blockRow(0)}`);

    const s = player('ps', 'Sami');
    const dataMr = emptyData({
      mrQualifications: [qual(s, 'A', 1)],
      mrMatches: [],
    });
    const mapMr = indexWrites(buildQualificationWrites(dataMr, 'mr'), sheetOf.mr);
    for (const col of ['AB', 'AC', 'AD', 'AE']) {
      expectClear(mapMr, `${col}${blockRow(0)}`);
    }
  });
});

describe('buildQualificationWrites — empty input and never touching standings', () => {
  it('emits only clears (no values) for a mode with no qualifiers', () => {
    const data = emptyData();
    const writes = buildQualificationWrites(data, 'bm');
    for (const w of writes) expect(w.op).toBe('clearValue');
  });

  it('never writes the standings columns E..Q or the match-area header column', () => {
    const { data } = twoPlayerBm();
    const map = indexWrites(buildQualificationWrites(data, 'bm'), sheetOf.bm);
    for (const col of ['A', 'B', 'C', 'E', 'F', 'G', 'H', 'I', 'O', 'P', 'Q']) {
      expectUntouched(map, `${col}${blockRow(0)}`);
      expectUntouched(map, `${col}3`);
    }
  });
});

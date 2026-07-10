/**
 * Unit tests for replayTTFinals (TC-2557–TC-2566, TC-3004–TC-3005).
 *
 * replayTTFinals is a pure function that reconstructs the TT Finals CDM
 * spreadsheet life-ledger from persisted tournament data. It performs no
 * database access and can be fully covered by unit tests with inline fixtures.
 */

jest.mock('@/lib/logger', () => {
  const warn = jest.fn();
  return {
    createLogger: () => ({ warn, info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  };
});

import { createLogger } from '@/lib/logger';
import { replayTTFinals } from '@/lib/cdm-export/fill/tt-lives-replay';
import type {
  CdmTournamentData,
  CdmTTEntry,
  CdmTTPhaseRound,
  CdmTTPhaseSuddenDeathRound,
} from '@/lib/cdm-export/types';

const warnMock = (createLogger('tt-lives-replay-test') as unknown as { warn: jest.Mock }).warn;

function makeData(
  ttEntries: CdmTTEntry[] = [],
  ttPhaseRounds: CdmTTPhaseRound[] = [],
): CdmTournamentData {
  return {
    name: 'test',
    date: new Date('2025-01-01'),
    bmQualifications: [],
    mrQualifications: [],
    gpQualifications: [],
    bmMatches: [],
    mrMatches: [],
    gpMatches: [],
    ttEntries,
    ttPhaseRounds,
  };
}

function makeQualEntry(
  playerId: string,
  rank: number,
  totalTime = 60000,
): CdmTTEntry {
  return {
    player: { id: playerId, name: playerId, nickname: playerId },
    playerId,
    stage: 'qualification',
    seeding: null,
    lives: 0,
    eliminated: false,
    totalTime,
    qualificationPoints: 100 - rank,
    rank,
  };
}

function makePhaseRound(
  phase: string,
  roundNumber: number,
  results: Array<{ playerId: string; timeMs: number | null }>,
  eliminatedIds: string[] = [],
  livesReset = false,
  suddenDeathRounds: CdmTTPhaseSuddenDeathRound[] = [],
): CdmTTPhaseRound {
  return {
    phase,
    roundNumber,
    course: 'MC1',
    results,
    eliminatedIds,
    livesReset,
    suddenDeathRounds,
  };
}

/** A single resolved sudden-death round, in the shape TTPhaseSuddenDeathRound.results persists. */
function makeSuddenDeath(
  sequence: number,
  results: Array<{ playerId: string; timeMs: number }>,
): CdmTTPhaseSuddenDeathRound {
  return { sequence, results };
}

describe('replayTTFinals', () => {
  beforeEach(() => {
    warnMock.mockClear();
  });

  it('TC-2557: empty data returns empty array', () => {
    expect(replayTTFinals(makeData())).toEqual([]);
  });

  it('TC-2558: phase1 — eliminated player loses its life; others keep 1', () => {
    const entries = [makeQualEntry('p1', 1), makeQualEntry('p2', 2)];
    const rounds = [
      makePhaseRound(
        'phase1', 1,
        [{ playerId: 'p1', timeMs: 5000 }, { playerId: 'p2', timeMs: 6000 }],
        ['p2'],
      ),
    ];
    const result = replayTTFinals(makeData(entries, rounds));

    expect(result).toHaveLength(1);
    expect(result[0].lostLife).toEqual(new Set(['p2']));
    expect(result[0].livesAfter.get('p1')).toBe(1);
    expect(result[0].livesAfter.get('p2')).toBe(0);
    // Phase1 has no Gain entries
    expect(result[0].gains.size).toBe(0);
  });

  it('TC-2559: phase3 — bottom half by time loses a life (Math.ceil split)', () => {
    // 4 runners: p1=5000, p2=6000, p3=7000, p4=8000
    // halfwayPoint = Math.ceil(4/2) = 2 → p3 and p4 lose a life
    const entries = [
      makeQualEntry('p1', 1), makeQualEntry('p2', 2),
      makeQualEntry('p3', 3), makeQualEntry('p4', 4),
    ];
    const rounds = [
      makePhaseRound(
        'phase3', 1,
        [
          { playerId: 'p1', timeMs: 5000 }, { playerId: 'p2', timeMs: 6000 },
          { playerId: 'p3', timeMs: 7000 }, { playerId: 'p4', timeMs: 8000 },
        ],
      ),
    ];
    const result = replayTTFinals(makeData(entries, rounds));

    expect(result[0].lostLife).toEqual(new Set(['p3', 'p4']));
    // p1 and p2 keep their (topped-up) lives
    expect(result[0].livesAfter.get('p1')).toBe(3);
    expect(result[0].livesAfter.get('p2')).toBe(3);
    expect(result[0].livesAfter.get('p3')).toBe(2);
    expect(result[0].livesAfter.get('p4')).toBe(2);
  });

  it('TC-2560: phase3 — first-time participants receive +2 entry gain', () => {
    // Players carry 1 life into phase3; PHASE3_INITIAL_LIVES(3) - 1 = 2 gain
    const entries = [makeQualEntry('p1', 1), makeQualEntry('p2', 2)];
    const rounds = [
      makePhaseRound(
        'phase3', 1,
        [{ playerId: 'p1', timeMs: 5000 }, { playerId: 'p2', timeMs: 6000 }],
      ),
    ];
    const result = replayTTFinals(makeData(entries, rounds));

    expect(result[0].gains.get('p1')).toBe(2);
    expect(result[0].gains.get('p2')).toBe(2);
  });

  it('TC-2561: phase3 — life-reset round tops surviving participants back to 3', () => {
    // Round 1 (no reset): all 4 enter phase3 (gain +2), p3 and p4 lose a life
    // After round 1: p1=3, p2=3, p3=2, p4=2
    // Round 2 (livesReset=true): p3 and p4 again in bottom half, lose a life
    //   before reset: p3=2-1=1, p4=2-1=1 → both > 0 → reset to 3
    //   reset gain for p3 = 3-1 = 2, for p4 = 3-1 = 2
    const entries = [
      makeQualEntry('p1', 1), makeQualEntry('p2', 2),
      makeQualEntry('p3', 3), makeQualEntry('p4', 4),
    ];
    const results4 = [
      { playerId: 'p1', timeMs: 5000 }, { playerId: 'p2', timeMs: 6000 },
      { playerId: 'p3', timeMs: 7000 }, { playerId: 'p4', timeMs: 8000 },
    ];
    const rounds = [
      makePhaseRound('phase3', 1, results4, [], false),
      makePhaseRound('phase3', 2, results4, [], true),
    ];
    const result = replayTTFinals(makeData(entries, rounds));

    const r2 = result[1];
    // Survivors get reset to 3
    expect(r2.livesAfter.get('p1')).toBe(3);
    expect(r2.livesAfter.get('p2')).toBe(3);
    expect(r2.livesAfter.get('p3')).toBe(3);
    expect(r2.livesAfter.get('p4')).toBe(3);
    // Gain encodes the reset top-up for p3 and p4
    expect(r2.gains.get('p3')).toBe(2);
    expect(r2.gains.get('p4')).toBe(2);
    // p1 and p2 already at 3 — no extra gain needed
    expect(r2.gains.get('p1')).toBeUndefined();
    expect(r2.gains.get('p2')).toBeUndefined();
  });

  it('TC-2562: universe is ordered by persisted rank (rank 1 before rank 2)', () => {
    // Provide entries in reverse rank order to verify ordering
    const entries = [makeQualEntry('p2', 2), makeQualEntry('p1', 1)];
    const rounds = [
      makePhaseRound('phase1', 1, [
        { playerId: 'p1', timeMs: 5000 }, { playerId: 'p2', timeMs: 6000 },
      ], ['p2']),
    ];
    const result = replayTTFinals(makeData(entries, rounds));

    // Round 1 input order reflects universe: rank-1 player (p1) first
    expect(result[0].inputRowOrder[0]).toBe('p1');
    expect(result[0].inputRowOrder[1]).toBe('p2');
  });

  it('TC-2563: round 1 inputRowOrder matches qualification universe order', () => {
    const entries = [
      makeQualEntry('p1', 1), makeQualEntry('p2', 2), makeQualEntry('p3', 3),
    ];
    const rounds = [
      makePhaseRound('phase1', 1, [
        { playerId: 'p1', timeMs: 5000 },
        { playerId: 'p2', timeMs: 6000 },
        { playerId: 'p3', timeMs: 7000 },
      ], ['p3']),
    ];
    const result = replayTTFinals(makeData(entries, rounds));

    expect(result[0].inputRowOrder).toEqual(['p1', 'p2', 'p3']);
  });

  it('TC-2564: displayRowOrder is sorted by time ASC (fastest first)', () => {
    // p1 time=6000, p2 time=5000 → display order puts faster p2 first
    const entries = [makeQualEntry('p1', 1), makeQualEntry('p2', 2)];
    const rounds = [
      makePhaseRound('phase1', 1, [
        { playerId: 'p1', timeMs: 6000 },
        { playerId: 'p2', timeMs: 5000 },
      ]),
    ];
    const result = replayTTFinals(makeData(entries, rounds));

    expect(result[0].displayRowOrder).toEqual(['p2', 'p1']);
  });

  it('TC-2565: subsequent inputRowOrder is sorted by previous livesAfter DESC', () => {
    // Round 1: p1 time=6000, p2 time=5000 → displayRowOrder = ['p2', 'p1']
    // p2 is eliminated → livesAfter: p1=1, p2=0
    // Round 2 inputRowOrder: stableSort(['p2','p1'], id => -livesAfter(id))
    //   p2 key=0, p1 key=-1 → sorted: p1 before p2 → ['p1','p2']
    const entries = [makeQualEntry('p1', 1), makeQualEntry('p2', 2)];
    const rounds = [
      makePhaseRound('phase1', 1, [
        { playerId: 'p1', timeMs: 6000 },
        { playerId: 'p2', timeMs: 5000 },
      ], ['p2']),
      makePhaseRound('phase1', 2, [
        { playerId: 'p1', timeMs: 5000 },
        { playerId: 'p2', timeMs: 6000 },
      ]),
    ];
    const result = replayTTFinals(makeData(entries, rounds));

    // Round 1 display order puts the faster (p2) first
    expect(result[0].displayRowOrder).toEqual(['p2', 'p1']);
    // Round 2 input re-orders by lives DESC: p1(1 life) before p2(0 lives)
    expect(result[1].inputRowOrder).toEqual(['p1', 'p2']);
  });

  it('TC-2566: result for player outside universe is silently ignored', () => {
    const entries = [makeQualEntry('p1', 1)];
    const rounds = [
      makePhaseRound('phase1', 1, [
        { playerId: 'p1', timeMs: 5000 },
        { playerId: 'unknown', timeMs: 6000 },
      ]),
    ];
    const result = replayTTFinals(makeData(entries, rounds));

    // Only p1 appears — unknown is not in participants, lostLife, or gains
    expect(result[0].participants.has('unknown')).toBe(false);
    expect(result[0].lostLife.has('unknown')).toBe(false);
    expect(result[0].gains.has('unknown')).toBe(false);
    // p1 is present
    expect(result[0].participants.get('p1')).toBe(5000);
  });

  it.each([
    ['NaN', Number.NaN, null, true],
    ['positive Infinity', Number.POSITIVE_INFINITY, null, true],
    ['negative Infinity', Number.NEGATIVE_INFINITY, null, true],
    ['numeric string', '5000', null, true],
    ['undefined', undefined, null, false],
    ['null', null, null, false],
    ['zero', 0, 0, false],
  ])(
    'TC-2743: handles %s timeMs as expected',
    (_label, timeMs, expectedTime, shouldWarn) => {
      const playerId = 'p1';
      const entries = [makeQualEntry(playerId, 1)];
      const results = [{ playerId, timeMs }] as unknown as Array<{
        playerId: string;
        timeMs: number | null;
      }>;

      const [round] = replayTTFinals(
        makeData(entries, [makePhaseRound('phase1', 1, results)]),
      );

      expect(round.participants.get(playerId)).toBe(expectedTime);
      if (shouldWarn) {
        expect(warnMock).toHaveBeenCalledTimes(1);
        expect(warnMock).toHaveBeenCalledWith(
          `TT Finals phase1 round 1: invalid timeMs for player ${playerId}; treating as missing time`,
        );
      } else {
        expect(warnMock).not.toHaveBeenCalled();
      }
    },
  );

  it('TC-3004: phase3 bronze race — displayRowOrder stays raw-time order (template limitation), lostLife membership is unaffected either way', () => {
    // Manually-tested ASMKC 2025 replica report: the bronze-race LOSER
    // happened to be faster on the round's main course, so the *sheet*
    // visually shows them ahead of the winner. Traced to the template
    // itself: sheet4.xml's row/name formula is
    // `SORTBY(ANCHORARRAY(names), rawTimeColumn)` — Excel recomputes row
    // order from the raw Time cell every time the workbook opens, and has no
    // way to read this replay's displayRowOrder/resolvedOrder. Nudging
    // displayRowOrder here does not change what Excel renders; it only
    // desyncs this replay's own bookkeeping (round r+1's inputRowOrder,
    // lostLife → row position) from what the sheet will actually show,
    // which is worse than doing nothing (verified empirically in review:
    // for an exact-time tie it flips which *name* renders on the row the
    // Lost flag was written to). This is a documented, accepted template
    // limitation (docs/cdm-export-design.md §3.5: 既知の限界 — 脱落済み選手の
    // 最終ブロック内序列はライフ同値のため概算、確定順位の正はアプリ側), not a bug
    // this replay can fix without a materially different, riskier design
    // (e.g. writing a synthetic/nudged Time value, which would also affect
    // any other formula reading that same cell).
    const entries = [
      makeQualEntry('p1', 1), makeQualEntry('p2', 2),
      makeQualEntry('p3', 3), makeQualEntry('p4', 4),
    ];
    const rounds = [
      makePhaseRound(
        'phase3', 1,
        [
          { playerId: 'p1', timeMs: 5000 }, { playerId: 'p2', timeMs: 6000 },
          { playerId: 'p3', timeMs: 7000 }, { playerId: 'p4', timeMs: 8000 },
        ],
        [], false,
        [makeSuddenDeath(1, [{ playerId: 'p3', timeMs: 9000 }, { playerId: 'p4', timeMs: 8500 }])],
      ),
    ];
    const result = replayTTFinals(makeData(entries, rounds));

    // Bottom-half membership (who loses a life) is unaffected — p3/p4 are
    // unambiguously the slower half either way, so the sudden death doesn't
    // change lostLife's content for this scenario.
    expect(result[0].lostLife).toEqual(new Set(['p3', 'p4']));
    // displayRowOrder intentionally stays raw-time order (p3 before p4) —
    // matching what Excel's own formula will independently compute.
    expect(result[0].displayRowOrder).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('TC-3005: phase3 life-loss tie — the sudden death decides who crosses into the bottom half (lostLife), not raw-time stable-sort insertion order', () => {
    // p3 and p4 are tied at 4000ms — the exact elimination boundary for 6
    // active players (halfway = ceil(6/2) = 3). A naive stable sort on raw
    // time keeps insertion order (p3 before p4), wrongly treating p3 as
    // safe. The life-loss sudden death says p4 is faster (9000 < 9500), so
    // p4 must be safe and p3 must lose a life instead — this is a genuine,
    // ID-keyed fix (lostLife is a Set, not a row position) with no row-
    // alignment risk, unlike displayRowOrder (see TC-3004).
    const entries = [
      makeQualEntry('p1', 1), makeQualEntry('p2', 2), makeQualEntry('p3', 3),
      makeQualEntry('p4', 4), makeQualEntry('p5', 5), makeQualEntry('p6', 6),
    ];
    const rounds = [
      makePhaseRound(
        'phase3', 1,
        [
          { playerId: 'p1', timeMs: 1000 }, { playerId: 'p2', timeMs: 2000 },
          { playerId: 'p3', timeMs: 4000 }, { playerId: 'p4', timeMs: 4000 },
          { playerId: 'p5', timeMs: 5000 }, { playerId: 'p6', timeMs: 6000 },
        ],
        [], false,
        [makeSuddenDeath(1, [{ playerId: 'p3', timeMs: 9500 }, { playerId: 'p4', timeMs: 9000 }])],
      ),
    ];
    const result = replayTTFinals(makeData(entries, rounds));

    expect(result[0].lostLife).toEqual(new Set(['p3', 'p5', 'p6']));
    // displayRowOrder stays raw-time/insertion order (p3 before p4, tied) —
    // matching what Excel's own SORTBY(names, rawTime) will independently
    // render, so the Lost flag this replay writes for p3's row lands on the
    // row Excel actually names "p3" (see TC-3004 for why this must not use
    // the sudden-death-resolved order).
    expect(result[0].displayRowOrder).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
  });
});

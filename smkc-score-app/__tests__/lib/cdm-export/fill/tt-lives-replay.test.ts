/**
 * Unit tests for replayTTFinals (TC-2557–TC-2566).
 *
 * replayTTFinals is a pure function that reconstructs the TT Finals CDM
 * spreadsheet life-ledger from persisted tournament data. It performs no
 * database access and can be fully covered by unit tests with inline fixtures.
 */

import { replayTTFinals } from '@/lib/cdm-export/fill/tt-lives-replay';
import type {
  CdmTournamentData,
  CdmTTEntry,
  CdmTTPhaseRound,
} from '@/lib/cdm-export/types';

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
): CdmTTPhaseRound {
  return {
    phase,
    roundNumber,
    course: 'MC1',
    results,
    eliminatedIds,
    livesReset,
  };
}

describe('replayTTFinals', () => {
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
});

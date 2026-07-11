import { normalizeTournamentArchiveBundle } from '@/lib/tournament-archive';

type ArchiveFixture = {
  schemaVersion: 1 | 2;
  tournament: Record<string, unknown> & { taBattleRoyaleMode?: boolean };
  modes: {
    ta: Record<string, unknown> & {
      entries: unknown[];
      phaseRounds: Array<Record<string, unknown>>;
      rules?: Record<string, unknown>;
    };
    bm: Record<string, unknown>;
    mr: Record<string, unknown>;
    gp: Record<string, unknown>;
  };
  [key: string]: unknown;
};

function fixture(schemaVersion: 1 | 2, overrides: Record<string, unknown> = {}): ArchiveFixture {
  return {
    schemaVersion,
    generatedAt: '2026-07-10T00:00:00.000Z',
    tournament: {
      id: 't1',
      slug: 't1',
      name: 'Tournament',
      date: '2026-07-10T00:00:00.000Z',
      status: 'completed',
      publicModes: ['ta'],
      frozenStages: [],
      taPlayerSelfEdit: true,
      bmQualificationConfirmed: false,
      mrQualificationConfirmed: false,
      gpQualificationConfirmed: false,
      createdAt: '2026-07-10T00:00:00.000Z',
      updatedAt: '2026-07-10T00:00:00.000Z',
    },
    allPlayers: [],
    modes: {
      ta: {
        entries: [],
        phaseRounds: [],
        courses: [],
        qualificationRegistrationLocked: true,
        qualificationEditingLockedForPlayers: true,
        frozenStages: [],
        taPlayerSelfEdit: true,
      },
      bm: {},
      mr: {},
      gp: {},
    },
    overallRanking: {
      tournamentId: 't1',
      tournamentName: 'Tournament',
      lastUpdated: '2026-07-10T00:00:00.000Z',
      rankings: [],
    },
    archived: true,
    ...overrides,
  };
}

describe('tournament archive normalization', () => {
  it('normalizes v1 archives as standard TA with zero entry handicaps and legacy raw times', () => {
    const input = fixture(1);
    (input.modes.ta.entries as unknown[]) = [{ id: 'e1', taHandicapSeconds: -5, player: { id: 'p1' } }];
    (input.modes.ta.phaseRounds as unknown[]) = [
      { roundNumber: 1, results: [{ playerId: 'p1', timeMs: 1234 }], eliminatedIds: null },
    ];

    const normalized = normalizeTournamentArchiveBundle(input)!;
    expect(normalized.tournament.taBattleRoyaleMode).toBe(false);
    expect(normalized.modes.ta.rules).toMatchObject({
      mode: 'standard',
      initialLives: 3,
      lifeResetThresholds: [8, 4, 2],
      handicapEnabled: false,
    });
    expect(normalized.modes.ta.entries?.[0].taHandicapSeconds).toBe(0);
    expect(normalized.modes.ta.phaseRounds?.[0]).toMatchObject({
      eliminatedIds: [],
      results: [
        {
          playerId: 'p1',
          rawTimeMs: 1234,
          handicapSeconds: 0,
          timeMs: 1234,
          isRetry: false,
          tvNumber: null,
        },
      ],
    });
  });

  it('derives battle royale v2 rules even if an early v2 archive omitted the rules object', () => {
    const input = fixture(2);
    input.tournament.taBattleRoyaleMode = true;
    const normalized = normalizeTournamentArchiveBundle(input)!;
    expect(normalized.modes.ta.rules).toMatchObject({
      mode: 'battle_royale',
      initialLives: 10,
      lifeResetThresholds: [],
      handicapEnabled: true,
    });
  });

  it('preserves stored v2 mode, rules, snapshot handicaps, and result fields', () => {
    const input = fixture(2);
    input.tournament.taBattleRoyaleMode = true;
    input.modes.ta.rules = {
      mode: 'battle_royale',
      initialLives: 10,
      lifeResetThresholds: [],
      survivorsNeeded: 1,
      handicapEnabled: true,
      allowedHandicapSeconds: [0, -1, -3, -5],
      retryAppliesHandicap: false,
    };
    input.modes.ta.entries = [{ id: 'e1', taHandicapSeconds: -3, player: { id: 'p1' } }];
    input.modes.ta.phaseRounds = [
      {
        roundNumber: 1,
        eliminatedIds: ['p1'],
        results: [
          {
            playerId: 'p1',
            rawTimeMs: 5000,
            handicapSeconds: -3,
            timeMs: 2000,
            isRetry: false,
            tvNumber: 2,
          },
        ],
      },
    ];

    const normalized = normalizeTournamentArchiveBundle(input)!;
    expect(normalized.modes.ta.entries?.[0].taHandicapSeconds).toBe(-3);
    expect(normalized.modes.ta.phaseRounds?.[0].results).toEqual(input.modes.ta.phaseRounds[0].results);
  });

  it('rejects unsupported or malformed archive payloads', () => {
    expect(normalizeTournamentArchiveBundle(null)).toBeNull();
    expect(normalizeTournamentArchiveBundle({ schemaVersion: 3, tournament: {}, modes: {} })).toBeNull();
    expect(normalizeTournamentArchiveBundle({ schemaVersion: 2, tournament: {} })).toBeNull();
  });
});

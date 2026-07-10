import { promoteToPhase3, processPhase3Result, submitRoundResults } from '@/lib/ta/finals-phase-manager';

jest.mock('@/lib/audit-log', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
  AUDIT_ACTIONS: { CREATE_TA_ENTRY: 'CREATE_TA_ENTRY', UPDATE_TA_ENTRY: 'UPDATE_TA_ENTRY' },
}));

jest.mock('@/lib/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

const context = {
  tournamentId: 'tournament-1',
  userId: 'admin-1',
  ipAddress: '127.0.0.1',
  userAgent: 'test',
  taBattleRoyaleMode: true,
};

function makeEntry(playerId: string, handicap = 0, lives = 10) {
  return {
    id: `entry-${playerId}`,
    tournamentId: context.tournamentId,
    playerId,
    stage: 'phase3',
    lives,
    eliminated: false,
    times: {},
    totalTime: null,
    rank: null,
    taHandicapSeconds: handicap,
    player: { nickname: playerId, taHandicapSeconds: handicap },
  };
}

describe('TA battle royale phase manager', () => {
  it('promotes every qualification participant directly to Phase 3 with 10 lives', async () => {
    const qualifiers = ['p1', 'p2', 'p3', 'p4'].map((id) => ({
      ...makeEntry(id),
      stage: 'qualification',
    }));
    const created = qualifiers.map((entry) => ({ ...entry, stage: 'phase3', lives: 10 }));
    const prisma = {
      tTEntry: {
        findMany: jest.fn().mockResolvedValueOnce(qualifiers).mockResolvedValueOnce([]).mockResolvedValueOnce(created),
        createMany: jest.fn().mockResolvedValue({ count: 4 }),
      },
    };

    const result = await promoteToPhase3(prisma as never, context);

    expect(prisma.tTEntry.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ playerId: 'p1', stage: 'phase3', lives: 10 }),
        expect.objectContaining({ playerId: 'p4', stage: 'phase3', lives: 10 }),
      ]),
    });
    expect(result.entries).toHaveLength(4);
    expect(result.skipped).toEqual([]);
  });

  it('does not restore lives when a normal TA reset threshold is reached', async () => {
    const entries = [makeEntry('p1', 0, 1), makeEntry('p2', 0, 1)];
    const prisma = {
      tTEntry: {
        findMany: jest.fn().mockResolvedValueOnce(entries).mockResolvedValueOnce([entries[0]]),
        findUnique: jest.fn().mockResolvedValue(entries[1]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
      },
    };

    const result = await processPhase3Result(prisma as never, context, [
      { playerId: 'p1', timeMs: 90_000 },
      { playerId: 'p2', timeMs: 91_000 },
    ]);

    expect(result).toEqual({ eliminated: ['p2'], livesReset: false });
    expect(prisma.tTEntry.updateMany).not.toHaveBeenCalled();
  });

  it('eliminates every zero-life loser at five players without a revival race', async () => {
    const entries = [
      makeEntry('p1', 0, 2),
      makeEntry('p2', 0, 2),
      makeEntry('p3', 0, 2),
      makeEntry('p4', 0, 1),
      makeEntry('p5', 0, 1),
    ];
    const prisma = {
      tTPhaseRound: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'round-1',
          tournamentId: context.tournamentId,
          phase: 'phase3',
          roundNumber: 1,
          course: 'MC1',
          results: [],
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      tTPhaseSuddenDeathRound: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: 'sudden-death-1',
          targetPlayerIds: ['p4', 'p5'],
          kind: 'revival',
        }),
      },
      tTEntry: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(entries)
          .mockResolvedValueOnce(entries)
          .mockResolvedValueOnce(entries.slice(0, 3)),
        findUnique: jest.fn(({ where }) => {
          const playerId = where.tournamentId_playerId_stage.playerId;
          return Promise.resolve(entries.find((entry) => entry.playerId === playerId));
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
      },
    };

    const result = await submitRoundResults(prisma as never, context, 'phase3', 1, [
      { playerId: 'p1', timeMs: 90_000 },
      { playerId: 'p2', timeMs: 91_000 },
      { playerId: 'p3', timeMs: 92_000 },
      { playerId: 'p4', timeMs: 93_000 },
      { playerId: 'p5', timeMs: 94_000 },
    ]);

    expect(result.tieBreakRequired).toBeUndefined();
    expect(result.eliminatedIds).toEqual(['p4', 'p5']);
    expect(prisma.tTPhaseSuddenDeathRound.create).not.toHaveBeenCalled();
  });

  it('uses adjusted times for life loss while retaining raw times in round history', async () => {
    const entries = [makeEntry('p1', 0), makeEntry('p2', -1), makeEntry('p3', -3), makeEntry('p4', -5)];
    const prisma = {
      tTPhaseRound: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'round-1',
          course: 'MC1',
          results: [],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      tTEntry: {
        findMany: jest.fn().mockResolvedValue(entries),
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(entries.find((entry) => entry.playerId === where.tournamentId_playerId_stage.playerId)),
        ),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
      },
    };

    await submitRoundResults(prisma as never, context, 'phase3', 1, [
      { playerId: 'p1', timeMs: 100_000 },
      { playerId: 'p2', timeMs: 99_500 },
      { playerId: 'p3', timeMs: 101_000 },
      { playerId: 'p4', timeMs: 103_000 },
    ]);

    const lifeLosers = prisma.tTEntry.update.mock.calls.map(([call]) => call.where.id);
    expect(lifeLosers).toEqual(['entry-p2', 'entry-p1']);
    expect(prisma.tTPhaseRound.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          results: expect.arrayContaining([
            expect.objectContaining({
              playerId: 'p4',
              rawTimeMs: 103_000,
              handicapSeconds: -5,
              timeMs: 98_000,
            }),
          ]),
        }),
      }),
    );
  });
});

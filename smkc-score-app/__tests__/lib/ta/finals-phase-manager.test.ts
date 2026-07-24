/**
 * Unit tests for TA Finals Phase Manager
 *
 * Tests the three phases of TA finals:
 * - Phase 1: Ranks 17-24 from qualification, elimination by slowest
 * - Phase 2: Phase 1 survivors + Ranks 13-16, elimination by slowest
 * - Phase 3: Phase 2 survivors + Ranks 1-12, life-based elimination
 */

import {
  PHASE_CONFIG,
  getSuddenDeathContinuationTargets,
  getNextPhase3ResetThreshold,
  processEliminationPhaseResult,
  processPhase3Result,
  getPhaseStatus,
  undoLastPhaseRound,
  cancelLastSubmittedPhaseRound,
  startPhaseRound,
  submitRoundResults,
  submitSuddenDeathResults,
  changeSuddenDeathCourse,
  promoteToPhase1,
  promoteToPhase2,
  promoteToPhase3,
  resetPhase,
  PhaseResetConflictError,
} from '@/lib/ta/finals-phase-manager';
import { createAuditLog } from '@/lib/audit-log';
import { createLogger } from '@/lib/logger';
import { Prisma } from '@prisma/client';

// Mock Prisma client
const mockPrismaClient = {
  tTEntry: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    groupBy: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  tTPhaseRound: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  tTPhaseSuddenDeathRound: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  tTPhaseLifeAdjustment: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn((ops) => Promise.all(ops)),
};

// finals-phase-manager.ts imports PrismaClientKnownRequestError from runtime/library (Prisma v6).
// To make instanceof checks work across the module boundary, both the source and the test must
// use the SAME class object. We define it in the runtime/library mock, then re-export it from
// @prisma/client so `new Prisma.PrismaClientKnownRequestError(...)` in tests creates an instance
// that the source's `instanceof PrismaClientKnownRequestError` recognises.
jest.mock('@prisma/client/runtime/library', () => ({
  __esModule: true,
  PrismaClientKnownRequestError: class extends Error {
    code: string;
    constructor(message: string, { code }: { code: string; clientVersion: string }) {
      super(message);
      this.name = 'PrismaClientKnownRequestError';
      this.code = code;
    }
  },
}));

jest.mock('@prisma/client', () => {
  const lib = jest.requireMock('@prisma/client/runtime/library');
  return {
    __esModule: true,
    Prisma: {
      PrismaClientKnownRequestError: lib.PrismaClientKnownRequestError,
      // DbNull sentinel for nullable Json? fields in update operations
      DbNull: null,
    },
  };
});

// Mock audit log
jest.mock('@/lib/audit-log', () => ({
  createAuditLog: jest.fn(() => Promise.resolve()),
  AUDIT_ACTIONS: {
    CREATE_TA_ENTRY: 'CREATE_TA_ENTRY',
    UPDATE_TA_ENTRY: 'UPDATE_TA_ENTRY',
    DELETE_TA_ENTRY: 'DELETE_TA_ENTRY',
  },
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  })),
}));

describe('TA Finals Phase Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no later-phase entries, so the reset/undo/cancel later-phase
    // guard (assertNoLaterPhaseEntries) passes. clearAllMocks() does not reset
    // mockResolvedValue, so without this a leftover findFirst mock from an
    // earlier test would otherwise leak in and trip the guard. Tests that
    // exercise the guard override this explicitly.
    mockPrismaClient.tTEntry.findFirst.mockResolvedValue(null);
    mockPrismaClient.tTPhaseLifeAdjustment.findMany.mockResolvedValue([]);
  });

  describe('PHASE_CONFIG', () => {
    it('should have correct Phase 1 configuration', () => {
      expect(PHASE_CONFIG.phase1).toEqual({
        qualRankStart: 17,
        qualRankEnd: 24,
        startingPlayers: 8,
        survivorsNeeded: 4,
        hasLives: false,
      });
    });

    it('should have correct Phase 2 configuration', () => {
      expect(PHASE_CONFIG.phase2).toEqual({
        qualRankStart: 13,
        qualRankEnd: 16,
        startingPlayers: 8,
        survivorsNeeded: 4,
        hasLives: false,
      });
    });

    it('should have correct Phase 3 configuration', () => {
      expect(PHASE_CONFIG.phase3).toEqual({
        qualRankStart: 1,
        qualRankEnd: 12,
        startingPlayers: 16,
        survivorsNeeded: 1,
        hasLives: true,
        initialLives: 3,
        lifeResetThresholds: [8, 4, 2],
      });
    });
  });

  describe('getSuddenDeathContinuationTargets', () => {
    const phase3BoundaryResults = [
      { playerId: 'p1', timeMs: 80000 },
      { playerId: 'p2', timeMs: 90000 },
      { playerId: 'p3', timeMs: 90000 },
      { playerId: 'p4', timeMs: 90000 },
    ];

    it('does not continue phase3 sudden death after the life-loss boundary is resolved without a new slowest tie', () => {
      const targets = getSuddenDeathContinuationTargets('phase3', phase3BoundaryResults, [
        { playerId: 'p2', timeMs: 87000 },
        { playerId: 'p3', timeMs: 88000 },
        { playerId: 'p4', timeMs: 91000 },
      ]);

      expect(targets).toEqual([]);
    });

    it('continues phase3 sudden death with all players still tied for the slowest sudden-death time', () => {
      const targets = getSuddenDeathContinuationTargets('phase3', phase3BoundaryResults, [
        { playerId: 'p2', timeMs: 87000 },
        { playerId: 'p3', timeMs: 91000 },
        { playerId: 'p4', timeMs: 91000 },
      ]);

      expect(targets).toEqual(['p3', 'p4']);
    });

    it('falls back to the slowest sudden-death tie when a phase3 boundary player did not race in the sudden-death round', () => {
      const targets = getSuddenDeathContinuationTargets('phase3', phase3BoundaryResults, [
        { playerId: 'p3', timeMs: 91000 },
        { playerId: 'p4', timeMs: 91000 },
      ]);

      expect(targets).toEqual(['p3', 'p4']);
    });

    it('continues phase1 sudden death when the slowest players are tied', () => {
      const phase1BoundaryResults = [
        { playerId: 'p1', timeMs: 70000 },
        { playerId: 'p2', timeMs: 80000 },
        { playerId: 'p3', timeMs: 80000 },
        { playerId: 'p4', timeMs: 90000 },
      ];

      const targets = getSuddenDeathContinuationTargets('phase1', phase1BoundaryResults, [
        { playerId: 'p1', timeMs: 75000 },
        { playerId: 'p2', timeMs: 93000 },
        { playerId: 'p3', timeMs: 93000 },
      ]);

      expect(targets).toEqual(['p2', 'p3']);
    });

    it('does not continue phase1 sudden death when there is a unique slowest player', () => {
      const targets = getSuddenDeathContinuationTargets(
        'phase1',
        [
          { playerId: 'p1', timeMs: 70000 },
          { playerId: 'p2', timeMs: 80000 },
          { playerId: 'p3', timeMs: 80000 },
          { playerId: 'p4', timeMs: 90000 },
        ],
        [
          { playerId: 'p2', timeMs: 88000 },
          { playerId: 'p3', timeMs: 94000 },
        ],
      );

      expect(targets).toEqual([]);
    });

    it('returns no targets when one tied player is absent from phase2 sudden death results', () => {
      const phase2BoundaryResults = [
        { playerId: 'p1', timeMs: 70000 },
        { playerId: 'p2', timeMs: 80000 },
        { playerId: 'p3', timeMs: 80000 },
      ];

      // p3 tied at the phase2 boundary but did not submit a sudden-death time.
      const targets = getSuddenDeathContinuationTargets('phase2', phase2BoundaryResults, [
        { playerId: 'p1', timeMs: 76000 },
        { playerId: 'p2', timeMs: 95000 },
      ]);

      expect(targets).toEqual([]);
    });
  });

  describe('processEliminationPhaseResult', () => {
    const context = {
      tournamentId: 't1',
      userId: 'u1',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
    };

    it('should eliminate the slowest player', async () => {
      // Mock active players
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1', eliminated: false },
        { playerId: 'p2', eliminated: false },
        { playerId: 'p3', eliminated: false },
        { playerId: 'p4', eliminated: false },
        { playerId: 'p5', eliminated: false },
      ]);

      mockPrismaClient.tTEntry.update.mockResolvedValue({});

      const courseResults = [
        { playerId: 'p1', timeMs: 80000 },
        { playerId: 'p2', timeMs: 85000 },
        { playerId: 'p3', timeMs: 90000 },
        { playerId: 'p4', timeMs: 95000 },
        { playerId: 'p5', timeMs: 100000 }, // Slowest
      ];

      const eliminated = await processEliminationPhaseResult(mockPrismaClient as any, context, 'phase1', courseResults);

      expect(eliminated).toEqual(['p5']);
      expect(mockPrismaClient.tTEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { eliminated: true },
        }),
      );
    });

    it('should not eliminate when at survivor count', async () => {
      // Already at 4 survivors
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1', eliminated: false },
        { playerId: 'p2', eliminated: false },
        { playerId: 'p3', eliminated: false },
        { playerId: 'p4', eliminated: false },
      ]);

      const courseResults = [
        { playerId: 'p1', timeMs: 80000 },
        { playerId: 'p2', timeMs: 85000 },
        { playerId: 'p3', timeMs: 90000 },
        { playerId: 'p4', timeMs: 95000 },
      ];

      const eliminated = await processEliminationPhaseResult(mockPrismaClient as any, context, 'phase1', courseResults);

      expect(eliminated).toEqual([]);
      expect(mockPrismaClient.tTEntry.update).not.toHaveBeenCalled();
    });

    it('should throw error when slowest time is tied between multiple players', async () => {
      // 5 active players, but two share the slowest time - admin must resolve
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1', eliminated: false },
        { playerId: 'p2', eliminated: false },
        { playerId: 'p3', eliminated: false },
        { playerId: 'p4', eliminated: false },
        { playerId: 'p5', eliminated: false },
      ]);

      const courseResults = [
        { playerId: 'p1', timeMs: 80000 },
        { playerId: 'p2', timeMs: 85000 },
        { playerId: 'p3', timeMs: 90000 },
        { playerId: 'p4', timeMs: 100000 }, // Tied slowest
        { playerId: 'p5', timeMs: 100000 }, // Tied slowest
      ];

      await expect(
        processEliminationPhaseResult(mockPrismaClient as any, context, 'phase1', courseResults),
      ).rejects.toThrow('Tie detected');
      expect(mockPrismaClient.tTEntry.update).not.toHaveBeenCalled();
    });
  });

  describe('processPhase3Result', () => {
    const context = {
      tournamentId: 't1',
      userId: 'u1',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
    };

    it('should deduct life from bottom half players', async () => {
      const activeEntries = [
        { id: 'e1', playerId: 'p1', eliminated: false, lives: 3 },
        { id: 'e2', playerId: 'p2', eliminated: false, lives: 3 },
        { id: 'e3', playerId: 'p3', eliminated: false, lives: 3 },
        { id: 'e4', playerId: 'p4', eliminated: false, lives: 3 },
        { id: 'e5', playerId: 'p5', eliminated: false, lives: 3 },
        { id: 'e6', playerId: 'p6', eliminated: false, lives: 3 },
        { id: 'e7', playerId: 'p7', eliminated: false, lives: 3 },
        { id: 'e8', playerId: 'p8', eliminated: false, lives: 3 },
      ];

      // First call returns active players, second call returns remaining after update
      mockPrismaClient.tTEntry.findMany
        .mockResolvedValueOnce(activeEntries)
        .mockResolvedValueOnce(activeEntries.slice(0, 4)); // 4 remaining after life deduction

      mockPrismaClient.tTEntry.findUnique.mockImplementation(({ where }) => {
        const entry = activeEntries.find((e: any) => e.playerId === where.tournamentId_playerId_stage.playerId);
        return Promise.resolve(entry);
      });

      mockPrismaClient.tTEntry.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.updateMany.mockResolvedValue({});

      const courseResults = [
        { playerId: 'p1', timeMs: 80000 }, // Top half
        { playerId: 'p2', timeMs: 81000 },
        { playerId: 'p3', timeMs: 82000 },
        { playerId: 'p4', timeMs: 83000 },
        { playerId: 'p5', timeMs: 84000 }, // Bottom half starts here
        { playerId: 'p6', timeMs: 85000 },
        { playerId: 'p7', timeMs: 86000 },
        { playerId: 'p8', timeMs: 87000 },
      ];

      const _result = await processPhase3Result(mockPrismaClient as any, context, courseResults);

      // Bottom 4 should lose a life (p5, p6, p7, p8)
      expect(mockPrismaClient.tTEntry.update).toHaveBeenCalledTimes(4);
    });

    it('should eliminate players with 0 lives', async () => {
      const activeEntries = [
        { id: 'e1', playerId: 'p1', eliminated: false, lives: 3 },
        { id: 'e2', playerId: 'p2', eliminated: false, lives: 1 }, // Will be eliminated
      ];

      // First call returns active players, second call returns single remaining player
      mockPrismaClient.tTEntry.findMany.mockResolvedValueOnce(activeEntries).mockResolvedValueOnce([activeEntries[0]]); // Only p1 remains

      mockPrismaClient.tTEntry.findUnique.mockImplementation(({ where }) => {
        const entry = activeEntries.find((e: any) => e.playerId === where.tournamentId_playerId_stage.playerId);
        return Promise.resolve(entry);
      });

      mockPrismaClient.tTEntry.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.updateMany.mockResolvedValue({});

      const courseResults = [
        { playerId: 'p1', timeMs: 80000 },
        { playerId: 'p2', timeMs: 90000 }, // Slower, will lose life
      ];

      const result = await processPhase3Result(mockPrismaClient as any, context, courseResults);

      expect(result.eliminated).toContain('p2');
    });

    it('uses resolved sudden-death order instead of millisecond offsets when Phase3 elimination is capped', async () => {
      const activeEntries = [
        { id: 'e1', playerId: 'p1', eliminated: false, lives: 1 },
        { id: 'e2', playerId: 'p2', eliminated: false, lives: 1 },
        { id: 'e3', playerId: 'p3', eliminated: false, lives: 1 },
        { id: 'e4', playerId: 'p4', eliminated: false, lives: 1 },
        { id: 'e5', playerId: 'p5', eliminated: false, lives: 1 },
      ];

      mockPrismaClient.tTEntry.findMany
        .mockResolvedValueOnce(activeEntries)
        .mockResolvedValueOnce(activeEntries.filter((entry) => entry.playerId !== 'p5'));

      mockPrismaClient.tTEntry.findUnique.mockImplementation(({ where }) => {
        const entry = activeEntries.find((e: any) => e.playerId === where.tournamentId_playerId_stage.playerId);
        return Promise.resolve(entry);
      });

      mockPrismaClient.tTEntry.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.updateMany.mockResolvedValue({});

      const courseResults = [
        { playerId: 'p1', timeMs: 80000 },
        { playerId: 'p2', timeMs: 81000 },
        { playerId: 'p4', timeMs: 90000 },
        { playerId: 'p3', timeMs: 90001 },
        { playerId: 'p5', timeMs: 90001 },
      ];
      const resolvedOrder = new Map([
        ['p1', 0],
        ['p2', 1],
        ['p4', 2],
        ['p3', 3],
        ['p5', 4],
      ]);

      const result = await processPhase3Result(mockPrismaClient as any, context, courseResults, resolvedOrder);

      expect(result.eliminated).toEqual(['p5']);
      expect(mockPrismaClient.tTEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'e5' },
          data: expect.objectContaining({ eliminated: true }),
        }),
      );
    });

    it('deducts a custom lifeLoss amount instead of the default 1 when provided', async () => {
      const activeEntries = [
        { id: 'e1', playerId: 'p1', eliminated: false, lives: 10 },
        { id: 'e2', playerId: 'p2', eliminated: false, lives: 10 },
      ];

      mockPrismaClient.tTEntry.findMany.mockResolvedValueOnce(activeEntries).mockResolvedValueOnce(activeEntries);

      mockPrismaClient.tTEntry.findUnique.mockImplementation(({ where }) => {
        const entry = activeEntries.find((e: any) => e.playerId === where.tournamentId_playerId_stage.playerId);
        return Promise.resolve(entry);
      });

      mockPrismaClient.tTEntry.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.updateMany.mockResolvedValue({});

      const courseResults = [
        { playerId: 'p1', timeMs: 80000 },
        { playerId: 'p2', timeMs: 90000 }, // Bottom half — loses the custom amount
      ];

      await processPhase3Result(mockPrismaClient as any, context, courseResults, undefined, undefined, 2);

      expect(mockPrismaClient.tTEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'e2' },
          data: { lives: 8, eliminated: false },
        }),
      );
    });
  });

  describe('getNextPhase3ResetThreshold', () => {
    it('returns 8 for activeCount above 8', () => {
      expect(getNextPhase3ResetThreshold(16)).toBe(8);
      expect(getNextPhase3ResetThreshold(15)).toBe(8);
      expect(getNextPhase3ResetThreshold(11)).toBe(8);
      expect(getNextPhase3ResetThreshold(9)).toBe(8);
    });

    it('returns 4 for activeCount in range (4, 8]', () => {
      expect(getNextPhase3ResetThreshold(8)).toBe(4);
      expect(getNextPhase3ResetThreshold(7)).toBe(4);
      expect(getNextPhase3ResetThreshold(5)).toBe(4);
    });

    it('returns 2 for activeCount in range (2, 4]', () => {
      expect(getNextPhase3ResetThreshold(4)).toBe(2);
      expect(getNextPhase3ResetThreshold(3)).toBe(2);
    });

    it('falls back to activeCount-1 for activeCount=2 when no configured threshold remains', () => {
      expect(getNextPhase3ResetThreshold(2)).toBe(1);
    });

    it('returns null for activeCount <= 1 when no configured threshold remains', () => {
      expect(getNextPhase3ResetThreshold(1)).toBeNull();
      expect(getNextPhase3ResetThreshold(0)).toBeNull();
    });
  });

  describe('getPhaseStatus', () => {
    it('should return current phase status', async () => {
      mockPrismaClient.tTEntry.groupBy.mockResolvedValue([
        { stage: 'phase1', eliminated: false, _count: { _all: 1 } },
        { stage: 'phase1', eliminated: true, _count: { _all: 1 } },
      ]);

      const status = await getPhaseStatus(mockPrismaClient as any, 't1');

      expect(mockPrismaClient.tTEntry.groupBy).toHaveBeenCalledWith({
        by: ['stage', 'eliminated'],
        where: {
          tournamentId: 't1',
          stage: { in: ['phase1', 'phase2', 'phase3'] },
        },
        _count: { _all: true },
      });
      expect(status.phase1).toEqual({
        total: 2,
        active: 1,
        eliminated: 1,
      });
      expect(status.currentPhase).toBe('phase1');
    });

    it('should identify winner in phase3', async () => {
      mockPrismaClient.tTEntry.groupBy.mockResolvedValue([
        { stage: 'phase3', eliminated: false, _count: { _all: 1 } },
        { stage: 'phase3', eliminated: true, _count: { _all: 1 } },
      ]);
      mockPrismaClient.tTEntry.findFirst.mockResolvedValue({
        player: { nickname: 'Winner' },
      });

      const status = await getPhaseStatus(mockPrismaClient as any, 't1');

      expect(mockPrismaClient.tTEntry.findFirst).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: 'phase3', eliminated: false },
        select: { player: { select: { nickname: true } } },
      });
      expect(status.phase3).toEqual({
        total: 2,
        active: 1,
        eliminated: 1,
        winner: 'Winner',
      });
    });
  });

  describe('undoLastPhaseRound', () => {
    const context = {
      tournamentId: 't1',
      userId: 'admin1',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
    };

    // Case B (issue #2779): once phase1 has been promoted, undoing its last
    // round would restore a survivor the phase2 roster was built from. Undo
    // must refuse (PhaseResetConflictError → 409) so the admin resets phase2
    // first, exactly like resetPhase.
    it('throws PhaseResetConflictError when undoing phase1 while phase2 entries exist', async () => {
      mockPrismaClient.tTEntry.findFirst.mockResolvedValue({ stage: 'phase2' });

      await expect(undoLastPhaseRound(mockPrismaClient as any, context, 'phase1')).rejects.toThrow(
        PhaseResetConflictError,
      );
      expect(mockPrismaClient.tTEntry.findFirst).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: { in: ['phase2', 'phase3'] } },
        select: { stage: true },
      });
      // Guard runs before any mutation.
      expect(mockPrismaClient.tTPhaseRound.update).not.toHaveBeenCalled();
    });

    // Issue #2782: the phase1->phase2 guard case above was covered, but the
    // shared assertNoLaterPhaseEntries helper's phase2->phase3 case (mirrored
    // by resetPhase's own "resetting phase2 while phase3 entries exist" test)
    // had no equivalent coverage here or in cancelLastSubmittedPhaseRound.
    it('throws PhaseResetConflictError when undoing phase2 while phase3 entries exist', async () => {
      mockPrismaClient.tTEntry.findFirst.mockResolvedValue({ stage: 'phase3' });

      await expect(undoLastPhaseRound(mockPrismaClient as any, context, 'phase2')).rejects.toThrow(
        PhaseResetConflictError,
      );
      expect(mockPrismaClient.tTEntry.findFirst).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: { in: ['phase3'] } },
        select: { stage: true },
      });
      expect(mockPrismaClient.tTPhaseRound.update).not.toHaveBeenCalled();
    });

    it('does not run the later-phase guard query for phase3 (no later stage)', async () => {
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([
        {
          id: 'round1',
          roundNumber: 1,
          phase: 'phase3',
          course: 'MC1',
          results: [{ playerId: 'p1', timeMs: 80000 }],
          eliminatedIds: [],
          livesReset: false,
        },
      ]);
      mockPrismaClient.tTPhaseRound.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([{ playerId: 'p1' }]);

      await undoLastPhaseRound(mockPrismaClient as any, context, 'phase3');

      expect(mockPrismaClient.tTEntry.findFirst).not.toHaveBeenCalled();
    });

    it('should undo the last submitted phase1 round and restore eliminated player', async () => {
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([
        {
          id: 'round1',
          roundNumber: 1,
          phase: 'phase1',
          course: 'MC1',
          results: [
            { playerId: 'p1', timeMs: 80000 },
            { playerId: 'p2', timeMs: 90000 },
          ],
          eliminatedIds: ['p2'],
          livesReset: false,
        },
      ]);
      mockPrismaClient.tTPhaseRound.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.updateMany.mockResolvedValue({ count: 1 });

      const result = await undoLastPhaseRound(mockPrismaClient as any, context, 'phase1');

      expect(result.undoneRoundNumber).toBe(1);
      // Should clear round results
      expect(mockPrismaClient.tTPhaseRound.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'round1' },
          data: expect.objectContaining({ results: [] }),
        }),
      );
      // Should restore eliminated player
      expect(mockPrismaClient.tTEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ playerId: { in: ['p2'] } }),
          data: { eliminated: false },
        }),
      );
    });

    it('should throw if no submitted rounds exist', async () => {
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([
        {
          id: 'round1',
          roundNumber: 1,
          phase: 'phase1',
          course: 'MC1',
          results: [], // Not yet submitted
          eliminatedIds: null,
          livesReset: false,
        },
      ]);

      await expect(undoLastPhaseRound(mockPrismaClient as any, context, 'phase1')).rejects.toThrow(
        'No submitted rounds found for phase1',
      );
    });

    it('should delete orphaned sudden-death rounds tied to the undone round (#2761)', async () => {
      // Bug: undoing a round that had a resolved sudden-death tiebreak left the
      // TTPhaseSuddenDeathRound row behind. Re-submitting the round and hitting
      // another tie then created "sequence 2" (looked like a second tiebreak was
      // required) because createSuddenDeathRound counts existing rows for the
      // same phaseRoundId. Undo must clear those rows so a fresh tie starts at
      // sequence 1 again.
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([
        {
          id: 'round1',
          roundNumber: 1,
          phase: 'phase1',
          course: 'MC1',
          results: [
            { playerId: 'p1', timeMs: 80000 },
            { playerId: 'p2', timeMs: 90000 },
          ],
          eliminatedIds: ['p2'],
          livesReset: false,
        },
      ]);
      mockPrismaClient.tTPhaseRound.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaClient.tTPhaseSuddenDeathRound.deleteMany.mockResolvedValue({ count: 1 });

      await undoLastPhaseRound(mockPrismaClient as any, context, 'phase1');

      expect(mockPrismaClient.tTPhaseSuddenDeathRound.deleteMany).toHaveBeenCalledWith({
        where: { phaseRoundId: 'round1' },
      });
    });

    it('should replay phase3 rounds and reconstruct lives for undo', async () => {
      // Two submitted rounds: first round has bottom half (p3,p4) lose 1 life,
      // second round is the one being undone
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([
        {
          id: 'round1',
          roundNumber: 1,
          phase: 'phase3',
          course: 'MC1',
          results: [
            { playerId: 'p1', timeMs: 50000 },
            { playerId: 'p2', timeMs: 60000 },
            { playerId: 'p3', timeMs: 70000 },
            { playerId: 'p4', timeMs: 80000 },
          ],
          eliminatedIds: [],
          livesReset: false,
        },
        {
          id: 'round2',
          roundNumber: 2,
          phase: 'phase3',
          course: 'DP1',
          results: [
            { playerId: 'p1', timeMs: 55000 },
            { playerId: 'p2', timeMs: 65000 },
            { playerId: 'p3', timeMs: 75000 },
            { playerId: 'p4', timeMs: 85000 },
          ],
          eliminatedIds: ['p3', 'p4'],
          livesReset: false,
        },
      ]);
      mockPrismaClient.tTPhaseRound.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.updateMany.mockResolvedValue({ count: 4 });
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1' },
        { playerId: 'p2' },
        { playerId: 'p3' },
        { playerId: 'p4' },
      ]);

      const result = await undoLastPhaseRound(mockPrismaClient as any, context, 'phase3');

      expect(result.undoneRoundNumber).toBe(2);
      expect(mockPrismaClient.tTPhaseRound.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'round2' },
          data: expect.objectContaining({ results: [] }),
        }),
      );
      // After replaying round1: p1,p2 have 3 lives; p3,p4 have 2 lives
      // Should write each state group directly, without a destructive
      // pre-replay reset that could leave partial state on a read failure.
      expect(mockPrismaClient.tTEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ playerId: { in: expect.arrayContaining(['p1', 'p2']) } }),
          data: { lives: 3, eliminated: false },
        }),
      );
      expect(mockPrismaClient.tTEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ playerId: { in: expect.arrayContaining(['p3', 'p4']) } }),
          data: { lives: 2, eliminated: false },
        }),
      );
      expect(mockPrismaClient.tTEntry.updateMany).toHaveBeenCalledTimes(2);
    });

    it('replays manual life settings before and after the undone round without double-applying them', async () => {
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([
        {
          id: 'round1',
          roundNumber: 1,
          phase: 'phase3',
          course: 'MC1',
          results: [
            { playerId: 'p1', timeMs: 50000 },
            { playerId: 'p2', timeMs: 80000 },
          ],
          eliminatedIds: [],
          livesReset: false,
          submittedAt: new Date('2026-07-24T02:00:00.000Z'),
          createdAt: new Date('2026-07-24T01:30:00.000Z'),
          suddenDeathRounds: [],
        },
        {
          id: 'round2',
          roundNumber: 2,
          phase: 'phase3',
          course: 'DP1',
          results: [
            { playerId: 'p1', timeMs: 50000 },
            { playerId: 'p2', timeMs: 80000 },
          ],
          eliminatedIds: [],
          livesReset: false,
          submittedAt: new Date('2026-07-24T04:00:00.000Z'),
          createdAt: new Date('2026-07-24T03:30:00.000Z'),
          suddenDeathRounds: [],
        },
      ]);
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([{ playerId: 'p1' }, { playerId: 'p2' }]);
      mockPrismaClient.tTPhaseLifeAdjustment.findMany.mockResolvedValue([
        {
          id: 'p1-to-5',
          playerId: 'p1',
          oldLives: 3,
          newLives: 5,
          entryVersion: 1,
          afterRoundId: null,
          afterRoundNumber: 0,
          createdAt: new Date('2026-07-24T01:00:00.000Z'),
        },
        {
          id: 'p2-to-5',
          playerId: 'p2',
          oldLives: 3,
          newLives: 5,
          entryVersion: 1,
          afterRoundId: null,
          afterRoundNumber: 0,
          createdAt: new Date('2026-07-24T01:00:00.001Z'),
        },
        {
          id: 'p2-to-6',
          playerId: 'p2',
          oldLives: 4,
          newLives: 6,
          entryVersion: 3,
          afterRoundId: 'round1',
          afterRoundNumber: 1,
          createdAt: new Date('2026-07-24T03:00:00.000Z'),
        },
        {
          id: 'p1-to-7-after-undone-round',
          playerId: 'p1',
          oldLives: 5,
          newLives: 7,
          entryVersion: 5,
          afterRoundId: 'round2',
          afterRoundNumber: 2,
          createdAt: new Date('2026-07-24T05:00:00.000Z'),
        },
      ]);
      mockPrismaClient.tTPhaseRound.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.updateMany.mockResolvedValue({ count: 1 });

      await undoLastPhaseRound(mockPrismaClient as any, context, 'phase3');

      expect(mockPrismaClient.tTEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ playerId: { in: ['p1'] } }),
          data: { lives: 7, eliminated: false },
        }),
      );
      expect(mockPrismaClient.tTEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ playerId: { in: ['p2'] } }),
          data: { lives: 6, eliminated: false },
        }),
      );
    });

    it('should honor a custom per-round lifeLoss when replaying phase3 rounds for undo', async () => {
      // Round 1 was started with lifeLoss: 2 (TA battle royale). Bottom half
      // (p3,p4) must lose 2 lives during replay, not the default 1.
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([
        {
          id: 'round1',
          roundNumber: 1,
          phase: 'phase3',
          course: 'MC1',
          lifeLoss: 2,
          results: [
            { playerId: 'p1', timeMs: 50000 },
            { playerId: 'p2', timeMs: 60000 },
            { playerId: 'p3', timeMs: 70000 },
            { playerId: 'p4', timeMs: 80000 },
          ],
          eliminatedIds: [],
          livesReset: false,
        },
        {
          id: 'round2',
          roundNumber: 2,
          phase: 'phase3',
          course: 'DP1',
          lifeLoss: 1,
          results: [
            { playerId: 'p1', timeMs: 55000 },
            { playerId: 'p2', timeMs: 65000 },
            { playerId: 'p3', timeMs: 75000 },
            { playerId: 'p4', timeMs: 85000 },
          ],
          eliminatedIds: [],
          livesReset: false,
        },
      ]);
      mockPrismaClient.tTPhaseRound.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.updateMany.mockResolvedValue({ count: 4 });
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1' },
        { playerId: 'p2' },
        { playerId: 'p3' },
        { playerId: 'p4' },
      ]);

      await undoLastPhaseRound(mockPrismaClient as any, context, 'phase3');

      // After replaying round1 only (round2 is the one being undone):
      // p1,p2 keep 3 lives; p3,p4 lose 2 lives → 1 life remaining.
      expect(mockPrismaClient.tTEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ playerId: { in: expect.arrayContaining(['p3', 'p4']) } }),
          data: { lives: 1, eliminated: false },
        }),
      );
    });

    it('should correctly restore lives after livesReset in phase3 undo', async () => {
      // Round 1: bottom half (p3,p4) lose a life (3→2); then lives reset to 3
      // Round 2 is being undone; after undo, all should have 3 lives
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([
        {
          id: 'round1',
          roundNumber: 1,
          phase: 'phase3',
          course: 'MC1',
          results: [
            { playerId: 'p1', timeMs: 50000 },
            { playerId: 'p2', timeMs: 60000 },
            { playerId: 'p3', timeMs: 70000 },
            { playerId: 'p4', timeMs: 80000 },
          ],
          eliminatedIds: [],
          livesReset: true, // Lives reset after this round
        },
        {
          id: 'round2',
          roundNumber: 2,
          phase: 'phase3',
          course: 'DP1',
          results: [{ playerId: 'p1', timeMs: 55000 }],
          eliminatedIds: [],
          livesReset: false,
        },
      ]);
      mockPrismaClient.tTPhaseRound.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.updateMany.mockResolvedValue({ count: 4 });
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1' },
        { playerId: 'p2' },
        { playerId: 'p3' },
        { playerId: 'p4' },
      ]);

      const result = await undoLastPhaseRound(mockPrismaClient as any, context, 'phase3');
      expect(result.undoneRoundNumber).toBe(2);

      // After replaying round1 with livesReset=true: all 4 players have lives=3
      // So the final updateMany should set all to lives=3 in one batch call
      expect(mockPrismaClient.tTEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            playerId: { in: expect.arrayContaining(['p1', 'p2', 'p3', 'p4']) },
          }),
          data: { lives: 3, eliminated: false },
        }),
      );
    });
  });

  describe('cancelLastSubmittedPhaseRound', () => {
    // Recovery for the "wrong last course" mistake (#2761): unlike
    // undoLastPhaseRound (which keeps the round row so the SAME course can be
    // re-submitted in place), this deletes the round entirely so its course
    // returns to the 20-course pool and a different course can be picked next.
    const context = {
      tournamentId: 't1',
      userId: 'admin1',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
    };

    // Case B (issue #2779): mirrors the undo guard — cancelling a promoted
    // phase's last round would desync the later phase's roster, so it must be
    // refused until that later phase is reset.
    it('throws PhaseResetConflictError when cancelling phase1 while phase2 entries exist', async () => {
      mockPrismaClient.tTEntry.findFirst.mockResolvedValue({ stage: 'phase2' });

      await expect(cancelLastSubmittedPhaseRound(mockPrismaClient as any, context, 'phase1')).rejects.toThrow(
        PhaseResetConflictError,
      );
      expect(mockPrismaClient.tTEntry.findFirst).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: { in: ['phase2', 'phase3'] } },
        select: { stage: true },
      });
      // Guard runs before any deletion.
      expect(mockPrismaClient.tTPhaseRound.delete).not.toHaveBeenCalled();
    });

    // Issue #2782: mirrors the phase2->phase3 case added to undoLastPhaseRound
    // above and to resetPhase's own test — the shared assertNoLaterPhaseEntries
    // helper needs equivalent coverage here too.
    it('throws PhaseResetConflictError when cancelling phase2 while phase3 entries exist', async () => {
      mockPrismaClient.tTEntry.findFirst.mockResolvedValue({ stage: 'phase3' });

      await expect(cancelLastSubmittedPhaseRound(mockPrismaClient as any, context, 'phase2')).rejects.toThrow(
        PhaseResetConflictError,
      );
      expect(mockPrismaClient.tTEntry.findFirst).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: { in: ['phase3'] } },
        select: { stage: true },
      });
      expect(mockPrismaClient.tTPhaseRound.delete).not.toHaveBeenCalled();
    });

    it('should delete the last submitted phase1 round, restore the eliminated player, and free the course', async () => {
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([
        {
          id: 'round1',
          roundNumber: 1,
          phase: 'phase1',
          course: 'MC1',
          results: [
            { playerId: 'p1', timeMs: 80000 },
            { playerId: 'p2', timeMs: 90000 },
          ],
          eliminatedIds: ['p2'],
          livesReset: false,
        },
      ]);
      mockPrismaClient.tTEntry.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaClient.tTPhaseSuddenDeathRound.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaClient.tTPhaseRound.delete.mockResolvedValue({});

      const result = await cancelLastSubmittedPhaseRound(mockPrismaClient as any, context, 'phase1');

      expect(result).toEqual({ cancelledRoundNumber: 1, freedCourse: 'MC1' });
      // Restores the player eliminated by this round, same as undo.
      expect(mockPrismaClient.tTEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ playerId: { in: ['p2'] } }),
          data: { eliminated: false },
        }),
      );
      // Sudden-death rows must be deleted before the round row (D1 has no
      // interactive transactions; dependent data first, same order as resetPhase).
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.deleteMany).toHaveBeenCalledWith({
        where: { phaseRoundId: 'round1' },
      });
      // Deletes (not clears) the round so it drops out of the played-courses pool.
      expect(mockPrismaClient.tTPhaseRound.delete).toHaveBeenCalledWith({
        where: { id: 'round1' },
      });
      expect(mockPrismaClient.tTPhaseRound.update).not.toHaveBeenCalled();
    });

    it('should throw if no submitted rounds exist', async () => {
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([
        {
          id: 'round1',
          roundNumber: 1,
          phase: 'phase1',
          course: 'MC1',
          results: [],
          eliminatedIds: null,
          livesReset: false,
        },
      ]);

      await expect(cancelLastSubmittedPhaseRound(mockPrismaClient as any, context, 'phase1')).rejects.toThrow(
        'No submitted rounds found for phase1',
      );
      expect(mockPrismaClient.tTPhaseRound.delete).not.toHaveBeenCalled();
    });

    it('should replay phase3 rounds to reconstruct lives before deleting the cancelled round', async () => {
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([
        {
          id: 'round1',
          roundNumber: 1,
          phase: 'phase3',
          course: 'MC1',
          results: [
            { playerId: 'p1', timeMs: 50000 },
            { playerId: 'p2', timeMs: 60000 },
            { playerId: 'p3', timeMs: 70000 },
            { playerId: 'p4', timeMs: 80000 },
          ],
          eliminatedIds: [],
          livesReset: false,
        },
        {
          id: 'round2',
          roundNumber: 2,
          phase: 'phase3',
          course: 'DP1',
          results: [
            { playerId: 'p1', timeMs: 55000 },
            { playerId: 'p2', timeMs: 65000 },
            { playerId: 'p3', timeMs: 75000 },
            { playerId: 'p4', timeMs: 85000 },
          ],
          eliminatedIds: ['p3', 'p4'],
          livesReset: false,
        },
      ]);
      mockPrismaClient.tTEntry.updateMany.mockResolvedValue({ count: 4 });
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1' },
        { playerId: 'p2' },
        { playerId: 'p3' },
        { playerId: 'p4' },
      ]);
      mockPrismaClient.tTPhaseSuddenDeathRound.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaClient.tTPhaseRound.delete.mockResolvedValue({});

      const result = await cancelLastSubmittedPhaseRound(mockPrismaClient as any, context, 'phase3');

      expect(result).toEqual({ cancelledRoundNumber: 2, freedCourse: 'DP1' });
      // After replaying round1 only (round2 is the one being cancelled): p1,p2 keep
      // 3 lives; p3,p4 drop to 2 — same reconstruction undoLastPhaseRound performs.
      expect(mockPrismaClient.tTEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ playerId: { in: expect.arrayContaining(['p1', 'p2']) } }),
          data: { lives: 3, eliminated: false },
        }),
      );
      expect(mockPrismaClient.tTEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ playerId: { in: expect.arrayContaining(['p3', 'p4']) } }),
          data: { lives: 2, eliminated: false },
        }),
      );
      expect(mockPrismaClient.tTPhaseRound.delete).toHaveBeenCalledWith({ where: { id: 'round2' } });
    });

    it('keeps absolute manual life settings when cancelling the round they followed', async () => {
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([
        {
          id: 'round1',
          roundNumber: 1,
          phase: 'phase3',
          course: 'MC1',
          results: [
            { playerId: 'p1', timeMs: 50000 },
            { playerId: 'p2', timeMs: 80000 },
          ],
          eliminatedIds: [],
          livesReset: false,
          submittedAt: new Date('2026-07-24T02:00:00.000Z'),
          createdAt: new Date('2026-07-24T01:30:00.000Z'),
          suddenDeathRounds: [],
        },
      ]);
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([{ playerId: 'p1' }, { playerId: 'p2' }]);
      mockPrismaClient.tTPhaseLifeAdjustment.findMany.mockResolvedValue([
        {
          id: 'p1-to-5',
          playerId: 'p1',
          oldLives: 3,
          newLives: 5,
          entryVersion: 1,
          afterRoundId: null,
          afterRoundNumber: 0,
          createdAt: new Date('2026-07-24T01:00:00.000Z'),
        },
        {
          id: 'p2-to-5',
          playerId: 'p2',
          oldLives: 3,
          newLives: 5,
          entryVersion: 1,
          afterRoundId: null,
          afterRoundNumber: 0,
          createdAt: new Date('2026-07-24T01:00:00.001Z'),
        },
        {
          id: 'p2-to-6-after-round',
          playerId: 'p2',
          oldLives: 4,
          newLives: 6,
          entryVersion: 3,
          afterRoundId: 'round1',
          afterRoundNumber: 1,
          createdAt: new Date('2026-07-24T03:00:00.000Z'),
        },
      ]);
      mockPrismaClient.tTEntry.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaClient.tTPhaseSuddenDeathRound.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaClient.tTPhaseRound.delete.mockResolvedValue({});

      await cancelLastSubmittedPhaseRound(mockPrismaClient as any, context, 'phase3');

      expect(mockPrismaClient.tTPhaseRound.update).toHaveBeenCalledWith({
        where: { id: 'round1' },
        data: { submittedAt: null },
      });
      expect(mockPrismaClient.tTPhaseRound.update.mock.invocationCallOrder[0]).toBeLessThan(
        mockPrismaClient.tTPhaseLifeAdjustment.findMany.mock.invocationCallOrder[0],
      );
      expect(mockPrismaClient.tTEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ playerId: { in: ['p1'] } }),
          data: { lives: 5, eliminated: false },
        }),
      );
      expect(mockPrismaClient.tTEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ playerId: { in: ['p2'] } }),
          data: { lives: 6, eliminated: false },
        }),
      );
    });
  });

  describe('startPhaseRound', () => {
    const context = {
      tournamentId: 't1',
      userId: 'admin-1',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    };

    beforeEach(() => {
      jest.clearAllMocks();
      // Default: 2 active players so phase is valid
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { id: 'e1', playerId: 'p1', eliminated: false },
        { id: 'e2', playerId: 'p2', eliminated: false },
      ]);
      // Default: 0 existing rounds so first round number = 1
      mockPrismaClient.tTPhaseRound.count.mockResolvedValue(0);
      // Default: no rounds played yet → all 20 courses available
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([]);
      mockPrismaClient.tTPhaseRound.create.mockResolvedValue({});
      mockPrismaClient.tTPhaseSuddenDeathRound.findFirst.mockResolvedValue(null);
    });

    it('uses random course when manualCourse is not provided', async () => {
      // When no manualCourse is given, selectRandomCourse picks from all 20 courses.
      // We verify that manualOverride is false and a course string is returned.
      const result = await startPhaseRound(mockPrismaClient as any, context, 'phase1');

      expect(result.roundNumber).toBe(1);
      expect(typeof result.course).toBe('string');
      expect(result.manualOverride).toBe(false);
      // tTPhaseRound.create should be called with manualOverride: false
      expect(mockPrismaClient.tTPhaseRound.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ manualOverride: false }),
        }),
      );
    });

    it('uses the specified course and sets manualOverride: true when a valid course is provided', async () => {
      // MC1 is the first course in the COURSES array and is available (no played rounds)
      const result = await startPhaseRound(mockPrismaClient as any, context, 'phase1', 'MC1');

      expect(result.course).toBe('MC1');
      expect(result.manualOverride).toBe(true);
      expect(mockPrismaClient.tTPhaseRound.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ course: 'MC1', manualOverride: true }),
        }),
      );
    });

    it('throws when an invalid course abbreviation is provided', async () => {
      // "INVALID" is not in the COURSES array → should throw before DB access
      await expect(startPhaseRound(mockPrismaClient as any, context, 'phase1', 'INVALID')).rejects.toThrow(
        'Invalid course abbreviation: "INVALID"',
      );
    });

    it('throws when the specified course has already been played in the current cycle', async () => {
      // Simulate MC1 already played in this phase
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([{ course: 'MC1' }]);

      await expect(startPhaseRound(mockPrismaClient as any, context, 'phase1', 'MC1')).rejects.toThrow(
        'Course "MC1" has already been played in the current cycle',
      );
    });

    it('throws when there are no active players in the phase', async () => {
      // Phase not yet promoted → no TTEntry records for this phase
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([]);

      await expect(startPhaseRound(mockPrismaClient as any, context, 'phase1')).rejects.toThrow(
        'No active players in phase1. Promote players first.',
      );
    });

    it('throws immediately without retry when create fails with non-P2002 error', async () => {
      // Non-P2002 errors should not trigger retry - thrown immediately
      mockPrismaClient.tTPhaseRound.count.mockResolvedValue(0);
      mockPrismaClient.tTPhaseRound.create.mockRejectedValue(new Error('Database connection failed'));

      await expect(startPhaseRound(mockPrismaClient as any, context, 'phase1')).rejects.toThrow(
        'Database connection failed',
      );

      // Only 1 attempt since non-P2002 errors don't trigger retry
      expect(mockPrismaClient.tTPhaseRound.create).toHaveBeenCalledTimes(1);
    });

    it('defaults lifeLoss to 1 on the created round when not provided', async () => {
      await startPhaseRound(mockPrismaClient as any, context, 'phase3');

      expect(mockPrismaClient.tTPhaseRound.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lifeLoss: 1 }),
        }),
      );
    });

    it('invalidates active Phase 3 entry versions before opening the round', async () => {
      await startPhaseRound(mockPrismaClient as any, context, 'phase3');

      expect(mockPrismaClient.tTEntry.updateMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: 'phase3', eliminated: false },
        data: { version: { increment: 1 } },
      });
    });

    it('stores a custom lifeLoss on the created round when provided', async () => {
      const result = await startPhaseRound(mockPrismaClient as any, context, 'phase3', undefined, undefined, 2);

      expect(result.lifeLoss).toBe(2);
      expect(mockPrismaClient.tTPhaseRound.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lifeLoss: 2 }),
        }),
      );
    });
  });

  describe('submitRoundResults sudden death', () => {
    const context = {
      tournamentId: 't1',
      userId: 'admin-1',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    };

    beforeEach(() => {
      jest.clearAllMocks();
      mockPrismaClient.tTPhaseRound.findUnique.mockResolvedValue({
        id: 'round1',
        tournamentId: 't1',
        phase: 'phase1',
        roundNumber: 1,
        course: 'MC1',
        results: [],
      });
      mockPrismaClient.tTPhaseRound.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1', eliminated: false },
        { playerId: 'p2', eliminated: false },
        { playerId: 'p3', eliminated: false },
      ]);
      mockPrismaClient.tTPhaseSuddenDeathRound.count.mockResolvedValue(0);
      // No earlier resolved sudden deaths for the base round by default; the
      // chain-ordering query in submitSuddenDeathResults sees only the round
      // being resolved (issue #2773).
      mockPrismaClient.tTPhaseSuddenDeathRound.findMany.mockResolvedValue([]);
      mockPrismaClient.tTPhaseSuddenDeathRound.create.mockResolvedValue({
        id: 'sd1',
        phaseRoundId: 'round1',
        sequence: 1,
        course: 'DP1',
        targetPlayerIds: ['p2', 'p3'],
        resolved: false,
      });
    });

    it('returns a sudden-death request for tied slowest players', async () => {
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1', eliminated: false },
        { playerId: 'p2', eliminated: false },
        { playerId: 'p3', eliminated: false },
        { playerId: 'p4', eliminated: false },
        { playerId: 'p5', eliminated: false },
      ]);
      mockPrismaClient.tTPhaseSuddenDeathRound.create.mockResolvedValue({
        id: 'sd1',
        phaseRoundId: 'round1',
        sequence: 1,
        course: 'DP1',
        targetPlayerIds: ['p4', 'p5'],
        resolved: false,
      });

      const result = await submitRoundResults(mockPrismaClient as any, context, 'phase1', 1, [
        { playerId: 'p1', timeMs: 80000 },
        { playerId: 'p2', timeMs: 81000 },
        { playerId: 'p3', timeMs: 82000 },
        { playerId: 'p4', timeMs: 90000 },
        { playerId: 'p5', timeMs: 90000 },
      ]);

      expect(result.tieBreakRequired).toBe(true);
      expect(result.suddenDeathRound).toEqual(expect.objectContaining({ id: 'sd1' }));
      expect(mockPrismaClient.tTEntry.update).not.toHaveBeenCalled();
    });

    it('reuses the existing sudden-death round after a sequence unique conflict', async () => {
      const uniqueConflict = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1', eliminated: false },
        { playerId: 'p2', eliminated: false },
        { playerId: 'p3', eliminated: false },
        { playerId: 'p4', eliminated: false },
        { playerId: 'p5', eliminated: false },
      ]);
      mockPrismaClient.tTPhaseSuddenDeathRound.count.mockResolvedValue(0);
      mockPrismaClient.tTPhaseSuddenDeathRound.create.mockRejectedValueOnce(uniqueConflict);
      mockPrismaClient.tTPhaseSuddenDeathRound.findFirst.mockResolvedValueOnce({
        id: 'sd1',
        tournamentId: 't1',
        phase: 'phase1',
        phaseRoundId: 'round1',
        sequence: 1,
        course: 'DP1',
        targetPlayerIds: ['p4', 'p5'],
        resolved: false,
      });

      const result = await submitRoundResults(mockPrismaClient as any, context, 'phase1', 1, [
        { playerId: 'p1', timeMs: 80000 },
        { playerId: 'p2', timeMs: 81000 },
        { playerId: 'p3', timeMs: 82000 },
        { playerId: 'p4', timeMs: 90000 },
        { playerId: 'p5', timeMs: 90000 },
      ]);

      expect(result.tieBreakRequired).toBe(true);
      expect(result.suddenDeathRound).toEqual(expect.objectContaining({ id: 'sd1', sequence: 1 }));
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.count).toHaveBeenCalledTimes(1);
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.create).toHaveBeenCalledTimes(1);
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.findFirst).toHaveBeenCalledWith({
        where: {
          tournamentId: 't1',
          phase: 'phase1',
          phaseRoundId: 'round1',
          resolved: false,
        },
        orderBy: { sequence: 'desc' },
      });
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.create.mock.calls[0][0].data.sequence).toBe(1);
    });

    it('throws a refreshable conflict when a concurrent sudden-death round has different targets', async () => {
      const uniqueConflict = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1', eliminated: false },
        { playerId: 'p2', eliminated: false },
        { playerId: 'p3', eliminated: false },
        { playerId: 'p4', eliminated: false },
        { playerId: 'p5', eliminated: false },
      ]);
      mockPrismaClient.tTPhaseSuddenDeathRound.count.mockResolvedValue(0);
      mockPrismaClient.tTPhaseSuddenDeathRound.create.mockRejectedValueOnce(uniqueConflict);
      mockPrismaClient.tTPhaseSuddenDeathRound.findFirst.mockResolvedValueOnce({
        id: 'sd1',
        tournamentId: 't1',
        phase: 'phase1',
        phaseRoundId: 'round1',
        sequence: 1,
        course: 'DP1',
        targetPlayerIds: ['p1', 'p2'],
        resolved: false,
      });

      await expect(
        submitRoundResults(mockPrismaClient as any, context, 'phase1', 1, [
          { playerId: 'p1', timeMs: 80000 },
          { playerId: 'p2', timeMs: 81000 },
          { playerId: 'p3', timeMs: 82000 },
          { playerId: 'p4', timeMs: 90000 },
          { playerId: 'p5', timeMs: 90000 },
        ]),
      ).rejects.toThrow(
        /Sudden-death round for phase1 changed during submission\. Refresh and submit again\. Computed targets \(this request\): \["p4","p5"\], Stored targets \(concurrent request\): \["p1","p2"\]/,
      );

      expect(mockPrismaClient.tTPhaseSuddenDeathRound.create).toHaveBeenCalledTimes(1);
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.count).toHaveBeenCalledTimes(1);
      expect(mockPrismaClient.tTPhaseRound.update).not.toHaveBeenCalled();
    });

    it('retries creation when P2002 recovery finds no existing sudden-death round', async () => {
      const uniqueConflict = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1', eliminated: false },
        { playerId: 'p2', eliminated: false },
        { playerId: 'p3', eliminated: false },
        { playerId: 'p4', eliminated: false },
        { playerId: 'p5', eliminated: false },
      ]);
      mockPrismaClient.tTPhaseSuddenDeathRound.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
      mockPrismaClient.tTPhaseSuddenDeathRound.create.mockRejectedValueOnce(uniqueConflict).mockResolvedValueOnce({
        id: 'sd2',
        tournamentId: 't1',
        phase: 'phase1',
        phaseRoundId: 'round1',
        sequence: 2,
        course: 'DP1',
        targetPlayerIds: ['p4', 'p5'],
        resolved: false,
      });
      mockPrismaClient.tTPhaseSuddenDeathRound.findFirst.mockResolvedValueOnce(null);

      const result = await submitRoundResults(mockPrismaClient as any, context, 'phase1', 1, [
        { playerId: 'p1', timeMs: 80000 },
        { playerId: 'p2', timeMs: 81000 },
        { playerId: 'p3', timeMs: 82000 },
        { playerId: 'p4', timeMs: 90000 },
        { playerId: 'p5', timeMs: 90000 },
      ]);

      expect(result.suddenDeathRound).toEqual(expect.objectContaining({ id: 'sd2', sequence: 2 }));
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.count).toHaveBeenCalledTimes(2);
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.create.mock.calls[0][0].data.sequence).toBe(1);
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.create.mock.calls[1][0].data.sequence).toBe(2);
    });

    it('throws a clear error after repeated P2002 conflicts without a reusable round', async () => {
      const uniqueConflict = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1', eliminated: false },
        { playerId: 'p2', eliminated: false },
        { playerId: 'p3', eliminated: false },
        { playerId: 'p4', eliminated: false },
        { playerId: 'p5', eliminated: false },
      ]);
      mockPrismaClient.tTPhaseSuddenDeathRound.count.mockResolvedValue(0);
      mockPrismaClient.tTPhaseSuddenDeathRound.create.mockRejectedValue(uniqueConflict);
      mockPrismaClient.tTPhaseSuddenDeathRound.findFirst.mockResolvedValue(null);

      await expect(
        submitRoundResults(mockPrismaClient as any, context, 'phase1', 1, [
          { playerId: 'p1', timeMs: 80000 },
          { playerId: 'p2', timeMs: 81000 },
          { playerId: 'p3', timeMs: 82000 },
          { playerId: 'p4', timeMs: 90000 },
          { playerId: 'p5', timeMs: 90000 },
        ]),
      ).rejects.toThrow('Failed to create sudden-death round for phase1');

      expect(mockPrismaClient.tTPhaseSuddenDeathRound.create).toHaveBeenCalledTimes(3);
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.findFirst).toHaveBeenCalledTimes(3);
      expect(mockPrismaClient.tTPhaseRound.update).not.toHaveBeenCalled();
    });

    it('returns a sudden-death request for tied slowest players in phase2', async () => {
      mockPrismaClient.tTPhaseRound.findUnique.mockResolvedValue({
        id: 'round1',
        tournamentId: 't1',
        phase: 'phase2',
        roundNumber: 1,
        course: 'MC1',
        results: [],
      });
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1', eliminated: false },
        { playerId: 'p2', eliminated: false },
        { playerId: 'p3', eliminated: false },
        { playerId: 'p4', eliminated: false },
        { playerId: 'p5', eliminated: false },
      ]);
      mockPrismaClient.tTPhaseSuddenDeathRound.create.mockResolvedValue({
        id: 'sd1',
        phaseRoundId: 'round1',
        sequence: 1,
        course: 'DP1',
        targetPlayerIds: ['p4', 'p5'],
        resolved: false,
      });

      const result = await submitRoundResults(mockPrismaClient as any, context, 'phase2', 1, [
        { playerId: 'p1', timeMs: 80000 },
        { playerId: 'p2', timeMs: 81000 },
        { playerId: 'p3', timeMs: 82000 },
        { playerId: 'p4', timeMs: 90000 },
        { playerId: 'p5', timeMs: 90000 },
      ]);

      expect(result.tieBreakRequired).toBe(true);
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phase: 'phase2',
            targetPlayerIds: ['p4', 'p5'],
            // Issue #2775: the kind driving the tiebreak is persisted, not
            // inferred later from course equality.
            kind: 'elimination',
          }),
        }),
      );
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.create.mock.calls[0][0].data).not.toHaveProperty('reason');
      expect(mockPrismaClient.tTEntry.update).not.toHaveBeenCalled();
    });

    it('does not create phase1 sudden death after the survivor threshold is already reached', async () => {
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1', eliminated: false },
        { playerId: 'p2', eliminated: false },
        { playerId: 'p3', eliminated: false },
        { playerId: 'p4', eliminated: false },
      ]);

      const result = await submitRoundResults(mockPrismaClient as any, context, 'phase1', 1, [
        { playerId: 'p1', timeMs: 80000 },
        { playerId: 'p2', timeMs: 81000 },
        { playerId: 'p3', timeMs: 90000 },
        { playerId: 'p4', timeMs: 90000 },
      ]);

      expect(result.tieBreakRequired).toBeUndefined();
      expect(result.eliminatedIds).toEqual([]);
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.create).not.toHaveBeenCalled();
      expect(mockPrismaClient.tTEntry.update).not.toHaveBeenCalled();
    });

    it('resolves phase1 sudden death by eliminating the slower tied player', async () => {
      mockPrismaClient.tTPhaseSuddenDeathRound.findUnique.mockResolvedValue({
        id: 'sd1',
        tournamentId: 't1',
        phase: 'phase1',
        phaseRoundId: 'round1',
        targetPlayerIds: ['p2', 'p3'],
        resolved: false,
        phaseRound: {
          id: 'round1',
          course: 'MC1',
          results: [
            { playerId: 'p1', timeMs: 80000 },
            { playerId: 'p2', timeMs: 90000 },
            { playerId: 'p3', timeMs: 90000 },
          ],
        },
      });
      mockPrismaClient.tTPhaseSuddenDeathRound.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.update.mockResolvedValue({});

      const result = await submitSuddenDeathResults(mockPrismaClient as any, context, 'phase1', 'sd1', [
        { playerId: 'p2', timeMs: 88000 },
        { playerId: 'p3', timeMs: 89000 },
      ]);

      expect(result.eliminatedIds).toEqual(['p3']);
      expect(mockPrismaClient.tTEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { eliminated: true },
        }),
      );
    });

    it('handles a sudden-death parent round with null results', async () => {
      mockPrismaClient.tTPhaseSuddenDeathRound.findUnique.mockResolvedValue({
        id: 'sd1',
        tournamentId: 't1',
        phase: 'phase1',
        phaseRoundId: 'round1',
        targetPlayerIds: ['p2', 'p3'],
        resolved: false,
        phaseRound: {
          id: 'round1',
          course: 'MC1',
          results: null,
        },
      });
      mockPrismaClient.tTPhaseSuddenDeathRound.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.update.mockResolvedValue({});

      const result = await submitSuddenDeathResults(mockPrismaClient as any, context, 'phase1', 'sd1', [
        { playerId: 'p2', timeMs: 88000 },
        { playerId: 'p3', timeMs: 89000 },
      ]);

      expect(result.eliminatedIds).toEqual(['p3']);
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            resolved: true,
          }),
        }),
      );
      expect(mockPrismaClient.tTEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { eliminated: true },
        }),
      );
    });

    it('continues phase1 sudden death with only players still tied for slowest', async () => {
      mockPrismaClient.tTPhaseSuddenDeathRound.findUnique.mockResolvedValue({
        id: 'sd1',
        tournamentId: 't1',
        phase: 'phase1',
        phaseRoundId: 'round1',
        targetPlayerIds: ['p2', 'p3', 'p4'],
        resolved: false,
        phaseRound: {
          id: 'round1',
          course: 'MC1',
          results: [
            { playerId: 'p1', timeMs: 80000 },
            { playerId: 'p2', timeMs: 90000 },
            { playerId: 'p3', timeMs: 90000 },
            { playerId: 'p4', timeMs: 90000 },
          ],
        },
      });
      mockPrismaClient.tTPhaseSuddenDeathRound.update.mockResolvedValue({});
      mockPrismaClient.tTPhaseSuddenDeathRound.count.mockResolvedValue(1);
      mockPrismaClient.tTPhaseSuddenDeathRound.create.mockResolvedValue({
        id: 'sd2',
        targetPlayerIds: ['p3', 'p4'],
        resolved: false,
      });

      const result = await submitSuddenDeathResults(mockPrismaClient as any, context, 'phase1', 'sd1', [
        { playerId: 'p2', timeMs: 85000 },
        { playerId: 'p3', timeMs: 90000 },
        { playerId: 'p4', timeMs: 90000 },
      ]);

      expect(result.tieBreakRequired).toBe(true);
      expect(mockPrismaClient.tTEntry.update).not.toHaveBeenCalled();
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            targetPlayerIds: ['p3', 'p4'],
          }),
        }),
      );
    });

    it('continues phase3 sudden death when the life-loss boundary remains tied', async () => {
      mockPrismaClient.tTPhaseSuddenDeathRound.findUnique.mockResolvedValue({
        id: 'sd1',
        tournamentId: 't1',
        phase: 'phase3',
        phaseRoundId: 'round1',
        targetPlayerIds: ['p2', 'p3', 'p4'],
        resolved: false,
        phaseRound: {
          id: 'round1',
          course: 'MC1',
          results: [
            { playerId: 'p1', timeMs: 80000 },
            { playerId: 'p2', timeMs: 90000 },
            { playerId: 'p3', timeMs: 90000 },
            { playerId: 'p4', timeMs: 90000 },
          ],
        },
      });
      mockPrismaClient.tTPhaseSuddenDeathRound.update.mockResolvedValue({});
      mockPrismaClient.tTPhaseSuddenDeathRound.count.mockResolvedValue(1);
      mockPrismaClient.tTPhaseSuddenDeathRound.create.mockResolvedValue({
        id: 'sd2',
        targetPlayerIds: ['p2', 'p3'],
        resolved: false,
      });

      const result = await submitSuddenDeathResults(mockPrismaClient as any, context, 'phase3', 'sd1', [
        { playerId: 'p2', timeMs: 88000 },
        { playerId: 'p3', timeMs: 88000 },
        { playerId: 'p4', timeMs: 91000 },
      ]);

      expect(result.tieBreakRequired).toBe(true);
      expect(mockPrismaClient.tTEntry.update).not.toHaveBeenCalled();
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            targetPlayerIds: ['p2', 'p3'],
          }),
        }),
      );
    });

    it('requires a phase3 revival race when simultaneous eliminations would leave fewer than 8 players', async () => {
      mockPrismaClient.tTPhaseRound.findUnique.mockResolvedValue({
        id: 'round1',
        tournamentId: 't1',
        phase: 'phase3',
        roundNumber: 1,
        course: 'MC1',
        results: [],
      });
      mockPrismaClient.tTEntry.findMany.mockResolvedValue(
        Array.from({ length: 9 }, (_, index) => ({
          playerId: `p${index + 1}`,
          eliminated: false,
          lives: index >= 5 ? 1 : 3,
        })),
      );
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([]);
      mockPrismaClient.tTPhaseSuddenDeathRound.count.mockResolvedValue(0);
      mockPrismaClient.tTPhaseSuddenDeathRound.create.mockResolvedValue({
        id: 'sd1',
        targetPlayerIds: ['p6', 'p7', 'p8', 'p9'],
        resolved: false,
      });

      const result = await submitRoundResults(mockPrismaClient as any, context, 'phase3', 1, [
        { playerId: 'p1', timeMs: 80000 },
        { playerId: 'p2', timeMs: 81000 },
        { playerId: 'p3', timeMs: 82000 },
        { playerId: 'p4', timeMs: 83000 },
        { playerId: 'p5', timeMs: 84000 },
        { playerId: 'p6', timeMs: 85000 },
        { playerId: 'p7', timeMs: 86000 },
        { playerId: 'p8', timeMs: 90000 },
        { playerId: 'p9', timeMs: 90000 },
      ]);

      expect(result.tieBreakRequired).toBe(true);
      expect(mockPrismaClient.tTEntry.update).not.toHaveBeenCalled();
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            targetPlayerIds: expect.arrayContaining(['p6', 'p7', 'p8', 'p9']),
            kind: 'revival',
          }),
        }),
      );
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.create.mock.calls[0][0].data.targetPlayerIds).toHaveLength(4);
    });

    it('sends all three 1-life players to revival when they lose life together at the top-8 boundary', async () => {
      mockPrismaClient.tTPhaseRound.findUnique.mockResolvedValue({
        id: 'round1',
        tournamentId: 't1',
        phase: 'phase3',
        roundNumber: 1,
        course: 'MC1',
        results: [],
      });
      mockPrismaClient.tTEntry.findMany.mockResolvedValue(
        Array.from({ length: 9 }, (_, index) => ({
          playerId: `p${index + 1}`,
          eliminated: false,
          lives: index >= 6 ? 1 : index >= 3 ? 2 : 3,
        })),
      );
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([]);
      mockPrismaClient.tTPhaseSuddenDeathRound.count.mockResolvedValue(0);
      mockPrismaClient.tTPhaseSuddenDeathRound.create.mockResolvedValue({
        id: 'sd1',
        targetPlayerIds: ['p7', 'p8', 'p9'],
        resolved: false,
      });

      const result = await submitRoundResults(mockPrismaClient as any, context, 'phase3', 1, [
        { playerId: 'p1', timeMs: 80000 },
        { playerId: 'p2', timeMs: 81000 },
        { playerId: 'p3', timeMs: 82000 },
        { playerId: 'p4', timeMs: 83000 },
        { playerId: 'p5', timeMs: 84000 },
        { playerId: 'p6', timeMs: 85000 },
        { playerId: 'p7', timeMs: 86000 },
        { playerId: 'p8', timeMs: 87000 },
        { playerId: 'p9', timeMs: 88000 },
      ]);

      expect(result.tieBreakRequired).toBe(true);
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            targetPlayerIds: expect.arrayContaining(['p7', 'p8', 'p9']),
          }),
        }),
      );
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.create.mock.calls[0][0].data.targetPlayerIds).toHaveLength(3);
      expect(mockPrismaClient.tTEntry.update).not.toHaveBeenCalled();
    });

    it('resolves a phase3 revival race by eliminating only enough players to hit 8 and reset lives', async () => {
      mockPrismaClient.tTPhaseSuddenDeathRound.findUnique.mockResolvedValue({
        id: 'sd1',
        tournamentId: 't1',
        phase: 'phase3',
        phaseRoundId: 'round1',
        targetPlayerIds: ['p6', 'p7', 'p8', 'p9'],
        resolved: false,
        phaseRound: {
          id: 'round1',
          course: 'MC1',
          results: [
            { playerId: 'p1', timeMs: 80000 },
            { playerId: 'p2', timeMs: 81000 },
            { playerId: 'p3', timeMs: 82000 },
            { playerId: 'p4', timeMs: 83000 },
            { playerId: 'p5', timeMs: 84000 },
            { playerId: 'p6', timeMs: 85000 },
            { playerId: 'p7', timeMs: 86000 },
            { playerId: 'p8', timeMs: 90000 },
            { playerId: 'p9', timeMs: 90000 },
          ],
        },
      });
      mockPrismaClient.tTPhaseSuddenDeathRound.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.findMany
        .mockResolvedValueOnce(
          Array.from({ length: 9 }, (_, index) => ({
            id: `entry-p${index + 1}`,
            playerId: `p${index + 1}`,
            eliminated: false,
            lives: index >= 5 ? 1 : 3,
          })),
        )
        .mockResolvedValueOnce(
          Array.from({ length: 8 }, (_, index) => ({
            id: `entry-p${index + 1}`,
            playerId: `p${index + 1}`,
            eliminated: false,
            lives: index >= 5 ? 0 : 3,
          })),
        );
      mockPrismaClient.tTEntry.findUnique.mockImplementation(({ where }) => {
        const playerId = where.tournamentId_playerId_stage.playerId;
        const index = Number(playerId.slice(1));
        return Promise.resolve({
          id: `entry-${playerId}`,
          playerId,
          eliminated: false,
          lives: index >= 6 ? 1 : 3,
        });
      });
      mockPrismaClient.tTEntry.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.updateMany.mockResolvedValue({ count: 8 });

      const result = await submitSuddenDeathResults(mockPrismaClient as any, context, 'phase3', 'sd1', [
        { playerId: 'p6', timeMs: 85000 },
        { playerId: 'p7', timeMs: 86000 },
        { playerId: 'p8', timeMs: 88000 },
        { playerId: 'p9', timeMs: 89000 },
      ]);

      expect(result.eliminatedIds).toEqual(['p9']);
      expect(result.livesReset).toBe(true);
      expect(mockPrismaClient.tTEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'entry-p9' },
          data: { lives: 0, eliminated: true },
        }),
      );
      expect(mockPrismaClient.tTEntry.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'entry-p8' },
          data: expect.objectContaining({ eliminated: true }),
        }),
      );
      expect(mockPrismaClient.tTEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tournamentId: 't1', stage: 'phase3', eliminated: false },
          data: { lives: 3 },
        }),
      );
    });

    /* ───────── issue #2773: scenario-aware sudden-death courses ───────── */

    it('creates a phase3 life-loss tiebreak on the SAME course as the base round', async () => {
      mockPrismaClient.tTPhaseRound.findUnique.mockResolvedValue({
        id: 'round1',
        tournamentId: 't1',
        phase: 'phase3',
        roundNumber: 1,
        course: 'MC1',
        results: [],
      });
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1', eliminated: false, lives: 3 },
        { playerId: 'p2', eliminated: false, lives: 3 },
        { playerId: 'p3', eliminated: false, lives: 3 },
        { playerId: 'p4', eliminated: false, lives: 3 },
      ]);
      mockPrismaClient.tTPhaseSuddenDeathRound.create.mockResolvedValue({
        id: 'sd1',
        phaseRoundId: 'round1',
        sequence: 1,
        course: 'MC1',
        targetPlayerIds: ['p2', 'p3'],
        resolved: false,
      });

      // p2/p3 tie across the life-loss boundary (positions 2-3 of 4).
      const result = await submitRoundResults(mockPrismaClient as any, context, 'phase3', 1, [
        { playerId: 'p1', timeMs: 80000 },
        { playerId: 'p2', timeMs: 90000 },
        { playerId: 'p3', timeMs: 90000 },
        { playerId: 'p4', timeMs: 95000 },
      ]);

      expect(result.tieBreakRequired).toBe(true);
      // Same course re-run: no pool lookup, course comes from the base round.
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            course: 'MC1',
            targetPlayerIds: ['p2', 'p3'],
          }),
        }),
      );
      expect(mockPrismaClient.tTPhaseRound.findMany).not.toHaveBeenCalled();
    });

    it('keeps drawing a fresh pool course for phase1 elimination ties', async () => {
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1', eliminated: false },
        { playerId: 'p2', eliminated: false },
        { playerId: 'p3', eliminated: false },
        { playerId: 'p4', eliminated: false },
        { playerId: 'p5', eliminated: false },
      ]);
      // Pool lookup sees the base round; its course must not be re-drawn.
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([
        { id: 'round1', phase: 'phase1', roundNumber: 1, course: 'MC1', suddenDeathRounds: [] },
      ]);

      await submitRoundResults(mockPrismaClient as any, context, 'phase1', 1, [
        { playerId: 'p1', timeMs: 80000 },
        { playerId: 'p2', timeMs: 81000 },
        { playerId: 'p3', timeMs: 82000 },
        { playerId: 'p4', timeMs: 90000 },
        { playerId: 'p5', timeMs: 90000 },
      ]);

      const createdCourse = mockPrismaClient.tTPhaseSuddenDeathRound.create.mock.calls[0][0].data.course;
      expect(createdCourse).not.toBe('MC1');
      expect(mockPrismaClient.tTPhaseRound.findMany).toHaveBeenCalled();
    });

    it('re-runs the same course again when a life-loss sudden death re-ties', async () => {
      mockPrismaClient.tTPhaseSuddenDeathRound.findUnique.mockResolvedValue({
        id: 'sd1',
        tournamentId: 't1',
        phase: 'phase3',
        phaseRoundId: 'round1',
        sequence: 1,
        course: 'MC1', // same as base round → life-loss re-run
        kind: 'life_loss',
        targetPlayerIds: ['p2', 'p3'],
        resolved: false,
        phaseRound: {
          id: 'round1',
          course: 'MC1',
          results: [
            { playerId: 'p1', timeMs: 80000 },
            { playerId: 'p2', timeMs: 90000 },
            { playerId: 'p3', timeMs: 90000 },
            { playerId: 'p4', timeMs: 95000 },
          ],
        },
      });
      mockPrismaClient.tTPhaseSuddenDeathRound.update.mockResolvedValue({});
      mockPrismaClient.tTPhaseSuddenDeathRound.count.mockResolvedValue(1);
      mockPrismaClient.tTPhaseSuddenDeathRound.create.mockResolvedValue({
        id: 'sd2',
        phaseRoundId: 'round1',
        sequence: 2,
        course: 'MC1',
        targetPlayerIds: ['p2', 'p3'],
        resolved: false,
      });

      // Both tied players post the same time again → continuation round.
      const result = await submitSuddenDeathResults(mockPrismaClient as any, context, 'phase3', 'sd1', [
        { playerId: 'p2', timeMs: 91000 },
        { playerId: 'p3', timeMs: 91000 },
      ]);

      expect(result.tieBreakRequired).toBe(true);
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // Issue #2775: the continuation carries the parent's kind forward
          // instead of re-deriving it from course equality.
          data: expect.objectContaining({ course: 'MC1', sequence: 2, kind: 'life_loss' }),
        }),
      );
    });

    /* ───────── issue #2773: bronze-medal sudden death at top 4 ───────── */

    it('defers elimination to a bronze sudden death when both top-4 bottom players lose their last life', async () => {
      mockPrismaClient.tTPhaseRound.findUnique.mockResolvedValue({
        id: 'round1',
        tournamentId: 't1',
        phase: 'phase3',
        roundNumber: 5,
        course: 'MC1',
        results: [],
      });
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1', eliminated: false, lives: 2 },
        { playerId: 'p2', eliminated: false, lives: 2 },
        { playerId: 'p3', eliminated: false, lives: 1 },
        { playerId: 'p4', eliminated: false, lives: 1 },
      ]);
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([
        { id: 'round1', phase: 'phase3', roundNumber: 5, course: 'MC1', suddenDeathRounds: [] },
      ]);
      mockPrismaClient.tTPhaseSuddenDeathRound.create.mockResolvedValue({
        id: 'sd-bronze',
        phaseRoundId: 'round1',
        sequence: 1,
        course: 'DP1',
        targetPlayerIds: ['p3', 'p4'],
        resolved: false,
      });

      // Distinct times — the bronze race triggers WITHOUT a tie.
      const result = await submitRoundResults(mockPrismaClient as any, context, 'phase3', 5, [
        { playerId: 'p1', timeMs: 80000 },
        { playerId: 'p2', timeMs: 81000 },
        { playerId: 'p3', timeMs: 82000 },
        { playerId: 'p4', timeMs: 83000 },
      ]);

      expect(result.tieBreakRequired).toBe(true);
      const createData = mockPrismaClient.tTPhaseSuddenDeathRound.create.mock.calls[0][0].data;
      expect(createData.targetPlayerIds).toEqual(['p3', 'p4']);
      // Bronze races use a fresh course, consumed from the pool.
      expect(createData.course).not.toBe('MC1');
      expect(createData.kind).toBe('bronze');
      expect(mockPrismaClient.tTEntry.update).not.toHaveBeenCalled();
    });

    it('does not run a bronze race when only one top-4 bottom player is on the last life', async () => {
      mockPrismaClient.tTPhaseRound.findUnique.mockResolvedValue({
        id: 'round1',
        tournamentId: 't1',
        phase: 'phase3',
        roundNumber: 5,
        course: 'MC1',
        results: [],
      });
      const roster = [
        { playerId: 'p1', eliminated: false, lives: 2 },
        { playerId: 'p2', eliminated: false, lives: 2 },
        { playerId: 'p3', eliminated: false, lives: 2 },
        { playerId: 'p4', eliminated: false, lives: 1 },
      ];
      mockPrismaClient.tTEntry.findMany
        .mockResolvedValueOnce(roster) // submitRoundResults validation + tie detection
        .mockResolvedValueOnce(roster) // processPhase3Result active players
        .mockResolvedValueOnce(roster.slice(0, 3)); // remaining players after elimination
      const livesByPlayer = new Map(roster.map((entry) => [entry.playerId, entry.lives]));
      mockPrismaClient.tTEntry.findUnique.mockImplementation(({ where }) => {
        const playerId = where.tournamentId_playerId_stage.playerId;
        return Promise.resolve({
          id: `entry-${playerId}`,
          playerId,
          eliminated: false,
          lives: livesByPlayer.get(playerId) ?? 3,
        });
      });
      mockPrismaClient.tTEntry.update.mockResolvedValue({});

      const result = await submitRoundResults(mockPrismaClient as any, context, 'phase3', 5, [
        { playerId: 'p1', timeMs: 80000 },
        { playerId: 'p2', timeMs: 81000 },
        { playerId: 'p3', timeMs: 82000 },
        { playerId: 'p4', timeMs: 83000 },
      ]);

      expect(result.tieBreakRequired).toBeUndefined();
      expect(result.eliminatedIds).toEqual(['p4']);
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.create).not.toHaveBeenCalled();
    });

    it('finalizes both eliminations after the bronze race and orders 3rd place by its times', async () => {
      mockPrismaClient.tTPhaseSuddenDeathRound.findUnique.mockResolvedValue({
        id: 'sd-bronze',
        tournamentId: 't1',
        phase: 'phase3',
        phaseRoundId: 'round1',
        sequence: 1,
        course: 'DP1', // fresh course ≠ base course
        targetPlayerIds: ['p3', 'p4'],
        resolved: false,
        phaseRound: {
          id: 'round1',
          course: 'MC1',
          results: [
            { playerId: 'p1', timeMs: 80000 },
            { playerId: 'p2', timeMs: 81000 },
            { playerId: 'p3', timeMs: 82000 },
            { playerId: 'p4', timeMs: 83000 },
          ],
        },
      });
      mockPrismaClient.tTPhaseSuddenDeathRound.update.mockResolvedValue({});
      const roster = [
        { playerId: 'p1', eliminated: false, lives: 2 },
        { playerId: 'p2', eliminated: false, lives: 2 },
        { playerId: 'p3', eliminated: false, lives: 1 },
        { playerId: 'p4', eliminated: false, lives: 1 },
      ];
      mockPrismaClient.tTEntry.findMany
        .mockResolvedValueOnce(roster) // bronze check + processPhase3Result (preloaded)
        .mockResolvedValueOnce(roster.slice(0, 2)); // remaining players → threshold 2
      const livesByPlayer = new Map(roster.map((entry) => [entry.playerId, entry.lives]));
      mockPrismaClient.tTEntry.findUnique.mockImplementation(({ where }) => {
        const playerId = where.tournamentId_playerId_stage.playerId;
        return Promise.resolve({
          id: `entry-${playerId}`,
          playerId,
          eliminated: false,
          lives: livesByPlayer.get(playerId) ?? 3,
        });
      });
      mockPrismaClient.tTEntry.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.updateMany.mockResolvedValue({ count: 2 });
      mockPrismaClient.tTPhaseRound.update.mockResolvedValue({});

      // p4 wins the bronze race despite the slower base-round time.
      const result = await submitSuddenDeathResults(mockPrismaClient as any, context, 'phase3', 'sd-bronze', [
        { playerId: 'p3', timeMs: 92000 },
        { playerId: 'p4', timeMs: 91000 },
      ]);

      // The pair was already the bronze target set — no second bronze race.
      expect(result.tieBreakRequired).toBeUndefined();
      expect([...result.eliminatedIds].sort()).toEqual(['p3', 'p4']);
      expect(result.livesReset).toBe(true);
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.create).not.toHaveBeenCalled();
    });

    it("honors the base round's custom lifeLoss when finalizing a bronze-race elimination", async () => {
      // Base round was started with lifeLoss: 2 (TA battle royale). Both bronze
      // racers hold exactly 2 lives — "on their last life" under lifeLoss 2,
      // even though they would NOT be under the default lifeLoss 1.
      mockPrismaClient.tTPhaseSuddenDeathRound.findUnique.mockResolvedValue({
        id: 'sd-bronze',
        tournamentId: 't1',
        phase: 'phase3',
        phaseRoundId: 'round1',
        sequence: 1,
        course: 'DP1',
        targetPlayerIds: ['p3', 'p4'],
        resolved: false,
        phaseRound: {
          id: 'round1',
          course: 'MC1',
          lifeLoss: 2,
          results: [
            { playerId: 'p1', timeMs: 80000 },
            { playerId: 'p2', timeMs: 81000 },
            { playerId: 'p3', timeMs: 82000 },
            { playerId: 'p4', timeMs: 83000 },
          ],
        },
      });
      mockPrismaClient.tTPhaseSuddenDeathRound.update.mockResolvedValue({});
      const bronzeRoster = [
        { playerId: 'p1', eliminated: false, lives: 4 },
        { playerId: 'p2', eliminated: false, lives: 4 },
        { playerId: 'p3', eliminated: false, lives: 2 },
        { playerId: 'p4', eliminated: false, lives: 2 },
      ];
      mockPrismaClient.tTEntry.findMany
        .mockResolvedValueOnce(bronzeRoster) // bronze check + processPhase3Result (preloaded)
        .mockResolvedValueOnce(bronzeRoster.slice(0, 2)); // remaining players → threshold 2
      const bronzeLivesByPlayer = new Map(bronzeRoster.map((entry) => [entry.playerId, entry.lives]));
      mockPrismaClient.tTEntry.findUnique.mockImplementation(({ where }) => {
        const playerId = where.tournamentId_playerId_stage.playerId;
        return Promise.resolve({
          id: `entry-${playerId}`,
          playerId,
          eliminated: false,
          lives: bronzeLivesByPlayer.get(playerId) ?? 4,
        });
      });
      mockPrismaClient.tTEntry.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.updateMany.mockResolvedValue({ count: 2 });
      mockPrismaClient.tTPhaseRound.update.mockResolvedValue({});

      const result = await submitSuddenDeathResults(mockPrismaClient as any, context, 'phase3', 'sd-bronze', [
        { playerId: 'p3', timeMs: 92000 },
        { playerId: 'p4', timeMs: 91000 },
      ]);

      expect(result.tieBreakRequired).toBeUndefined();
      expect([...result.eliminatedIds].sort()).toEqual(['p3', 'p4']);
      expect(mockPrismaClient.tTEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'entry-p3' },
          data: { lives: 0, eliminated: true },
        }),
      );
      expect(mockPrismaClient.tTEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'entry-p4' },
          data: { lives: 0, eliminated: true },
        }),
      );
    });

    it('re-races a bronze tie on a fresh course when both bronze racers post equal times', async () => {
      mockPrismaClient.tTPhaseSuddenDeathRound.findUnique.mockResolvedValue({
        id: 'sd-bronze',
        tournamentId: 't1',
        phase: 'phase3',
        phaseRoundId: 'round1',
        sequence: 1,
        course: 'DP1', // fresh course ≠ base course (bronze race)
        targetPlayerIds: ['p3', 'p4'],
        resolved: false,
        phaseRound: {
          id: 'round1',
          course: 'MC1',
          results: [
            { playerId: 'p1', timeMs: 80000 },
            { playerId: 'p2', timeMs: 81000 },
            { playerId: 'p3', timeMs: 82000 },
            { playerId: 'p4', timeMs: 83000 },
          ],
        },
      });
      mockPrismaClient.tTPhaseSuddenDeathRound.update.mockResolvedValue({});
      mockPrismaClient.tTPhaseSuddenDeathRound.count.mockResolvedValue(1);
      mockPrismaClient.tTPhaseSuddenDeathRound.create.mockResolvedValue({
        id: 'sd-bronze-2',
        phaseRoundId: 'round1',
        sequence: 2,
        course: 'GV1',
        targetPlayerIds: ['p3', 'p4'],
        resolved: false,
      });
      // Pool lookup for the fresh continuation course (bronze, not a re-run).
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([
        {
          id: 'round1',
          phase: 'phase3',
          roundNumber: 1,
          course: 'MC1',
          suddenDeathRounds: [{ id: 'sd-bronze', course: 'DP1' }],
        },
      ]);

      // Both bronze racers tie again → continuation bronze race required.
      const result = await submitSuddenDeathResults(mockPrismaClient as any, context, 'phase3', 'sd-bronze', [
        { playerId: 'p3', timeMs: 91000 },
        { playerId: 'p4', timeMs: 91000 },
      ]);

      expect(result.tieBreakRequired).toBe(true);
      const createData = mockPrismaClient.tTPhaseSuddenDeathRound.create.mock.calls[0][0].data;
      expect(createData.targetPlayerIds).toEqual(['p3', 'p4']);
      // Continuation of a bronze race stays on a fresh course (not a re-run of MC1).
      expect(createData.course).not.toBe('MC1');
      expect(mockPrismaClient.tTEntry.update).not.toHaveBeenCalled();
    });

    it('chains a life-loss tiebreak into a bronze race when its outcome leaves both bottom players eliminated', async () => {
      mockPrismaClient.tTPhaseSuddenDeathRound.findUnique.mockResolvedValue({
        id: 'sd1',
        tournamentId: 't1',
        phase: 'phase3',
        phaseRoundId: 'round1',
        sequence: 1,
        course: 'MC1', // life-loss re-run (same course as base round)
        targetPlayerIds: ['p2', 'p3'],
        resolved: false,
        phaseRound: {
          id: 'round1',
          course: 'MC1',
          results: [
            { playerId: 'p1', timeMs: 80000 },
            { playerId: 'p2', timeMs: 90000 },
            { playerId: 'p3', timeMs: 90000 },
            { playerId: 'p4', timeMs: 95000 },
          ],
        },
      });
      mockPrismaClient.tTPhaseSuddenDeathRound.update.mockResolvedValue({});
      // p2 keeps 3 lives; p3/p4 are on their last life.
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1', eliminated: false, lives: 3 },
        { playerId: 'p2', eliminated: false, lives: 3 },
        { playerId: 'p3', eliminated: false, lives: 1 },
        { playerId: 'p4', eliminated: false, lives: 1 },
      ]);
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([
        {
          id: 'round1',
          phase: 'phase3',
          roundNumber: 1,
          course: 'MC1',
          suddenDeathRounds: [{ id: 'sd1', course: 'MC1' }],
        },
      ]);
      mockPrismaClient.tTPhaseSuddenDeathRound.count.mockResolvedValue(1);
      mockPrismaClient.tTPhaseSuddenDeathRound.create.mockResolvedValue({
        id: 'sd-bronze',
        phaseRoundId: 'round1',
        sequence: 2,
        course: 'DP1',
        targetPlayerIds: ['p3', 'p4'],
        resolved: false,
      });

      // p2 beats p3 in the life-loss re-run → p3 falls into the bottom half
      // next to p4; both are on their last life → bronze race required.
      const result = await submitSuddenDeathResults(mockPrismaClient as any, context, 'phase3', 'sd1', [
        { playerId: 'p2', timeMs: 90500 },
        { playerId: 'p3', timeMs: 91000 },
      ]);

      expect(result.tieBreakRequired).toBe(true);
      const createData = mockPrismaClient.tTPhaseSuddenDeathRound.create.mock.calls[0][0].data;
      expect(createData.targetPlayerIds).toEqual(['p3', 'p4']);
      expect(createData.course).not.toBe('MC1');
      expect(mockPrismaClient.tTEntry.update).not.toHaveBeenCalled();
    });

    it('keeps non-sudden players from becoming an unintended elimination target in phase3', async () => {
      mockPrismaClient.tTPhaseSuddenDeathRound.findUnique.mockResolvedValue({
        id: 'sd1',
        tournamentId: 't1',
        phase: 'phase3',
        phaseRoundId: 'round1',
        targetPlayerIds: ['p4', 'p5'],
        resolved: false,
        phaseRound: {
          id: 'round1',
          course: 'MC1',
          results: [
            { playerId: 'p1', timeMs: 10000 },
            { playerId: 'p2', timeMs: 11000 },
            { playerId: 'p3', timeMs: 13001 },
            { playerId: 'p4', timeMs: 13000 },
            { playerId: 'p5', timeMs: 13005 },
          ],
        },
      });
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: 'p1', eliminated: false, lives: 3 },
        { playerId: 'p2', eliminated: false, lives: 3 },
        { playerId: 'p3', eliminated: false, lives: 3 },
        { playerId: 'p4', eliminated: false, lives: 1 },
        { playerId: 'p5', eliminated: false, lives: 1 },
      ]);
      mockPrismaClient.tTEntry.findUnique.mockImplementation(({ where }) => {
        const playerId = where?.tournamentId_playerId_stage?.playerId;
        const livesByPlayer = new Map([
          ['p1', 3],
          ['p2', 3],
          ['p3', 3],
          ['p4', 1],
          ['p5', 1],
        ]);
        if (!playerId) return Promise.resolve(null);
        return Promise.resolve({
          id: `entry-${playerId}`,
          lives: livesByPlayer.get(playerId) ?? 3,
          eliminated: false,
        });
      });
      mockPrismaClient.tTPhaseSuddenDeathRound.update.mockResolvedValue({});
      mockPrismaClient.tTPhaseRound.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.update.mockResolvedValue({});

      const result = await submitSuddenDeathResults(mockPrismaClient as any, context, 'phase3', 'sd1', [
        { playerId: 'p5', timeMs: 92000 },
        { playerId: 'p4', timeMs: 91000 },
      ]);

      expect(result.eliminatedIds).toEqual(['p5']);
      for (const protectedPlayerId of ['p1', 'p2', 'p3']) {
        expect(result.eliminatedIds).not.toContain(protectedPlayerId);
      }
      expect(mockPrismaClient.tTPhaseRound.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eliminatedIds: ['p5'],
            livesReset: false,
          }),
        }),
      );
    });
  });

  describe('changeSuddenDeathCourse', () => {
    const context = {
      tournamentId: 't1',
      userId: 'admin-1',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    };

    it("allows selecting the base round's course even though it was already played (issue #2773)", async () => {
      mockPrismaClient.tTPhaseSuddenDeathRound.findUnique.mockResolvedValue({
        id: 'sd1',
        tournamentId: 't1',
        phase: 'phase3',
        phaseRoundId: 'round1',
        kind: 'life_loss',
        resolved: false,
        results: null,
        phaseRound: { course: 'MC1' },
      });
      mockPrismaClient.tTPhaseSuddenDeathRound.update.mockResolvedValue({ id: 'sd1', course: 'MC1' });

      await changeSuddenDeathCourse(mockPrismaClient as any, context, 'phase3', 'sd1', 'MC1');

      // Base-course selection skips the played-course validation entirely.
      expect(mockPrismaClient.tTPhaseRound.findMany).not.toHaveBeenCalled();
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.update).toHaveBeenCalledWith({
        where: { id: 'sd1' },
        data: { course: 'MC1' },
      });
    });

    it('still rejects other already-played courses', async () => {
      mockPrismaClient.tTPhaseSuddenDeathRound.findUnique.mockResolvedValue({
        id: 'sd1',
        tournamentId: 't1',
        phase: 'phase3',
        phaseRoundId: 'round1',
        resolved: false,
        results: null,
        phaseRound: { course: 'MC1' },
      });
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([
        { id: 'round0', phase: 'phase3', roundNumber: 1, course: 'DP1', suddenDeathRounds: [] },
        { id: 'round1', phase: 'phase3', roundNumber: 2, course: 'MC1', suddenDeathRounds: [] },
      ]);

      await expect(changeSuddenDeathCourse(mockPrismaClient as any, context, 'phase3', 'sd1', 'DP1')).rejects.toThrow(
        'Course "DP1" has already been played in the current cycle',
      );
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.update).not.toHaveBeenCalled();
    });

    /* Regression for issue #2775: the base-course bypass is a life_loss-only
     * rule (issue #2773). Before `kind` was persisted, the guard only checked
     * `phase === "phase3"`, so a revival or bronze sudden death — which must
     * always draw a fresh course — could be redirected onto the already-used
     * base round course via a direct API call. */
    it.each(['revival', 'bronze'] as const)(
      "rejects redirecting a %s sudden death onto the base round's course",
      async (kind) => {
        mockPrismaClient.tTPhaseSuddenDeathRound.findUnique.mockResolvedValue({
          id: 'sd1',
          tournamentId: 't1',
          phase: 'phase3',
          phaseRoundId: 'round1',
          kind,
          resolved: false,
          results: null,
          phaseRound: { course: 'MC1' },
        });
        mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([
          { id: 'round1', phase: 'phase3', roundNumber: 1, course: 'MC1', suddenDeathRounds: [] },
        ]);

        await expect(changeSuddenDeathCourse(mockPrismaClient as any, context, 'phase3', 'sd1', 'MC1')).rejects.toThrow(
          'Course "MC1" has already been played in the current cycle',
        );
        expect(mockPrismaClient.tTPhaseSuddenDeathRound.update).not.toHaveBeenCalled();
      },
    );
  });

  // === AUDIT LOG .catch() ERROR PATH (#779) ===

  describe('promoteToPhase audit log .catch() resilience', () => {
    const context = {
      tournamentId: 't1',
      userId: 'u1',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    };

    /** Minimal qual-player shape returned by getQualificationPlayersByRank */
    const makeQualPlayer = (playerId: string, rank: number) => ({
      id: `entry-${playerId}`,
      playerId,
      stage: 'qualification',
      rank,
      totalTime: 100,
      lives: 0,
      eliminated: false,
      times: [],
      player: { id: playerId, name: `P${rank}`, nickname: `P${rank}` },
    });

    /** Phase-entry shape returned by the post-createMany findMany */
    const makePhaseEntry = (playerId: string) => ({
      id: `phase-entry-${playerId}`,
      playerId,
      player: { id: playerId, name: `P-${playerId}`, nickname: `P-${playerId}` },
    });

    it('should call logger.warn when audit log rejects in promoteToPhase1', async () => {
      (createAuditLog as jest.Mock).mockRejectedValue(new Error('Audit failed'));

      // 1) getQualificationPlayersByRank — ranks 17-24
      (mockPrismaClient.tTEntry.findMany as jest.Mock)
        .mockResolvedValueOnce([makeQualPlayer('p1', 17)])
        // 2) bulk-check existing phase1 entries
        .mockResolvedValueOnce([])
        // 3) fetch created entries for audit loop
        .mockResolvedValueOnce([makePhaseEntry('p1')]);
      (mockPrismaClient.tTEntry.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await promoteToPhase1(mockPrismaClient as never, context);

      // Drain the micro-task queue so the fire-and-forget .catch() callback runs
      await Promise.resolve();

      const mockLogger = (createLogger as jest.Mock).mock.results.at(-1)!.value;
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to create audit log',
        expect.objectContaining({ error: expect.any(Error) }),
      );
      expect(result.entries).toHaveLength(1);
    });

    it('should call logger.warn when audit log rejects in promoteToPhase2', async () => {
      (createAuditLog as jest.Mock).mockRejectedValue(new Error('Audit failed'));

      // promoteToPhase2: 1) phase1 survivors, 2) qual ranks 13-16, 3) existing check, 4) created entries
      (mockPrismaClient.tTEntry.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // phase1 survivors (none)
        .mockResolvedValueOnce([makeQualPlayer('p2', 13)]) // qualification ranks 13-16
        .mockResolvedValueOnce([]) // existing phase2 entries
        .mockResolvedValueOnce([makePhaseEntry('p2')]); // created entries for audit loop
      (mockPrismaClient.tTEntry.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await promoteToPhase2(mockPrismaClient as never, context);

      await Promise.resolve();

      const mockLogger = (createLogger as jest.Mock).mock.results.at(-1)!.value;
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to create audit log',
        expect.objectContaining({ error: expect.any(Error) }),
      );
      expect(result.entries).toHaveLength(1);
    });

    it('should call logger.warn when audit log rejects in promoteToPhase3', async () => {
      (createAuditLog as jest.Mock).mockRejectedValue(new Error('Audit failed'));

      // promoteToPhase3: 1) phase2 survivors, 2) qual ranks 1-12, 3) existing check, 4) created entries
      (mockPrismaClient.tTEntry.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // phase2 survivors (none)
        .mockResolvedValueOnce([makeQualPlayer('p3', 1)]) // qualification ranks 1-12
        .mockResolvedValueOnce([]) // existing phase3 entries
        .mockResolvedValueOnce([makePhaseEntry('p3')]); // created entries for audit loop
      (mockPrismaClient.tTEntry.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await promoteToPhase3(mockPrismaClient as never, context);

      await Promise.resolve();

      const mockLogger = (createLogger as jest.Mock).mock.results.at(-1)!.value;
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to create audit log',
        expect.objectContaining({ error: expect.any(Error) }),
      );
      expect(result.entries).toHaveLength(1);
    });
  });

  describe('resetPhase', () => {
    const context = {
      tournamentId: 't1',
      userId: 'admin1',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
    };

    const makeResetEntry = (playerId: string, nickname: string) => ({
      id: `entry-${playerId}`,
      playerId,
      player: { nickname },
    });

    it('deletes sudden-death rounds, phase rounds, and the stage roster for phase1 when no later phase exists', async () => {
      // Guard check: no phase2/phase3 entries exist, so phase1 can be reset.
      mockPrismaClient.tTEntry.findFirst.mockResolvedValue(null);
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([makeResetEntry('p1', 'Alice'), makeResetEntry('p2', 'Bob')]);
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
      mockPrismaClient.tTPhaseSuddenDeathRound.deleteMany.mockResolvedValue({ count: 3 });
      mockPrismaClient.tTPhaseRound.deleteMany.mockResolvedValue({ count: 2 });
      mockPrismaClient.tTEntry.deleteMany.mockResolvedValue({ count: 2 });

      const result = await resetPhase(mockPrismaClient as never, context, 'phase1');

      expect(result).toEqual({ stage: 'phase1', deletedEntryCount: 2, deletedRoundCount: 2 });

      // Guard queried both later stages in one round-trip.
      expect(mockPrismaClient.tTEntry.findFirst).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: { in: ['phase2', 'phase3'] } },
        select: { stage: true },
      });

      // Deletion order: sudden-death rounds -> phase rounds -> roster (see
      // resetPhase's doc comment for why the roster is deleted last on D1).
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.deleteMany).toHaveBeenCalledWith({
        where: { phaseRoundId: { in: ['r1', 'r2'] } },
      });
      expect(mockPrismaClient.tTPhaseRound.deleteMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', phase: 'phase1' },
      });
      expect(mockPrismaClient.tTPhaseLifeAdjustment.deleteMany).not.toHaveBeenCalled();
      expect(mockPrismaClient.tTEntry.deleteMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: 'phase1' },
      });

      const suddenDeathOrder = mockPrismaClient.tTPhaseSuddenDeathRound.deleteMany.mock.invocationCallOrder[0];
      const roundOrder = mockPrismaClient.tTPhaseRound.deleteMany.mock.invocationCallOrder[0];
      const entryOrder = mockPrismaClient.tTEntry.deleteMany.mock.invocationCallOrder[0];
      expect(suddenDeathOrder).toBeLessThan(roundOrder);
      expect(roundOrder).toBeLessThan(entryOrder);
    });

    it('throws PhaseResetConflictError when resetting phase1 while phase2 entries exist', async () => {
      mockPrismaClient.tTEntry.findFirst.mockResolvedValue({ stage: 'phase2' });

      await expect(resetPhase(mockPrismaClient as never, context, 'phase1')).rejects.toThrow(PhaseResetConflictError);
      expect(mockPrismaClient.tTEntry.deleteMany).not.toHaveBeenCalled();
    });

    it('throws PhaseResetConflictError when resetting phase2 while phase3 entries exist', async () => {
      mockPrismaClient.tTEntry.findFirst.mockResolvedValue({ stage: 'phase3' });

      await expect(resetPhase(mockPrismaClient as never, context, 'phase2')).rejects.toThrow(PhaseResetConflictError);
      expect(mockPrismaClient.tTEntry.findFirst).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: { in: ['phase3'] } },
        select: { stage: true },
      });
      expect(mockPrismaClient.tTEntry.deleteMany).not.toHaveBeenCalled();
    });

    it('re-checks the later-phase guard immediately before deletion', async () => {
      mockPrismaClient.tTEntry.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ stage: 'phase2' });
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([makeResetEntry('p1', 'Alice')]);
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([{ id: 'r1' }]);

      await expect(resetPhase(mockPrismaClient as never, context, 'phase1')).rejects.toThrow(PhaseResetConflictError);

      expect(mockPrismaClient.tTEntry.findFirst).toHaveBeenCalledTimes(2);
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.deleteMany).not.toHaveBeenCalled();
      expect(mockPrismaClient.tTPhaseLifeAdjustment.deleteMany).not.toHaveBeenCalled();
      expect(mockPrismaClient.tTPhaseRound.deleteMany).not.toHaveBeenCalled();
      expect(mockPrismaClient.tTEntry.deleteMany).not.toHaveBeenCalled();
    });

    it('allows resetting phase3 without a later-phase guard query', async () => {
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([makeResetEntry('p1', 'Alice')]);
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([]);
      mockPrismaClient.tTPhaseRound.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaClient.tTEntry.deleteMany.mockResolvedValue({ count: 1 });

      const result = await resetPhase(mockPrismaClient as never, context, 'phase3');

      expect(result).toEqual({ stage: 'phase3', deletedEntryCount: 1, deletedRoundCount: 0 });
      // phase3 has no later phase, so the conflict guard must not run at all.
      expect(mockPrismaClient.tTEntry.findFirst).not.toHaveBeenCalled();
      // No rounds existed, so the sudden-death cleanup query is skipped entirely.
      expect(mockPrismaClient.tTPhaseSuddenDeathRound.deleteMany).not.toHaveBeenCalled();
      expect(mockPrismaClient.tTPhaseLifeAdjustment.deleteMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
      });
    });

    it('throws when the stage has no entries to reset', async () => {
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([]);

      await expect(resetPhase(mockPrismaClient as never, context, 'phase3')).rejects.toThrow(
        'No phase3 entries to reset',
      );
      // Should short-circuit before looking up round data.
      expect(mockPrismaClient.tTPhaseRound.findMany).not.toHaveBeenCalled();
    });

    it('records an audit log describing the deleted roster', async () => {
      mockPrismaClient.tTEntry.findFirst.mockResolvedValue(null);
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([makeResetEntry('p1', 'Alice')]);
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([]);
      mockPrismaClient.tTPhaseRound.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaClient.tTEntry.deleteMany.mockResolvedValue({ count: 1 });

      await resetPhase(mockPrismaClient as never, context, 'phase1');

      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin1',
          action: 'DELETE_TA_ENTRY',
          targetId: 't1',
          targetType: 'Tournament',
          details: expect.objectContaining({
            tournamentId: 't1',
            stage: 'phase1',
            deletedEntryCount: 1,
            playerIds: ['p1'],
            playerNicknames: ['Alice'],
          }),
        }),
      );
    });

    it('waits for the audit log write before resolving the reset', async () => {
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([makeResetEntry('p1', 'Alice')]);
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([]);
      mockPrismaClient.tTPhaseRound.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaClient.tTEntry.deleteMany.mockResolvedValue({ count: 1 });

      let releaseAudit!: () => void;
      let markAuditStarted!: () => void;
      const auditStarted = new Promise<void>((resolve) => {
        markAuditStarted = resolve;
      });
      const auditBlocked = new Promise<void>((resolve) => {
        releaseAudit = resolve;
      });
      (createAuditLog as jest.Mock).mockImplementation(() => {
        markAuditStarted();
        return auditBlocked;
      });

      let settled = false;
      const resetPromise = resetPhase(mockPrismaClient as never, context, 'phase3').finally(() => {
        settled = true;
      });
      await auditStarted;
      await Promise.resolve();
      expect(settled).toBe(false);

      releaseAudit();
      await expect(resetPromise).resolves.toEqual({
        stage: 'phase3',
        deletedEntryCount: 1,
        deletedRoundCount: 0,
      });
    });

    it('logs a warning when the audit log write rejects, without failing the reset', async () => {
      mockPrismaClient.tTEntry.findFirst.mockResolvedValue(null);
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([makeResetEntry('p1', 'Alice')]);
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([]);
      mockPrismaClient.tTPhaseRound.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaClient.tTEntry.deleteMany.mockResolvedValue({ count: 1 });
      (createAuditLog as jest.Mock).mockRejectedValue(new Error('Audit failed'));

      const result = await resetPhase(mockPrismaClient as never, context, 'phase1');
      await Promise.resolve();

      const mockLogger = (createLogger as jest.Mock).mock.results.at(-1)!.value;
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to create audit log for phase reset',
        expect.objectContaining({ error: expect.any(Error) }),
      );
      expect(result.deletedEntryCount).toBe(1);
    });

    it('recovers from an accidental premature promotion: resetting phase2 clears the bad 12-player field so re-promotion yields 8', async () => {
      // Regression test for the reported incident: promoteToPhase2 was called
      // before phase1 results were submitted, so all 8 phase1 entrants were
      // still "active" and got combined with the 4 qualification ranks 13-16,
      // producing 12 phase2 entries instead of the intended 4 + 4 = 8.

      // Step 1: promoteToPhase2 runs while all 8 phase1 entries are still active.
      const activePhase1 = Array.from({ length: 8 }, (_, i) => ({
        playerId: `p1-${i}`,
        totalTime: 60000 + i,
        times: {},
        rank: 17 + i,
        player: { nickname: `P1-${i}` },
      }));
      const qualRanks13to16 = Array.from({ length: 4 }, (_, i) => ({
        playerId: `q-${i}`,
        totalTime: 50000 + i,
        times: {},
        rank: 13 + i,
        player: { nickname: `Q-${i}` },
      }));
      (mockPrismaClient.tTEntry.findMany as jest.Mock)
        .mockResolvedValueOnce(activePhase1) // phase1 survivors (bug: all 8, none eliminated yet)
        .mockResolvedValueOnce(qualRanks13to16) // qualification ranks 13-16
        .mockResolvedValueOnce([]) // existing phase2 entries check
        .mockResolvedValueOnce(
          [...activePhase1, ...qualRanks13to16].map((s) => ({ playerId: s.playerId, player: s.player })),
        ); // created entries for audit loop
      mockPrismaClient.tTEntry.createMany.mockResolvedValue({ count: 12 });

      const buggyPromotion = await promoteToPhase2(mockPrismaClient as never, context);
      expect(buggyPromotion.entries).toHaveLength(12); // confirms the bug reproduces

      // Step 2: admin notices the mistake and resets phase2 before phase3 exists.
      jest.clearAllMocks();
      mockPrismaClient.tTEntry.findFirst.mockResolvedValue(null); // no phase3 entries
      mockPrismaClient.tTEntry.findMany.mockResolvedValue(
        [...activePhase1, ...qualRanks13to16].map((s) => ({ playerId: s.playerId, player: s.player })),
      );
      mockPrismaClient.tTPhaseRound.findMany.mockResolvedValue([]);
      mockPrismaClient.tTPhaseRound.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaClient.tTEntry.deleteMany.mockResolvedValue({ count: 12 });

      const reset = await resetPhase(mockPrismaClient as never, context, 'phase2');
      expect(reset.deletedEntryCount).toBe(12);
      expect(mockPrismaClient.tTEntry.deleteMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: 'phase2' },
      });

      // Step 3: phase1 is properly narrowed to its 4 intended survivors, then
      // promoteToPhase2 is called again and now correctly yields 4 + 4 = 8.
      jest.clearAllMocks();
      const phase1Survivors = activePhase1.slice(0, 4);
      (mockPrismaClient.tTEntry.findMany as jest.Mock)
        .mockResolvedValueOnce(phase1Survivors) // phase1 survivors (now correctly 4)
        .mockResolvedValueOnce(qualRanks13to16) // qualification ranks 13-16
        .mockResolvedValueOnce([]) // existing phase2 entries check (cleared by reset)
        .mockResolvedValueOnce(
          [...phase1Survivors, ...qualRanks13to16].map((s) => ({ playerId: s.playerId, player: s.player })),
        );
      mockPrismaClient.tTEntry.createMany.mockResolvedValue({ count: 8 });

      const correctPromotion = await promoteToPhase2(mockPrismaClient as never, context);
      expect(correctPromotion.entries).toHaveLength(8);
    });
  });
});

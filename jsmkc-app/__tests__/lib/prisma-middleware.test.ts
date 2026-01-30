/**
 * @module __tests__/lib/prisma-middleware.test.ts
 *
 * Test suite for the Prisma soft-delete middleware layer (prisma-middleware.ts).
 *
 * Covers the following functionality:
 * - createSoftDeleteMiddleware: intercepts delete/deleteMany and converts to
 *   soft deletes, and automatically filters soft-deleted records from find queries.
 * - SoftDeleteUtils class: explicit soft-delete, find, and restore operations
 *   for Player and Tournament models, plus "withDeleted" query variants.
 *
 * These tests use in-memory mock Prisma clients with jest.fn() stubs to verify
 * that the correct Prisma operations (update, findMany, findUnique) are called
 * with the expected arguments, including the deletedAt filter logic.
 */
// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly
import { createSoftDeleteMiddleware, SoftDeleteUtils } from '@/lib/prisma-middleware';

// ============================================================
// createSoftDeleteMiddleware tests
// ============================================================
describe('createSoftDeleteMiddleware', () => {
  let middleware: ReturnType<typeof createSoftDeleteMiddleware>;
  let nextFn: jest.Mock;

  beforeEach(() => {
    middleware = createSoftDeleteMiddleware();
    nextFn = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------- delete -> update conversion ----------

  describe('delete action conversion', () => {
    it('should convert delete to update with deletedAt for soft-delete models', async () => {
      // Verify that a "delete" action on a supported model is intercepted
      // and rewritten to "update" with a deletedAt timestamp.
      const params = {
        model: 'Player',
        action: 'delete',
        args: { where: { id: 'player-1' } },
      };

      await middleware(params as any, nextFn);

      // The middleware mutates params in place: action becomes 'update',
      // and args.data is set with a deletedAt Date.
      expect(params.action).toBe('update');
      expect(params.args.data).toEqual({ deletedAt: expect.any(Date) });
      expect(nextFn).toHaveBeenCalledWith(params);
    });

    it('should convert delete to update for Tournament model', async () => {
      const params = {
        model: 'Tournament',
        action: 'delete',
        args: { where: { id: 'tournament-1' } },
      };

      await middleware(params as any, nextFn);

      expect(params.action).toBe('update');
      expect(params.args.data).toEqual({ deletedAt: expect.any(Date) });
    });

    it('should NOT convert delete for non-soft-delete models', async () => {
      // Models not in the softDeleteModels list should pass through unchanged.
      const params = {
        model: 'SomeOtherModel',
        action: 'delete',
        args: { where: { id: 'other-1' } },
      };

      await middleware(params as any, nextFn);

      expect(params.action).toBe('delete');
      expect(params.args.data).toBeUndefined();
    });
  });

  // ---------- deleteMany -> updateMany conversion ----------

  describe('deleteMany action conversion', () => {
    it('should convert deleteMany to updateMany with deletedAt for soft-delete models', async () => {
      const params = {
        model: 'BMMatch',
        action: 'deleteMany',
        args: { where: { tournamentId: 't-1' } },
      };

      await middleware(params as any, nextFn);

      expect(params.action).toBe('updateMany');
      expect(params.args.data).toEqual({ deletedAt: expect.any(Date) });
    });

    it('should merge deletedAt into existing data for deleteMany', async () => {
      // When args.data already exists, deletedAt should be merged into it.
      const params = {
        model: 'MRMatch',
        action: 'deleteMany',
        args: {
          where: { tournamentId: 't-1' },
          data: { someField: 'value' },
        },
      };

      await middleware(params as any, nextFn);

      expect(params.action).toBe('updateMany');
      expect(params.args.data).toEqual({
        someField: 'value',
        deletedAt: expect.any(Date),
      });
    });

    it('should NOT convert deleteMany for non-soft-delete models', async () => {
      const params = {
        model: 'UnknownModel',
        action: 'deleteMany',
        args: { where: {} },
      };

      await middleware(params as any, nextFn);

      expect(params.action).toBe('deleteMany');
    });
  });

  // ---------- find queries auto-filter ----------

  describe('find query auto-filtering', () => {
    it('should add deletedAt filter to findMany for soft-delete models', async () => {
      const params = {
        model: 'Player',
        action: 'findMany',
        args: { where: { name: 'Test' } },
      };

      await middleware(params as any, nextFn);

      expect(params.args.where).toEqual({ name: 'Test', deletedAt: null });
    });

    it('should add deletedAt filter to findFirst for soft-delete models', async () => {
      const params = {
        model: 'Tournament',
        action: 'findFirst',
        args: { where: { status: 'active' } },
      };

      await middleware(params as any, nextFn);

      expect(params.args.where).toEqual({ status: 'active', deletedAt: null });
    });

    it('should add deletedAt filter to findUnique for soft-delete models', async () => {
      const params = {
        model: 'GPMatch',
        action: 'findUnique',
        args: { where: { id: 'gp-1' } },
      };

      await middleware(params as any, nextFn);

      expect(params.args.where).toEqual({ id: 'gp-1', deletedAt: null });
    });

    it('should create where clause with deletedAt when where is missing', async () => {
      const params = {
        model: 'Player',
        action: 'findMany',
        args: {},
      };

      await middleware(params as any, nextFn);

      expect(params.args.where).toEqual({ deletedAt: null });
    });

    it('should skip filter when includeDeleted is true', async () => {
      // The middleware respects args.includeDeleted to bypass auto-filtering.
      const params = {
        model: 'Player',
        action: 'findMany',
        args: { where: { name: 'Test' }, includeDeleted: true },
      };

      await middleware(params as any, nextFn);

      // deletedAt should NOT be added because includeDeleted is true
      expect(params.args.where).toEqual({ name: 'Test' });
    });

    it('should NOT add filter for non-soft-delete models', async () => {
      const params = {
        model: 'OtherModel',
        action: 'findMany',
        args: { where: { foo: 'bar' } },
      };

      await middleware(params as any, nextFn);

      expect(params.args.where).toEqual({ foo: 'bar' });
    });

    it('should NOT add filter for non-find actions', async () => {
      const params = {
        model: 'Player',
        action: 'create',
        args: { data: { name: 'New' } },
      };

      await middleware(params as any, nextFn);

      // where should not be created for 'create' actions
      expect(params.args.where).toBeUndefined();
    });
  });

  // ---------- all soft-delete model coverage ----------

  describe('all soft-delete models are handled', () => {
    const softDeleteModels = [
      'Player', 'Tournament', 'BMMatch', 'BMQualification',
      'MRMatch', 'MRQualification', 'GPMatch', 'GPQualification', 'TTEntry',
    ];

    it.each(softDeleteModels)('should handle delete for model %s', async (model) => {
      const params = {
        model,
        action: 'delete',
        args: { where: { id: 'test-id' } },
      };

      await middleware(params as any, nextFn);

      expect(params.action).toBe('update');
      expect(params.args.data).toEqual({ deletedAt: expect.any(Date) });
    });

    it.each(softDeleteModels)('should handle findMany for model %s', async (model) => {
      const params = {
        model,
        action: 'findMany',
        args: { where: {} },
      };

      await middleware(params as any, nextFn);

      expect(params.args.where).toEqual({ deletedAt: null });
    });
  });

  // ---------- next function is always called ----------

  it('should always call next with the (possibly mutated) params', async () => {
    const params = {
      model: 'Player',
      action: 'delete',
      args: { where: { id: 'x' } },
    };

    const result = { id: 'x' };
    nextFn.mockResolvedValue(result);

    const returnValue = await middleware(params as any, nextFn);

    expect(nextFn).toHaveBeenCalledTimes(1);
    expect(returnValue).toBe(result);
  });
});

// ============================================================
// SoftDeleteUtils tests
// ============================================================
describe('SoftDeleteUtils', () => {
  let mockPrisma: Record<string, any>;
  let utils: SoftDeleteUtils;

  beforeEach(() => {
    // Build a mock PrismaClient with the model delegates used by SoftDeleteUtils.
    mockPrisma = {
      player: {
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      tournament: {
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      bMMatch: {
        update: jest.fn().mockResolvedValue({}),
      },
      bMQualification: {
        update: jest.fn().mockResolvedValue({}),
      },
      mRMatch: {
        update: jest.fn().mockResolvedValue({}),
      },
      mRQualification: {
        update: jest.fn().mockResolvedValue({}),
      },
      gPMatch: {
        update: jest.fn().mockResolvedValue({}),
      },
      gPQualification: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    utils = new SoftDeleteUtils(mockPrisma as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------- Soft delete operations ----------

  describe('softDeletePlayer', () => {
    it('should soft delete a player by setting deletedAt', async () => {
      const id = 'player-123';
      await utils.softDeletePlayer(id);

      expect(mockPrisma.player.update).toHaveBeenCalledWith({
        where: { id },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('should propagate errors from prisma', async () => {
      mockPrisma.player.update.mockRejectedValue(new Error('DB error'));
      await expect(utils.softDeletePlayer('x')).rejects.toThrow('DB error');
    });
  });

  describe('softDeleteTournament', () => {
    it('should soft delete a tournament by setting deletedAt', async () => {
      const id = 'tournament-123';
      await utils.softDeleteTournament(id);

      expect(mockPrisma.tournament.update).toHaveBeenCalledWith({
        where: { id },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe('softDeleteBMMatch', () => {
    it('should soft delete a BMMatch by setting deletedAt', async () => {
      const id = 'bm-match-123';
      await utils.softDeleteBMMatch(id);

      expect(mockPrisma.bMMatch.update).toHaveBeenCalledWith({
        where: { id },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe('softDeleteBMQualification', () => {
    it('should soft delete a BMQualification by setting deletedAt', async () => {
      const id = 'bm-qual-123';
      await utils.softDeleteBMQualification(id);

      expect(mockPrisma.bMQualification.update).toHaveBeenCalledWith({
        where: { id },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe('softDeleteMRMatch', () => {
    it('should soft delete an MRMatch by setting deletedAt', async () => {
      const id = 'mr-match-123';
      await utils.softDeleteMRMatch(id);

      expect(mockPrisma.mRMatch.update).toHaveBeenCalledWith({
        where: { id },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe('softDeleteMRQualification', () => {
    it('should soft delete an MRQualification by setting deletedAt', async () => {
      const id = 'mr-qual-123';
      await utils.softDeleteMRQualification(id);

      expect(mockPrisma.mRQualification.update).toHaveBeenCalledWith({
        where: { id },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe('softDeleteGPMatch', () => {
    it('should soft delete a GPMatch by setting deletedAt', async () => {
      const id = 'gp-match-123';
      await utils.softDeleteGPMatch(id);

      expect(mockPrisma.gPMatch.update).toHaveBeenCalledWith({
        where: { id },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe('softDeleteGPQualification', () => {
    it('should soft delete a GPQualification by setting deletedAt', async () => {
      const id = 'gp-qual-123';
      await utils.softDeleteGPQualification(id);

      expect(mockPrisma.gPQualification.update).toHaveBeenCalledWith({
        where: { id },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  // ---------- Query operations ----------

  describe('getPlayers', () => {
    it('should query players excluding soft-deleted records by default', async () => {
      await utils.getPlayers();

      expect(mockPrisma.player.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
    });

    it('should merge deletedAt filter with existing where clause', async () => {
      const options = { where: { name: 'Test' } };
      await utils.getPlayers(options as any);

      expect(mockPrisma.player.findMany).toHaveBeenCalledWith({
        where: { name: 'Test', deletedAt: null },
      });
    });
  });

  describe('getTournaments', () => {
    it('should query tournaments excluding soft-deleted records by default', async () => {
      await utils.getTournaments();

      expect(mockPrisma.tournament.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
    });

    it('should merge deletedAt filter with existing where clause', async () => {
      const options = { where: { name: 'Cup' } };
      await utils.getTournaments(options as any);

      expect(mockPrisma.tournament.findMany).toHaveBeenCalledWith({
        where: { name: 'Cup', deletedAt: null },
      });
    });
  });

  // ---------- Restore operations ----------

  describe('restorePlayer', () => {
    it('should restore a soft-deleted player by setting deletedAt to null', async () => {
      const id = 'player-123';
      await utils.restorePlayer(id);

      expect(mockPrisma.player.update).toHaveBeenCalledWith({
        where: { id },
        data: { deletedAt: null },
      });
    });
  });

  describe('restoreTournament', () => {
    it('should restore a soft-deleted tournament by setting deletedAt to null', async () => {
      const id = 'tournament-123';
      await utils.restoreTournament(id);

      expect(mockPrisma.tournament.update).toHaveBeenCalledWith({
        where: { id },
        data: { deletedAt: null },
      });
    });
  });

  // ---------- "WithDeleted" query variants ----------

  describe('getPlayersWithDeleted', () => {
    it('should query players without filtering soft-deleted records', async () => {
      await utils.getPlayersWithDeleted();

      // No deletedAt filter should be applied -- passes options as-is.
      expect(mockPrisma.player.findMany).toHaveBeenCalledWith({});
    });

    it('should pass through options without adding deletedAt filter', async () => {
      const options = { where: { name: 'Admin' }, take: 10 };
      await utils.getPlayersWithDeleted(options as any);

      expect(mockPrisma.player.findMany).toHaveBeenCalledWith(options);
    });
  });

  describe('getTournamentsWithDeleted', () => {
    it('should query tournaments without filtering soft-deleted records', async () => {
      await utils.getTournamentsWithDeleted();

      expect(mockPrisma.tournament.findMany).toHaveBeenCalledWith({});
    });
  });

  describe('findPlayerWithDeleted', () => {
    it('should find a specific player by id including soft-deleted', async () => {
      const id = 'player-123';
      await utils.findPlayerWithDeleted(id);

      expect(mockPrisma.player.findUnique).toHaveBeenCalledWith({
        where: { id },
      });
    });
  });

  describe('findTournamentWithDeleted', () => {
    it('should find a specific tournament by id including soft-deleted', async () => {
      const id = 'tournament-123';
      await utils.findTournamentWithDeleted(id);

      expect(mockPrisma.tournament.findUnique).toHaveBeenCalledWith({
        where: { id },
      });
    });

    it('should pass additional options to findUnique', async () => {
      const id = 'tournament-123';
      const options = { include: { players: true } };
      await utils.findTournamentWithDeleted(id, options as any);

      expect(mockPrisma.tournament.findUnique).toHaveBeenCalledWith({
        where: { id },
        ...options,
      });
    });
  });
});

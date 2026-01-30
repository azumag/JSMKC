import { createSoftDeleteMiddleware, SoftDeleteUtils } from '@/lib/soft-delete';
import { PrismaClient } from '@prisma/client';

interface MiddlewareParams {
  model?: string;
  action: string;
  args: {
    where?: Record<string, unknown>;
    data?: Record<string, unknown>;
    includeDeleted?: boolean;
    [key: string]: unknown;
  };
}

// Mock PrismaClient
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    player: {
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    tournament: {
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    bMMatch: {
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    bMQualification: {
      update: jest.fn(),
      findMany: jest.fn(),
    },
    mRMatch: {
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    mRQualification: {
      update: jest.fn(),
      findMany: jest.fn(),
    },
    gPMatch: {
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    gPQualification: {
      update: jest.fn(),
      findMany: jest.fn(),
    },
    tTEntry: {
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

describe('createSoftDeleteMiddleware', () => {
  let mockNext: jest.Mock;
  let middleware: ReturnType<typeof createSoftDeleteMiddleware>;

  beforeEach(() => {
    mockNext = jest.fn().mockResolvedValue('next result');
    middleware = createSoftDeleteMiddleware();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('DELETE operation conversion', () => {
    it('should convert DELETE to UPDATE for Player model', async () => {
      const params: MiddlewareParams = {
        model: 'Player',
        action: 'delete',
        args: { where: { id: 'player-123' } },
      };

      await middleware(params, mockNext);

      expect(params.action).toBe('update');
      expect(params.args.data).toEqual({ deletedAt: expect.any(Date) });
    });

    it('should convert DELETE to UPDATE for Tournament model', async () => {
      const params: MiddlewareParams = {
        model: 'Tournament',
        action: 'delete',
        args: { where: { id: 'tournament-123' } },
      };

      await middleware(params, mockNext);

      expect(params.action).toBe('update');
      expect(params.args.data).toEqual({ deletedAt: expect.any(Date) });
    });

    it('should convert DELETE to UPDATE for BMMatch model', async () => {
      const params: MiddlewareParams = {
        model: 'BMMatch',
        action: 'delete',
        args: { where: { id: 'bm-match-123' } },
      };

      await middleware(params, mockNext);

      expect(params.action).toBe('update');
      expect(params.args.data).toEqual({ deletedAt: expect.any(Date) });
    });

    it('should convert DELETE to UPDATE for BMQualification model', async () => {
      const params: MiddlewareParams = {
        model: 'BMQualification',
        action: 'delete',
        args: { where: { id: 'bm-qual-123' } },
      };

      await middleware(params, mockNext);

      expect(params.action).toBe('update');
      expect(params.args.data).toEqual({ deletedAt: expect.any(Date) });
    });

    it('should convert DELETE to UPDATE for MRMatch model', async () => {
      const params: MiddlewareParams = {
        model: 'MRMatch',
        action: 'delete',
        args: { where: { id: 'mr-match-123' } },
      };

      await middleware(params, mockNext);

      expect(params.action).toBe('update');
      expect(params.args.data).toEqual({ deletedAt: expect.any(Date) });
    });

    it('should convert DELETE to UPDATE for MRQualification model', async () => {
      const params: MiddlewareParams = {
        model: 'MRQualification',
        action: 'delete',
        args: { where: { id: 'mr-qual-123' } },
      };

      await middleware(params, mockNext);

      expect(params.action).toBe('update');
      expect(params.args.data).toEqual({ deletedAt: expect.any(Date) });
    });

    it('should convert DELETE to UPDATE for GPMatch model', async () => {
      const params: MiddlewareParams = {
        model: 'GPMatch',
        action: 'delete',
        args: { where: { id: 'gp-match-123' } },
      };

      await middleware(params, mockNext);

      expect(params.action).toBe('update');
      expect(params.args.data).toEqual({ deletedAt: expect.any(Date) });
    });

    it('should convert DELETE to UPDATE for GPQualification model', async () => {
      const params: MiddlewareParams = {
        model: 'GPQualification',
        action: 'delete',
        args: { where: { id: 'gp-qual-123' } },
      };

      await middleware(params, mockNext);

      expect(params.action).toBe('update');
      expect(params.args.data).toEqual({ deletedAt: expect.any(Date) });
    });

    it('should convert DELETE to UPDATE for TTEntry model', async () => {
      const params: MiddlewareParams = {
        model: 'TTEntry',
        action: 'delete',
        args: { where: { id: 'tt-entry-123' } },
      };

      await middleware(params, mockNext);

      expect(params.action).toBe('update');
      expect(params.args.data).toEqual({ deletedAt: expect.any(Date) });
    });
  });

  describe('deleteMany operation conversion', () => {
    it('should convert deleteMany to updateMany when data is undefined', async () => {
      const params: MiddlewareParams = {
        model: 'Player',
        action: 'deleteMany',
        args: { where: { id: 'player-123' } },
      };

      await middleware(params, mockNext);

      expect(params.action).toBe('updateMany');
      expect(params.args.data).toEqual({ deletedAt: expect.any(Date) });
    });

    it('should convert deleteMany to updateMany when data exists', async () => {
      const params: MiddlewareParams = {
        model: 'Player',
        action: 'deleteMany',
        args: {
          where: { id: 'player-123' },
          data: { status: 'inactive' },
        },
      };

      await middleware(params, mockNext);

      expect(params.action).toBe('updateMany');
      expect(params.args.data).toEqual({
        status: 'inactive',
        deletedAt: expect.any(Date),
      });
    });
  });

  describe('Query filtering', () => {
    it('should filter deleted records in findMany when includeDeleted is false', async () => {
      const params: MiddlewareParams = {
        model: 'Player',
        action: 'findMany',
        args: { where: { name: 'John' } },
      };

      await middleware(params, mockNext);

      expect(params.args.where).toEqual({
        name: 'John',
        deletedAt: null,
      });
    });

    it('should filter deleted records in findMany when includeDeleted is not set', async () => {
      const params: MiddlewareParams = {
        model: 'Player',
        action: 'findMany',
        args: { where: { name: 'John' } },
      };

      await middleware(params, mockNext);

      expect(params.args.where).toEqual({
        name: 'John',
        deletedAt: null,
      });
    });

    it('should NOT filter deleted records in findMany when includeDeleted is true', async () => {
      const params: MiddlewareParams = {
        model: 'Player',
        action: 'findMany',
        args: {
          where: { name: 'John' },
          includeDeleted: true,
        },
      };

      await middleware(params, mockNext);

      expect(params.args.where).toEqual({ name: 'John' });
    });

    it('should add where clause if missing in findMany', async () => {
      const params: MiddlewareParams = {
        model: 'Player',
        action: 'findMany',
        args: {},
      };

      await middleware(params, mockNext);

      expect(params.args.where).toEqual({ deletedAt: null });
    });

    it('should filter deleted records in findFirst', async () => {
      const params: MiddlewareParams = {
        model: 'Player',
        action: 'findFirst',
        args: { where: { name: 'John' } },
      };

      await middleware(params, mockNext);

      expect(params.args.where).toEqual({
        name: 'John',
        deletedAt: null,
      });
    });

    it('should filter deleted records in findUnique', async () => {
      const params: MiddlewareParams = {
        model: 'Player',
        action: 'findUnique',
        args: { where: { id: 'player-123' } },
      };

      await middleware(params, mockNext);

      expect(params.args.where).toEqual({
        id: 'player-123',
        deletedAt: null,
      });
    });

    it('should NOT filter in findUnique when includeDeleted is true', async () => {
      const params: MiddlewareParams = {
        model: 'Player',
        action: 'findUnique',
        args: {
          where: { id: 'player-123' },
          includeDeleted: true,
        },
      };

      await middleware(params, mockNext);

      expect(params.args.where).toEqual({ id: 'player-123' });
    });
  });

  describe('Non-soft-delete models', () => {
    it('should NOT modify operations for non-soft-delete models', async () => {
      const params: MiddlewareParams = {
        model: 'User',
        action: 'delete',
        args: { where: { id: 'user-123' } },
      };

      await middleware(params, mockNext);

      expect(params.action).toBe('delete');
      expect(params.args.data).toBeUndefined();
    });

    it('should NOT modify operations when model is undefined', async () => {
      const params: MiddlewareParams = {
        action: 'delete',
        args: { where: { id: 'id-123' } },
      };

      await middleware(params, mockNext);

      expect(params.action).toBe('delete');
      expect(params.args.data).toBeUndefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty args object', async () => {
      const params: MiddlewareParams = {
        model: 'Player',
        action: 'findMany',
        args: {} as Record<string, unknown>,
      };

      await middleware(params, mockNext);

      expect(params.args.where).toEqual({ deletedAt: null });
    });

    it('should call next with modified params', async () => {
      const params: MiddlewareParams = {
        model: 'Player',
        action: 'delete',
        args: { where: { id: 'player-123' } },
      };

      await middleware(params, mockNext);

      expect(mockNext).toHaveBeenCalledWith({
        model: 'Player',
        action: 'update',
        args: {
          where: { id: 'player-123' },
          data: { deletedAt: expect.any(Date) },
        },
      });
    });

    it('should handle non-find operations (create, update, etc.)', async () => {
      const params: MiddlewareParams = {
        model: 'Player',
        action: 'create',
        args: { data: { name: 'John' } },
      };

      await middleware(params, mockNext);

      expect(params.action).toBe('create');
      expect(params.args.data).toEqual({ name: 'John' });
    });
  });
});

describe('SoftDeleteUtils', () => {
  interface MockPrismaClient {
    player: {
      update: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    tournament: {
      update: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  }

  let mockPrisma: MockPrismaClient;
  let softDeleteUtils: SoftDeleteUtils;

  beforeEach(() => {
    mockPrisma = {
      player: {
        update: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      tournament: {
        update: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    softDeleteUtils = new SoftDeleteUtils(mockPrisma as unknown as PrismaClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('softDeletePlayer', () => {
    it('should soft delete a player by id', async () => {
      const playerId = 'player-123';
      mockPrisma.player.update.mockResolvedValue({ id: playerId, deletedAt: new Date() });

      const result = await softDeleteUtils.softDeletePlayer(playerId);

      expect(mockPrisma.player.update).toHaveBeenCalledWith({
        where: { id: playerId },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result).toEqual({ id: playerId, deletedAt: expect.any(Date) });
    });
  });

  describe('softDeleteTournament', () => {
    it('should soft delete a tournament by id', async () => {
      const tournamentId = 'tournament-123';
      mockPrisma.tournament.update.mockResolvedValue({ id: tournamentId, deletedAt: new Date() });

      const result = await softDeleteUtils.softDeleteTournament(tournamentId);

      expect(mockPrisma.tournament.update).toHaveBeenCalledWith({
        where: { id: tournamentId },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result).toEqual({ id: tournamentId, deletedAt: expect.any(Date) });
    });
  });

  describe('getPlayers', () => {
    it('should get players with deletedAt filter', async () => {
      const options = { where: { name: 'John' } };
      mockPrisma.player.findMany.mockResolvedValue([]);

      await softDeleteUtils.getPlayers(options as unknown as { where: { name: string } });

      expect(mockPrisma.player.findMany).toHaveBeenCalledWith({
        ...options,
        where: {
          ...options.where,
          deletedAt: null,
        },
      });
    });

    it('should get players with default empty options', async () => {
      mockPrisma.player.findMany.mockResolvedValue([]);

      await softDeleteUtils.getPlayers();

      expect(mockPrisma.player.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
        },
      });
    });
  });

  describe('getTournaments', () => {
    it('should get tournaments with deletedAt filter', async () => {
      const options = { where: { name: 'Tournament 1' } };
      mockPrisma.tournament.findMany.mockResolvedValue([]);

      await softDeleteUtils.getTournaments(options as unknown as { where: { name: string } });

      expect(mockPrisma.tournament.findMany).toHaveBeenCalledWith({
        ...options,
        where: {
          ...options.where,
          deletedAt: null,
        },
      });
    });

    it('should get tournaments with default empty options', async () => {
      mockPrisma.tournament.findMany.mockResolvedValue([]);

      await softDeleteUtils.getTournaments();

      expect(mockPrisma.tournament.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
        },
      });
    });
  });

  describe('restorePlayer', () => {
    it('should restore a deleted player', async () => {
      const playerId = 'player-123';
      mockPrisma.player.update.mockResolvedValue({ id: playerId, deletedAt: null });

      const result = await softDeleteUtils.restorePlayer(playerId);

      expect(mockPrisma.player.update).toHaveBeenCalledWith({
        where: { id: playerId },
        data: { deletedAt: null },
      });
      expect(result).toEqual({ id: playerId, deletedAt: null });
    });
  });

  describe('restoreTournament', () => {
    it('should restore a deleted tournament', async () => {
      const tournamentId = 'tournament-123';
      mockPrisma.tournament.update.mockResolvedValue({ id: tournamentId, deletedAt: null });

      const result = await softDeleteUtils.restoreTournament(tournamentId);

      expect(mockPrisma.tournament.update).toHaveBeenCalledWith({
        where: { id: tournamentId },
        data: { deletedAt: null },
      });
      expect(result).toEqual({ id: tournamentId, deletedAt: null });
    });
  });

  describe('getPlayersWithDeleted', () => {
    it('should get players including deleted records', async () => {
      const options = { where: { name: 'John' } };
      mockPrisma.player.findMany.mockResolvedValue([]);

      await softDeleteUtils.getPlayersWithDeleted(options as unknown as { where: { name: string } });

      expect(mockPrisma.player.findMany).toHaveBeenCalledWith(options);
    });

    it('should get players with deleted with default empty options', async () => {
      mockPrisma.player.findMany.mockResolvedValue([]);

      await softDeleteUtils.getPlayersWithDeleted();

      expect(mockPrisma.player.findMany).toHaveBeenCalledWith({});
    });
  });

  describe('getTournamentsWithDeleted', () => {
    it('should get tournaments including deleted records', async () => {
      const options = { where: { name: 'Tournament 1' } };
      mockPrisma.tournament.findMany.mockResolvedValue([]);

      await softDeleteUtils.getTournamentsWithDeleted(options as unknown as { where: { name: string } });

      expect(mockPrisma.tournament.findMany).toHaveBeenCalledWith(options);
    });

    it('should get tournaments with deleted with default empty options', async () => {
      mockPrisma.tournament.findMany.mockResolvedValue([]);

      await softDeleteUtils.getTournamentsWithDeleted();

      expect(mockPrisma.tournament.findMany).toHaveBeenCalledWith({});
    });
  });

  describe('findPlayerWithDeleted', () => {
    it('should find a unique player including deleted records', async () => {
      const playerId = 'player-123';
      mockPrisma.player.findUnique.mockResolvedValue({ id: playerId });

      await softDeleteUtils.findPlayerWithDeleted(playerId);

      expect(mockPrisma.player.findUnique).toHaveBeenCalledWith({
        where: { id: playerId },
      });
    });
  });

  describe('findTournamentWithDeleted', () => {
    it('should find a unique tournament including deleted records', async () => {
      const tournamentId = 'tournament-123';
      mockPrisma.tournament.findUnique.mockResolvedValue({ id: tournamentId });

      await softDeleteUtils.findTournamentWithDeleted(tournamentId);

      expect(mockPrisma.tournament.findUnique).toHaveBeenCalledWith({
        where: { id: tournamentId },
      });
    });

    it('should find a unique tournament with options including deleted records', async () => {
      const tournamentId = 'tournament-123';
      const options = { select: { id: true, name: true } };
      mockPrisma.tournament.findUnique.mockResolvedValue({ id: tournamentId });

      await softDeleteUtils.findTournamentWithDeleted(tournamentId, options as unknown as { select: { id: boolean; name: boolean } });

      expect(mockPrisma.tournament.findUnique).toHaveBeenCalledWith({
        where: { id: tournamentId },
        ...options,
      });
    });

    it('should find a unique tournament with default empty options', async () => {
      const tournamentId = 'tournament-123';
      mockPrisma.tournament.findUnique.mockResolvedValue({ id: tournamentId });

      await softDeleteUtils.findTournamentWithDeleted(tournamentId);

      expect(mockPrisma.tournament.findUnique).toHaveBeenCalledWith({
        where: { id: tournamentId },
      });
    });
  });

  describe('Error handling', () => {
    it('should propagate errors from prisma.update in softDeletePlayer', async () => {
      const playerId = 'player-123';
      mockPrisma.player.update.mockRejectedValue(new Error('Database error'));

      await expect(softDeleteUtils.softDeletePlayer(playerId)).rejects.toThrow('Database error');
    });

    it('should propagate errors from prisma.update in softDeleteTournament', async () => {
      const tournamentId = 'tournament-123';
      mockPrisma.tournament.update.mockRejectedValue(new Error('Database error'));

      await expect(softDeleteUtils.softDeleteTournament(tournamentId)).rejects.toThrow('Database error');
    });

    it('should propagate errors from prisma.update in restorePlayer', async () => {
      const playerId = 'player-123';
      mockPrisma.player.update.mockRejectedValue(new Error('Database error'));

      await expect(softDeleteUtils.restorePlayer(playerId)).rejects.toThrow('Database error');
    });

    it('should propagate errors from prisma.update in restoreTournament', async () => {
      const tournamentId = 'tournament-123';
      mockPrisma.tournament.update.mockRejectedValue(new Error('Database error'));

      await expect(softDeleteUtils.restoreTournament(tournamentId)).rejects.toThrow('Database error');
    });

    it('should propagate errors from prisma.findMany in getPlayers', async () => {
      mockPrisma.player.findMany.mockRejectedValue(new Error('Database error'));

      await expect(softDeleteUtils.getPlayers()).rejects.toThrow('Database error');
    });

    it('should propagate errors from prisma.findMany in getTournaments', async () => {
      mockPrisma.tournament.findMany.mockRejectedValue(new Error('Database error'));

      await expect(softDeleteUtils.getTournaments()).rejects.toThrow('Database error');
    });

    it('should propagate errors from prisma.findMany in getPlayersWithDeleted', async () => {
      mockPrisma.player.findMany.mockRejectedValue(new Error('Database error'));

      await expect(softDeleteUtils.getPlayersWithDeleted()).rejects.toThrow('Database error');
    });

    it('should propagate errors from prisma.findMany in getTournamentsWithDeleted', async () => {
      mockPrisma.tournament.findMany.mockRejectedValue(new Error('Database error'));

      await expect(softDeleteUtils.getTournamentsWithDeleted()).rejects.toThrow('Database error');
    });

    it('should propagate errors from prisma.findUnique in findPlayerWithDeleted', async () => {
      mockPrisma.player.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(softDeleteUtils.findPlayerWithDeleted('player-123')).rejects.toThrow('Database error');
    });

    it('should propagate errors from prisma.findUnique in findTournamentWithDeleted', async () => {
      mockPrisma.tournament.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(softDeleteUtils.findTournamentWithDeleted('tournament-123')).rejects.toThrow('Database error');
    });
  });

  describe('Edge cases', () => {
    it('should handle getPlayers with undefined options', async () => {
      mockPrisma.player.findMany.mockResolvedValue([]);

      await softDeleteUtils.getPlayers(undefined as unknown as { where: { name: string } });

      expect(mockPrisma.player.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
    });

    it('should handle getTournaments with undefined options', async () => {
      mockPrisma.tournament.findMany.mockResolvedValue([]);

      await softDeleteUtils.getTournaments(undefined as unknown as { where: { name: string } });

      expect(mockPrisma.tournament.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
    });

    it('should handle getPlayersWithDeleted with undefined options', async () => {
      mockPrisma.player.findMany.mockResolvedValue([]);

      await softDeleteUtils.getPlayersWithDeleted(undefined as unknown as { where: { name: string } });

      expect(mockPrisma.player.findMany).toHaveBeenCalledWith({});
    });

    it('should handle getTournamentsWithDeleted with undefined options', async () => {
      mockPrisma.tournament.findMany.mockResolvedValue([]);

      await softDeleteUtils.getTournamentsWithDeleted(undefined as unknown as { where: { name: string } });

      expect(mockPrisma.tournament.findMany).toHaveBeenCalledWith({});
    });

    it('should handle findTournamentWithDeleted with undefined options', async () => {
      const tournamentId = 'tournament-123';
      mockPrisma.tournament.findUnique.mockResolvedValue({ id: tournamentId });

      await softDeleteUtils.findTournamentWithDeleted(tournamentId, undefined as unknown as { select: { id: boolean } });

      expect(mockPrisma.tournament.findUnique).toHaveBeenCalledWith({
        where: { id: tournamentId },
      });
    });
  });
});

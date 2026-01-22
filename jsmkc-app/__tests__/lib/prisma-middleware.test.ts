// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly
import { SoftDeleteManager, getSoftDeleteManager, applySoftDeleteMiddleware } from '@/lib/prisma-middleware';

describe('SoftDeleteManager', () => {
  let mockPrisma: { [key: string]: unknown };
  let softDeleteManager: SoftDeleteManager;

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
      bMMatch: {
        update: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      mRMatch: {
        update: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      gPMatch: {
        update: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      tTEntry: {
        update: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      bMQualification: {
        update: jest.fn(),
        findMany: jest.fn(),
      },
      mRQualification: {
        update: jest.fn(),
        findMany: jest.fn(),
      },
      gPQualification: {
        update: jest.fn(),
        findMany: jest.fn(),
      },
    };

    softDeleteManager = new SoftDeleteManager(mockPrisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Player operations', () => {
    describe('softDeletePlayer', () => {
      it('should soft delete a player by id', async () => {
        const playerId = 'player-123';
        mockPrisma.player.update.mockResolvedValue({ id: playerId, deletedAt: new Date() });

        await softDeleteManager.softDeletePlayer(playerId);

        expect(mockPrisma.player.update).toHaveBeenCalledWith({
          where: { id: playerId },
          data: { deletedAt: expect.any(Date) },
        });
      });

      it('should throw error when update fails', async () => {
        const playerId = 'player-123';
        mockPrisma.player.update.mockRejectedValue(new Error('Database error'));

        await expect(softDeleteManager.softDeletePlayer(playerId)).rejects.toThrow('Database error');
      });
    });

    describe('findPlayers', () => {
      it('should find players with soft delete filter by default', async () => {
        const options = { where: { name: 'Test' } };
        mockPrisma.player.findMany.mockResolvedValue([]);

        await softDeleteManager.findPlayers(options);

        expect(mockPrisma.player.findMany).toHaveBeenCalledWith({
          ...options,
          where: { ...options.where, deletedAt: null },
        });
      });

      it('should find players including deleted when includeDeleted is true', async () => {
        const options = { where: { name: 'Test' } };
        mockPrisma.player.findMany.mockResolvedValue([]);

        await softDeleteManager.findPlayers(options, true);

        expect(mockPrisma.player.findMany).toHaveBeenCalledWith({
          ...options,
          where: options.where,
        });
      });

      it('should handle empty options', async () => {
        mockPrisma.player.findMany.mockResolvedValue([]);

        await softDeleteManager.findPlayers();

        expect(mockPrisma.player.findMany).toHaveBeenCalledWith({
          where: { deletedAt: null },
        });
      });
    });

    describe('findPlayer', () => {
      it('should find unique player with soft delete filter by default', async () => {
        const playerId = 'player-123';
        const options = { select: { id: true } };
        mockPrisma.player.findUnique.mockResolvedValue(null);

        await softDeleteManager.findPlayer(playerId, options);

        expect(mockPrisma.player.findUnique).toHaveBeenCalledWith({
          ...options,
          where: { id: playerId, deletedAt: null },
        });
      });

      it('should find unique player including deleted when includeDeleted is true', async () => {
        const playerId = 'player-123';
        const options = { select: { id: true } };
        mockPrisma.player.findUnique.mockResolvedValue(null);

        await softDeleteManager.findPlayer(playerId, options, true);

        expect(mockPrisma.player.findUnique).toHaveBeenCalledWith({
          ...options,
          where: { id: playerId },
        });
      });

      it('should handle empty options', async () => {
        const playerId = 'player-123';
        mockPrisma.player.findUnique.mockResolvedValue(null);

        await softDeleteManager.findPlayer(playerId);

        expect(mockPrisma.player.findUnique).toHaveBeenCalledWith({
          where: { id: playerId, deletedAt: null },
        });
      });
    });

    describe('restorePlayer', () => {
      it('should restore a deleted player', async () => {
        const playerId = 'player-123';
        mockPrisma.player.update.mockResolvedValue({ id: playerId, deletedAt: null });

        await softDeleteManager.restorePlayer(playerId);

        expect(mockPrisma.player.update).toHaveBeenCalledWith({
          where: { id: playerId },
          data: { deletedAt: null },
        });
      });
    });
  });

  describe('Tournament operations', () => {
    describe('softDeleteTournament', () => {
      it('should soft delete a tournament by id', async () => {
        const tournamentId = 'tournament-123';
        mockPrisma.tournament.update.mockResolvedValue({ id: tournamentId, deletedAt: new Date() });

        await softDeleteManager.softDeleteTournament(tournamentId);

        expect(mockPrisma.tournament.update).toHaveBeenCalledWith({
          where: { id: tournamentId },
          data: { deletedAt: expect.any(Date) },
        });
      });
    });

    describe('findTournaments', () => {
      it('should find tournaments with soft delete filter by default', async () => {
        const options = { where: { name: 'Test Tournament' } };
        mockPrisma.tournament.findMany.mockResolvedValue([]);

        await softDeleteManager.findTournaments(options);

        expect(mockPrisma.tournament.findMany).toHaveBeenCalledWith({
          ...options,
          where: { ...options.where, deletedAt: null },
        });
      });

      it('should find tournaments including deleted when includeDeleted is true', async () => {
        const options = { where: { name: 'Test Tournament' } };
        mockPrisma.tournament.findMany.mockResolvedValue([]);

        await softDeleteManager.findTournaments(options, true);

        expect(mockPrisma.tournament.findMany).toHaveBeenCalledWith({
          ...options,
          where: options.where,
        });
      });
    });

    describe('findTournament', () => {
      it('should find unique tournament with soft delete filter by default', async () => {
        const tournamentId = 'tournament-123';
        const options = { select: { id: true } };
        mockPrisma.tournament.findUnique.mockResolvedValue(null);

        await softDeleteManager.findTournament(tournamentId, options);

        expect(mockPrisma.tournament.findUnique).toHaveBeenCalledWith({
          ...options,
          where: { id: tournamentId, deletedAt: null },
        });
      });

      it('should find unique tournament including deleted when includeDeleted is true', async () => {
        const tournamentId = 'tournament-123';
        const options = { select: { id: true } };
        mockPrisma.tournament.findUnique.mockResolvedValue(null);

        await softDeleteManager.findTournament(tournamentId, options, true);

        expect(mockPrisma.tournament.findUnique).toHaveBeenCalledWith({
          ...options,
          where: { id: tournamentId },
        });
      });
    });

    describe('restoreTournament', () => {
      it('should restore a deleted tournament', async () => {
        const tournamentId = 'tournament-123';
        mockPrisma.tournament.update.mockResolvedValue({ id: tournamentId, deletedAt: null });

        await softDeleteManager.restoreTournament(tournamentId);

        expect(mockPrisma.tournament.update).toHaveBeenCalledWith({
          where: { id: tournamentId },
          data: { deletedAt: null },
        });
      });
    });
  });

  describe('BMMatch operations', () => {
    describe('softDeleteBMMatch', () => {
      it('should soft delete a BMMatch by id', async () => {
        const matchId = 'bm-match-123';
        mockPrisma.bMMatch.update.mockResolvedValue({ id: matchId, deletedAt: new Date() });

        await softDeleteManager.softDeleteBMMatch(matchId);

        expect(mockPrisma.bMMatch.update).toHaveBeenCalledWith({
          where: { id: matchId },
          data: { deletedAt: expect.any(Date) },
        });
      });
    });

    describe('findBMMatches', () => {
      it('should find BMMatches with soft delete filter by default', async () => {
        const options = { where: { tournamentId: 'tournament-123' } };
        mockPrisma.bMMatch.findMany.mockResolvedValue([]);

        await softDeleteManager.findBMMatches(options);

        expect(mockPrisma.bMMatch.findMany).toHaveBeenCalledWith({
          ...options,
          where: { ...options.where, deletedAt: null },
        });
      });

      it('should find BMMatches including deleted when includeDeleted is true', async () => {
        const options = { where: { tournamentId: 'tournament-123' } };
        mockPrisma.bMMatch.findMany.mockResolvedValue([]);

        await softDeleteManager.findBMMatches(options, true);

        expect(mockPrisma.bMMatch.findMany).toHaveBeenCalledWith({
          ...options,
          where: options.where,
        });
      });
    });

    describe('findBMMatch', () => {
      it('should find unique BMMatch with soft delete filter by default', async () => {
        const matchId = 'bm-match-123';
        mockPrisma.bMMatch.findUnique.mockResolvedValue(null);

        await softDeleteManager.findBMMatch(matchId);

        expect(mockPrisma.bMMatch.findUnique).toHaveBeenCalledWith({
          where: { id: matchId, deletedAt: null },
        });
      });

      it('should find unique BMMatch including deleted when includeDeleted is true', async () => {
        const matchId = 'bm-match-123';
        mockPrisma.bMMatch.findUnique.mockResolvedValue(null);

        await softDeleteManager.findBMMatch(matchId, {}, true);

        expect(mockPrisma.bMMatch.findUnique).toHaveBeenCalledWith({
          where: { id: matchId },
        });
      });
    });

    describe('restoreBMMatch', () => {
      it('should restore a deleted BMMatch', async () => {
        const matchId = 'bm-match-123';
        mockPrisma.bMMatch.update.mockResolvedValue({ id: matchId, deletedAt: null });

        await softDeleteManager.restoreBMMatch(matchId);

        expect(mockPrisma.bMMatch.update).toHaveBeenCalledWith({
          where: { id: matchId },
          data: { deletedAt: null },
        });
      });
    });
  });

  describe('MRMatch operations', () => {
    describe('softDeleteMRMatch', () => {
      it('should soft delete an MRMatch by id', async () => {
        const matchId = 'mr-match-123';
        mockPrisma.mRMatch.update.mockResolvedValue({ id: matchId, deletedAt: new Date() });

        await softDeleteManager.softDeleteMRMatch(matchId);

        expect(mockPrisma.mRMatch.update).toHaveBeenCalledWith({
          where: { id: matchId },
          data: { deletedAt: expect.any(Date) },
        });
      });
    });

    describe('findMRMatches', () => {
      it('should find MRMatches with soft delete filter by default', async () => {
        const options = { where: { tournamentId: 'tournament-123' } };
        mockPrisma.mRMatch.findMany.mockResolvedValue([]);

        await softDeleteManager.findMRMatches(options);

        expect(mockPrisma.mRMatch.findMany).toHaveBeenCalledWith({
          ...options,
          where: { ...options.where, deletedAt: null },
        });
      });

      it('should find MRMatches including deleted when includeDeleted is true', async () => {
        const options = { where: { tournamentId: 'tournament-123' } };
        mockPrisma.mRMatch.findMany.mockResolvedValue([]);

        await softDeleteManager.findMRMatches(options, true);

        expect(mockPrisma.mRMatch.findMany).toHaveBeenCalledWith({
          ...options,
          where: options.where,
        });
      });
    });

    describe('findMRMatch', () => {
      it('should find unique MRMatch with soft delete filter by default', async () => {
        const matchId = 'mr-match-123';
        mockPrisma.mRMatch.findUnique.mockResolvedValue(null);

        await softDeleteManager.findMRMatch(matchId);

        expect(mockPrisma.mRMatch.findUnique).toHaveBeenCalledWith({
          where: { id: matchId, deletedAt: null },
        });
      });

      it('should find unique MRMatch including deleted when includeDeleted is true', async () => {
        const matchId = 'mr-match-123';
        mockPrisma.mRMatch.findUnique.mockResolvedValue(null);

        await softDeleteManager.findMRMatch(matchId, {}, true);

        expect(mockPrisma.mRMatch.findUnique).toHaveBeenCalledWith({
          where: { id: matchId },
        });
      });
    });

    describe('restoreMRMatch', () => {
      it('should restore a deleted MRMatch', async () => {
        const matchId = 'mr-match-123';
        mockPrisma.mRMatch.update.mockResolvedValue({ id: matchId, deletedAt: null });

        await softDeleteManager.restoreMRMatch(matchId);

        expect(mockPrisma.mRMatch.update).toHaveBeenCalledWith({
          where: { id: matchId },
          data: { deletedAt: null },
        });
      });
    });
  });

  describe('GPMatch operations', () => {
    describe('softDeleteGPMatch', () => {
      it('should soft delete a GPMatch by id', async () => {
        const matchId = 'gp-match-123';
        mockPrisma.gPMatch.update.mockResolvedValue({ id: matchId, deletedAt: new Date() });

        await softDeleteManager.softDeleteGPMatch(matchId);

        expect(mockPrisma.gPMatch.update).toHaveBeenCalledWith({
          where: { id: matchId },
          data: { deletedAt: expect.any(Date) },
        });
      });
    });

    describe('findGPMatches', () => {
      it('should find GPMatches with soft delete filter by default', async () => {
        const options = { where: { tournamentId: 'tournament-123' } };
        mockPrisma.gPMatch.findMany.mockResolvedValue([]);

        await softDeleteManager.findGPMatches(options);

        expect(mockPrisma.gPMatch.findMany).toHaveBeenCalledWith({
          ...options,
          where: { ...options.where, deletedAt: null },
        });
      });

      it('should find GPMatches including deleted when includeDeleted is true', async () => {
        const options = { where: { tournamentId: 'tournament-123' } };
        mockPrisma.gPMatch.findMany.mockResolvedValue([]);

        await softDeleteManager.findGPMatches(options, true);

        expect(mockPrisma.gPMatch.findMany).toHaveBeenCalledWith({
          ...options,
          where: options.where,
        });
      });
    });

    describe('findGPMatch', () => {
      it('should find unique GPMatch with soft delete filter by default', async () => {
        const matchId = 'gp-match-123';
        mockPrisma.gPMatch.findUnique.mockResolvedValue(null);

        await softDeleteManager.findGPMatch(matchId);

        expect(mockPrisma.gPMatch.findUnique).toHaveBeenCalledWith({
          where: { id: matchId, deletedAt: null },
        });
      });

      it('should find unique GPMatch including deleted when includeDeleted is true', async () => {
        const matchId = 'gp-match-123';
        mockPrisma.gPMatch.findUnique.mockResolvedValue(null);

        await softDeleteManager.findGPMatch(matchId, {}, true);

        expect(mockPrisma.gPMatch.findUnique).toHaveBeenCalledWith({
          where: { id: matchId },
        });
      });
    });

    describe('restoreGPMatch', () => {
      it('should restore a deleted GPMatch', async () => {
        const matchId = 'gp-match-123';
        mockPrisma.gPMatch.update.mockResolvedValue({ id: matchId, deletedAt: null });

        await softDeleteManager.restoreGPMatch(matchId);

        expect(mockPrisma.gPMatch.update).toHaveBeenCalledWith({
          where: { id: matchId },
          data: { deletedAt: null },
        });
      });
    });
  });

  describe('TTEntry operations', () => {
    describe('softDeleteTTEntry', () => {
      it('should soft delete a TTEntry by id', async () => {
        const entryId = 'tt-entry-123';
        mockPrisma.tTEntry.update.mockResolvedValue({ id: entryId, deletedAt: new Date() });

        await softDeleteManager.softDeleteTTEntry(entryId);

        expect(mockPrisma.tTEntry.update).toHaveBeenCalledWith({
          where: { id: entryId },
          data: { deletedAt: expect.any(Date) },
        });
      });
    });

    describe('findTTEntries', () => {
      it('should find TTEntries with soft delete filter by default', async () => {
        const options = { where: { tournamentId: 'tournament-123' } };
        mockPrisma.tTEntry.findMany.mockResolvedValue([]);

        await softDeleteManager.findTTEntries(options);

        expect(mockPrisma.tTEntry.findMany).toHaveBeenCalledWith({
          ...options,
          where: { ...options.where, deletedAt: null },
        });
      });

      it('should find TTEntries including deleted when includeDeleted is true', async () => {
        const options = { where: { tournamentId: 'tournament-123' } };
        mockPrisma.tTEntry.findMany.mockResolvedValue([]);

        await softDeleteManager.findTTEntries(options, true);

        expect(mockPrisma.tTEntry.findMany).toHaveBeenCalledWith({
          ...options,
          where: options.where,
        });
      });
    });

    describe('findTTEntry', () => {
      it('should find unique TTEntry with soft delete filter by default', async () => {
        const entryId = 'tt-entry-123';
        mockPrisma.tTEntry.findUnique.mockResolvedValue(null);

        await softDeleteManager.findTTEntry(entryId);

        expect(mockPrisma.tTEntry.findUnique).toHaveBeenCalledWith({
          where: { id: entryId, deletedAt: null },
        });
      });

      it('should find unique TTEntry including deleted when includeDeleted is true', async () => {
        const entryId = 'tt-entry-123';
        mockPrisma.tTEntry.findUnique.mockResolvedValue(null);

        await softDeleteManager.findTTEntry(entryId, {}, true);

        expect(mockPrisma.tTEntry.findUnique).toHaveBeenCalledWith({
          where: { id: entryId },
        });
      });
    });

    describe('restoreTTEntry', () => {
      it('should restore a deleted TTEntry', async () => {
        const entryId = 'tt-entry-123';
        mockPrisma.tTEntry.update.mockResolvedValue({ id: entryId, deletedAt: null });

        await softDeleteManager.restoreTTEntry(entryId);

        expect(mockPrisma.tTEntry.update).toHaveBeenCalledWith({
          where: { id: entryId },
          data: { deletedAt: null },
        });
      });
    });
  });

  describe('BMQualification operations', () => {
    describe('softDeleteBMQualification', () => {
      it('should soft delete a BMQualification by id', async () => {
        const qualId = 'bm-qual-123';
        mockPrisma.bMQualification.update.mockResolvedValue({ id: qualId, deletedAt: new Date() });

        await softDeleteManager.softDeleteBMQualification(qualId);

        expect(mockPrisma.bMQualification.update).toHaveBeenCalledWith({
          where: { id: qualId },
          data: { deletedAt: expect.any(Date) },
        });
      });
    });

    describe('findBMQualifications', () => {
      it('should find BMQualifications with soft delete filter by default', async () => {
        const options = { where: { tournamentId: 'tournament-123' } };
        mockPrisma.bMQualification.findMany.mockResolvedValue([]);

        await softDeleteManager.findBMQualifications(options);

        expect(mockPrisma.bMQualification.findMany).toHaveBeenCalledWith({
          ...options,
          where: { ...options.where, deletedAt: null },
        });
      });

      it('should find BMQualifications including deleted when includeDeleted is true', async () => {
        const options = { where: { tournamentId: 'tournament-123' } };
        mockPrisma.bMQualification.findMany.mockResolvedValue([]);

        await softDeleteManager.findBMQualifications(options, true);

        expect(mockPrisma.bMQualification.findMany).toHaveBeenCalledWith({
          ...options,
          where: options.where,
        });
      });
    });
  });

  describe('MRQualification operations', () => {
    describe('softDeleteMRQualification', () => {
      it('should soft delete an MRQualification by id', async () => {
        const qualId = 'mr-qual-123';
        mockPrisma.mRQualification.update.mockResolvedValue({ id: qualId, deletedAt: new Date() });

        await softDeleteManager.softDeleteMRQualification(qualId);

        expect(mockPrisma.mRQualification.update).toHaveBeenCalledWith({
          where: { id: qualId },
          data: { deletedAt: expect.any(Date) },
        });
      });
    });

    describe('findMRQualifications', () => {
      it('should find MRQualifications with soft delete filter by default', async () => {
        const options = { where: { tournamentId: 'tournament-123' } };
        mockPrisma.mRQualification.findMany.mockResolvedValue([]);

        await softDeleteManager.findMRQualifications(options);

        expect(mockPrisma.mRQualification.findMany).toHaveBeenCalledWith({
          ...options,
          where: { ...options.where, deletedAt: null },
        });
      });

      it('should find MRQualifications including deleted when includeDeleted is true', async () => {
        const options = { where: { tournamentId: 'tournament-123' } };
        mockPrisma.mRQualification.findMany.mockResolvedValue([]);

        await softDeleteManager.findMRQualifications(options, true);

        expect(mockPrisma.mRQualification.findMany).toHaveBeenCalledWith({
          ...options,
          where: options.where,
        });
      });
    });
  });

  describe('GPQualification operations', () => {
    describe('softDeleteGPQualification', () => {
      it('should soft delete a GPQualification by id', async () => {
        const qualId = 'gp-qual-123';
        mockPrisma.gPQualification.update.mockResolvedValue({ id: qualId, deletedAt: new Date() });

        await softDeleteManager.softDeleteGPQualification(qualId);

        expect(mockPrisma.gPQualification.update).toHaveBeenCalledWith({
          where: { id: qualId },
          data: { deletedAt: expect.any(Date) },
        });
      });
    });

    describe('findGPQualifications', () => {
      it('should find GPQualifications with soft delete filter by default', async () => {
        const options = { where: { tournamentId: 'tournament-123' } };
        mockPrisma.gPQualification.findMany.mockResolvedValue([]);

        await softDeleteManager.findGPQualifications(options);

        expect(mockPrisma.gPQualification.findMany).toHaveBeenCalledWith({
          ...options,
          where: { ...options.where, deletedAt: null },
        });
      });

      it('should find GPQualifications including deleted when includeDeleted is true', async () => {
        const options = { where: { tournamentId: 'tournament-123' } };
        mockPrisma.gPQualification.findMany.mockResolvedValue([]);

        await softDeleteManager.findGPQualifications(options, true);

        expect(mockPrisma.gPQualification.findMany).toHaveBeenCalledWith({
          ...options,
          where: options.where,
        });
      });
    });
  });
});

describe('getSoftDeleteManager', () => {
  let mockPrisma1: { [key: string]: unknown };
  let mockPrisma2: { [key: string]: unknown };

  beforeEach(() => {
    mockPrisma1 = {};
    mockPrisma2 = {};
  });

  it('should return a SoftDeleteManager instance', () => {
    const manager = getSoftDeleteManager(mockPrisma1);
    expect(manager).toBeInstanceOf(SoftDeleteManager);
  });

  it('should return the same instance for the same prisma client', () => {
    const manager1 = getSoftDeleteManager(mockPrisma1);
    const manager2 = getSoftDeleteManager(mockPrisma1);

    expect(manager1).toBe(manager2);
  });

  it('should return a new instance for a different prisma client', () => {
    const manager1 = getSoftDeleteManager(mockPrisma1);
    const manager2 = getSoftDeleteManager(mockPrisma2);

    expect(manager1).not.toBe(manager2);
  });
});

describe('applySoftDeleteMiddleware', () => {
  it('should log a warning message', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    applySoftDeleteMiddleware();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Using SoftDeleteManager instead of middleware due to Prisma version limitations.'
    );

    consoleWarnSpy.mockRestore();
  });
});

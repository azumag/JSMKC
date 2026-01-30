/**
 * @module __tests__/lib/soft-delete.test.ts
 *
 * Test suite for the soft-delete manager and utilities (soft-delete.ts).
 *
 * Covers the following functionality:
 * - SoftDeleteManager class: Provides explicit soft delete, find, and restore
 *   operations for all JSMKC models that support the deletedAt field:
 *   - Player: softDeletePlayer, findPlayers, findPlayer, restorePlayer
 *   - Tournament: softDeleteTournament, findTournaments, findTournament, restoreTournament
 *   - BMMatch: softDeleteBMMatch, findBMMatches, findBMMatch, restoreBMMatch
 *   - MRMatch: softDeleteMRMatch, findMRMatches, findMRMatch, restoreMRMatch
 *   - GPMatch: softDeleteGPMatch, findGPMatches, findGPMatch, restoreGPMatch
 *   - TTEntry: softDeleteTTEntry, findTTEntries, findTTEntry, restoreTTEntry
 *   - BMQualification: softDeleteBMQualification, findBMQualifications
 *   - MRQualification: softDeleteMRQualification, findMRQualifications
 *   - GPQualification: softDeleteGPQualification, findGPQualifications
 * - getSoftDeleteManager(): Factory function returning singleton instance
 * - applySoftDeleteMiddleware(): Deprecated function that logs a warning
 */

import { PrismaClient } from '@prisma/client';

/**
 * Mock the logger module to prevent actual log output during tests
 * and to verify logging calls in applySoftDeleteMiddleware.
 */
jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

/**
 * Mock PrismaClient with all models used by SoftDeleteManager.
 * Each model needs update (for soft delete/restore), findMany (for find*s),
 * and findFirst (for find single by ID) methods.
 */
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    player: {
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    tournament: {
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    bMMatch: {
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    bMQualification: {
      update: jest.fn(),
      findMany: jest.fn(),
    },
    mRMatch: {
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    mRQualification: {
      update: jest.fn(),
      findMany: jest.fn(),
    },
    gPMatch: {
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    gPQualification: {
      update: jest.fn(),
      findMany: jest.fn(),
    },
    tTEntry: {
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

/**
 * Import the actual exports from soft-delete module after mocks are set up.
 * SoftDeleteManager is the main class, getSoftDeleteManager is the singleton
 * factory, and applySoftDeleteMiddleware is the deprecated function.
 */
import { SoftDeleteManager, getSoftDeleteManager, applySoftDeleteMiddleware } from '@/lib/soft-delete';

/**
 * Interface describing the shape of our mock PrismaClient.
 * Includes all models that SoftDeleteManager operates on.
 */
interface MockPrismaClient {
  player: {
    update: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  tournament: {
    update: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  bMMatch: {
    update: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  bMQualification: {
    update: jest.Mock;
    findMany: jest.Mock;
  };
  mRMatch: {
    update: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  mRQualification: {
    update: jest.Mock;
    findMany: jest.Mock;
  };
  gPMatch: {
    update: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  gPQualification: {
    update: jest.Mock;
    findMany: jest.Mock;
  };
  tTEntry: {
    update: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
}

describe('SoftDeleteManager', () => {
  let mockPrisma: MockPrismaClient;
  let manager: SoftDeleteManager;

  beforeEach(() => {
    /**
     * Create a fresh mock PrismaClient for each test to avoid
     * cross-test contamination of mock return values and call counts.
     */
    mockPrisma = {
      player: {
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      tournament: {
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      bMMatch: {
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      bMQualification: {
        update: jest.fn(),
        findMany: jest.fn(),
      },
      mRMatch: {
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      mRQualification: {
        update: jest.fn(),
        findMany: jest.fn(),
      },
      gPMatch: {
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      gPQualification: {
        update: jest.fn(),
        findMany: jest.fn(),
      },
      tTEntry: {
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    // Instantiate the manager with our mock PrismaClient
    manager = new SoftDeleteManager(mockPrisma as unknown as PrismaClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // Player Operations
  // ============================================================

  describe('softDeletePlayer', () => {
    it('should soft delete a player by setting deletedAt timestamp', async () => {
      const playerId = 'player-123';
      mockPrisma.player.update.mockResolvedValue({ id: playerId, deletedAt: new Date() });

      const result = await manager.softDeletePlayer(playerId);

      expect(mockPrisma.player.update).toHaveBeenCalledWith({
        where: { id: playerId },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result).toEqual({ id: playerId, deletedAt: expect.any(Date) });
    });
  });

  describe('findPlayers', () => {
    it('should find players excluding soft-deleted by default', async () => {
      mockPrisma.player.findMany.mockResolvedValue([]);

      await manager.findPlayers({ name: 'John' });

      // When includeDeleted is false (default), deletedAt: null is added
      expect(mockPrisma.player.findMany).toHaveBeenCalledWith({
        where: {
          name: 'John',
          deletedAt: null,
        },
      });
    });

    it('should find players with default empty where clause', async () => {
      mockPrisma.player.findMany.mockResolvedValue([]);

      await manager.findPlayers();

      expect(mockPrisma.player.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
        },
      });
    });

    it('should include soft-deleted players when includeDeleted is true', async () => {
      mockPrisma.player.findMany.mockResolvedValue([]);

      await manager.findPlayers({ name: 'John' }, true);

      // When includeDeleted is true, deletedAt filter is NOT added
      expect(mockPrisma.player.findMany).toHaveBeenCalledWith({
        where: { name: 'John' },
      });
    });

    it('should include all players when includeDeleted is true with no where', async () => {
      mockPrisma.player.findMany.mockResolvedValue([]);

      await manager.findPlayers({}, true);

      expect(mockPrisma.player.findMany).toHaveBeenCalledWith({
        where: {},
      });
    });
  });

  describe('findPlayer', () => {
    it('should find a single player by ID excluding soft-deleted by default', async () => {
      const playerId = 'player-123';
      mockPrisma.player.findFirst.mockResolvedValue({ id: playerId });

      const result = await manager.findPlayer(playerId);

      expect(mockPrisma.player.findFirst).toHaveBeenCalledWith({
        where: { id: playerId, deletedAt: null },
      });
      expect(result).toEqual({ id: playerId });
    });

    it('should find a single player by ID including soft-deleted when requested', async () => {
      const playerId = 'player-123';
      mockPrisma.player.findFirst.mockResolvedValue({ id: playerId, deletedAt: new Date() });

      await manager.findPlayer(playerId, true);

      // When includeDeleted is true, no deletedAt filter is applied
      expect(mockPrisma.player.findFirst).toHaveBeenCalledWith({
        where: { id: playerId },
      });
    });
  });

  describe('restorePlayer', () => {
    it('should restore a soft-deleted player by clearing deletedAt', async () => {
      const playerId = 'player-123';
      mockPrisma.player.update.mockResolvedValue({ id: playerId, deletedAt: null });

      const result = await manager.restorePlayer(playerId);

      expect(mockPrisma.player.update).toHaveBeenCalledWith({
        where: { id: playerId },
        data: { deletedAt: null },
      });
      expect(result).toEqual({ id: playerId, deletedAt: null });
    });
  });

  // ============================================================
  // Tournament Operations
  // ============================================================

  describe('softDeleteTournament', () => {
    it('should soft delete a tournament by setting deletedAt timestamp', async () => {
      const tournamentId = 'tournament-123';
      mockPrisma.tournament.update.mockResolvedValue({ id: tournamentId, deletedAt: new Date() });

      const result = await manager.softDeleteTournament(tournamentId);

      expect(mockPrisma.tournament.update).toHaveBeenCalledWith({
        where: { id: tournamentId },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result).toEqual({ id: tournamentId, deletedAt: expect.any(Date) });
    });
  });

  describe('findTournaments', () => {
    it('should find tournaments excluding soft-deleted by default', async () => {
      mockPrisma.tournament.findMany.mockResolvedValue([]);

      await manager.findTournaments({ name: 'Tournament 1' });

      expect(mockPrisma.tournament.findMany).toHaveBeenCalledWith({
        where: {
          name: 'Tournament 1',
          deletedAt: null,
        },
      });
    });

    it('should find tournaments with default empty where clause', async () => {
      mockPrisma.tournament.findMany.mockResolvedValue([]);

      await manager.findTournaments();

      expect(mockPrisma.tournament.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
        },
      });
    });

    it('should include soft-deleted tournaments when includeDeleted is true', async () => {
      mockPrisma.tournament.findMany.mockResolvedValue([]);

      await manager.findTournaments({ name: 'Tournament 1' }, true);

      expect(mockPrisma.tournament.findMany).toHaveBeenCalledWith({
        where: { name: 'Tournament 1' },
      });
    });
  });

  describe('findTournament', () => {
    it('should find a single tournament by ID excluding soft-deleted by default', async () => {
      const tournamentId = 'tournament-123';
      mockPrisma.tournament.findFirst.mockResolvedValue({ id: tournamentId });

      const result = await manager.findTournament(tournamentId);

      expect(mockPrisma.tournament.findFirst).toHaveBeenCalledWith({
        where: { id: tournamentId, deletedAt: null },
      });
      expect(result).toEqual({ id: tournamentId });
    });

    it('should find a single tournament including soft-deleted when requested', async () => {
      const tournamentId = 'tournament-123';
      mockPrisma.tournament.findFirst.mockResolvedValue({ id: tournamentId });

      await manager.findTournament(tournamentId, true);

      expect(mockPrisma.tournament.findFirst).toHaveBeenCalledWith({
        where: { id: tournamentId },
      });
    });
  });

  describe('restoreTournament', () => {
    it('should restore a soft-deleted tournament by clearing deletedAt', async () => {
      const tournamentId = 'tournament-123';
      mockPrisma.tournament.update.mockResolvedValue({ id: tournamentId, deletedAt: null });

      const result = await manager.restoreTournament(tournamentId);

      expect(mockPrisma.tournament.update).toHaveBeenCalledWith({
        where: { id: tournamentId },
        data: { deletedAt: null },
      });
      expect(result).toEqual({ id: tournamentId, deletedAt: null });
    });
  });

  // ============================================================
  // Battle Mode (BM) Match Operations
  // ============================================================

  describe('softDeleteBMMatch', () => {
    it('should soft delete a BM match by setting deletedAt timestamp', async () => {
      const matchId = 'bm-match-123';
      mockPrisma.bMMatch.update.mockResolvedValue({ id: matchId, deletedAt: new Date() });

      const result = await manager.softDeleteBMMatch(matchId);

      expect(mockPrisma.bMMatch.update).toHaveBeenCalledWith({
        where: { id: matchId },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result).toEqual({ id: matchId, deletedAt: expect.any(Date) });
    });
  });

  describe('findBMMatches', () => {
    it('should find BM matches excluding soft-deleted by default', async () => {
      mockPrisma.bMMatch.findMany.mockResolvedValue([]);

      await manager.findBMMatches({ tournamentId: 't-1' });

      expect(mockPrisma.bMMatch.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't-1', deletedAt: null },
      });
    });

    it('should include soft-deleted BM matches when includeDeleted is true', async () => {
      mockPrisma.bMMatch.findMany.mockResolvedValue([]);

      await manager.findBMMatches({}, true);

      expect(mockPrisma.bMMatch.findMany).toHaveBeenCalledWith({
        where: {},
      });
    });
  });

  describe('findBMMatch', () => {
    it('should find a single BM match by ID excluding soft-deleted by default', async () => {
      const matchId = 'bm-match-123';
      mockPrisma.bMMatch.findFirst.mockResolvedValue({ id: matchId });

      await manager.findBMMatch(matchId);

      expect(mockPrisma.bMMatch.findFirst).toHaveBeenCalledWith({
        where: { id: matchId, deletedAt: null },
      });
    });

    it('should find a single BM match including soft-deleted when requested', async () => {
      const matchId = 'bm-match-123';
      mockPrisma.bMMatch.findFirst.mockResolvedValue({ id: matchId });

      await manager.findBMMatch(matchId, true);

      expect(mockPrisma.bMMatch.findFirst).toHaveBeenCalledWith({
        where: { id: matchId },
      });
    });
  });

  describe('restoreBMMatch', () => {
    it('should restore a soft-deleted BM match by clearing deletedAt', async () => {
      const matchId = 'bm-match-123';
      mockPrisma.bMMatch.update.mockResolvedValue({ id: matchId, deletedAt: null });

      const result = await manager.restoreBMMatch(matchId);

      expect(mockPrisma.bMMatch.update).toHaveBeenCalledWith({
        where: { id: matchId },
        data: { deletedAt: null },
      });
      expect(result).toEqual({ id: matchId, deletedAt: null });
    });
  });

  // ============================================================
  // Match Race (MR) Match Operations
  // ============================================================

  describe('softDeleteMRMatch', () => {
    it('should soft delete an MR match by setting deletedAt timestamp', async () => {
      const matchId = 'mr-match-123';
      mockPrisma.mRMatch.update.mockResolvedValue({ id: matchId, deletedAt: new Date() });

      const result = await manager.softDeleteMRMatch(matchId);

      expect(mockPrisma.mRMatch.update).toHaveBeenCalledWith({
        where: { id: matchId },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result).toEqual({ id: matchId, deletedAt: expect.any(Date) });
    });
  });

  describe('findMRMatches', () => {
    it('should find MR matches excluding soft-deleted by default', async () => {
      mockPrisma.mRMatch.findMany.mockResolvedValue([]);

      await manager.findMRMatches({ tournamentId: 't-1' });

      expect(mockPrisma.mRMatch.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't-1', deletedAt: null },
      });
    });

    it('should include soft-deleted MR matches when includeDeleted is true', async () => {
      mockPrisma.mRMatch.findMany.mockResolvedValue([]);

      await manager.findMRMatches({}, true);

      expect(mockPrisma.mRMatch.findMany).toHaveBeenCalledWith({
        where: {},
      });
    });
  });

  describe('findMRMatch', () => {
    it('should find a single MR match by ID excluding soft-deleted by default', async () => {
      const matchId = 'mr-match-123';
      mockPrisma.mRMatch.findFirst.mockResolvedValue({ id: matchId });

      await manager.findMRMatch(matchId);

      expect(mockPrisma.mRMatch.findFirst).toHaveBeenCalledWith({
        where: { id: matchId, deletedAt: null },
      });
    });
  });

  describe('restoreMRMatch', () => {
    it('should restore a soft-deleted MR match by clearing deletedAt', async () => {
      const matchId = 'mr-match-123';
      mockPrisma.mRMatch.update.mockResolvedValue({ id: matchId, deletedAt: null });

      const result = await manager.restoreMRMatch(matchId);

      expect(mockPrisma.mRMatch.update).toHaveBeenCalledWith({
        where: { id: matchId },
        data: { deletedAt: null },
      });
      expect(result).toEqual({ id: matchId, deletedAt: null });
    });
  });

  // ============================================================
  // Grand Prix (GP) Match Operations
  // ============================================================

  describe('softDeleteGPMatch', () => {
    it('should soft delete a GP match by setting deletedAt timestamp', async () => {
      const matchId = 'gp-match-123';
      mockPrisma.gPMatch.update.mockResolvedValue({ id: matchId, deletedAt: new Date() });

      const result = await manager.softDeleteGPMatch(matchId);

      expect(mockPrisma.gPMatch.update).toHaveBeenCalledWith({
        where: { id: matchId },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result).toEqual({ id: matchId, deletedAt: expect.any(Date) });
    });
  });

  describe('findGPMatches', () => {
    it('should find GP matches excluding soft-deleted by default', async () => {
      mockPrisma.gPMatch.findMany.mockResolvedValue([]);

      await manager.findGPMatches({ tournamentId: 't-1' });

      expect(mockPrisma.gPMatch.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't-1', deletedAt: null },
      });
    });

    it('should include soft-deleted GP matches when includeDeleted is true', async () => {
      mockPrisma.gPMatch.findMany.mockResolvedValue([]);

      await manager.findGPMatches({}, true);

      expect(mockPrisma.gPMatch.findMany).toHaveBeenCalledWith({
        where: {},
      });
    });
  });

  describe('findGPMatch', () => {
    it('should find a single GP match by ID excluding soft-deleted by default', async () => {
      const matchId = 'gp-match-123';
      mockPrisma.gPMatch.findFirst.mockResolvedValue({ id: matchId });

      await manager.findGPMatch(matchId);

      expect(mockPrisma.gPMatch.findFirst).toHaveBeenCalledWith({
        where: { id: matchId, deletedAt: null },
      });
    });
  });

  describe('restoreGPMatch', () => {
    it('should restore a soft-deleted GP match by clearing deletedAt', async () => {
      const matchId = 'gp-match-123';
      mockPrisma.gPMatch.update.mockResolvedValue({ id: matchId, deletedAt: null });

      const result = await manager.restoreGPMatch(matchId);

      expect(mockPrisma.gPMatch.update).toHaveBeenCalledWith({
        where: { id: matchId },
        data: { deletedAt: null },
      });
      expect(result).toEqual({ id: matchId, deletedAt: null });
    });
  });

  // ============================================================
  // Time Trial (TT) Entry Operations
  // ============================================================

  describe('softDeleteTTEntry', () => {
    it('should soft delete a TT entry by setting deletedAt timestamp', async () => {
      const entryId = 'tt-entry-123';
      mockPrisma.tTEntry.update.mockResolvedValue({ id: entryId, deletedAt: new Date() });

      const result = await manager.softDeleteTTEntry(entryId);

      expect(mockPrisma.tTEntry.update).toHaveBeenCalledWith({
        where: { id: entryId },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result).toEqual({ id: entryId, deletedAt: expect.any(Date) });
    });
  });

  describe('findTTEntries', () => {
    it('should find TT entries excluding soft-deleted by default', async () => {
      mockPrisma.tTEntry.findMany.mockResolvedValue([]);

      await manager.findTTEntries({ tournamentId: 't-1' });

      expect(mockPrisma.tTEntry.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't-1', deletedAt: null },
      });
    });

    it('should include soft-deleted TT entries when includeDeleted is true', async () => {
      mockPrisma.tTEntry.findMany.mockResolvedValue([]);

      await manager.findTTEntries({}, true);

      expect(mockPrisma.tTEntry.findMany).toHaveBeenCalledWith({
        where: {},
      });
    });
  });

  describe('findTTEntry', () => {
    it('should find a single TT entry by ID excluding soft-deleted by default', async () => {
      const entryId = 'tt-entry-123';
      mockPrisma.tTEntry.findFirst.mockResolvedValue({ id: entryId });

      await manager.findTTEntry(entryId);

      expect(mockPrisma.tTEntry.findFirst).toHaveBeenCalledWith({
        where: { id: entryId, deletedAt: null },
      });
    });
  });

  describe('restoreTTEntry', () => {
    it('should restore a soft-deleted TT entry by clearing deletedAt', async () => {
      const entryId = 'tt-entry-123';
      mockPrisma.tTEntry.update.mockResolvedValue({ id: entryId, deletedAt: null });

      const result = await manager.restoreTTEntry(entryId);

      expect(mockPrisma.tTEntry.update).toHaveBeenCalledWith({
        where: { id: entryId },
        data: { deletedAt: null },
      });
      expect(result).toEqual({ id: entryId, deletedAt: null });
    });
  });

  // ============================================================
  // Qualification Operations (BM, MR, GP)
  // ============================================================

  describe('softDeleteBMQualification', () => {
    it('should soft delete a BM qualification by setting deletedAt timestamp', async () => {
      const qualId = 'bm-qual-123';
      mockPrisma.bMQualification.update.mockResolvedValue({ id: qualId, deletedAt: new Date() });

      const result = await manager.softDeleteBMQualification(qualId);

      expect(mockPrisma.bMQualification.update).toHaveBeenCalledWith({
        where: { id: qualId },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result).toEqual({ id: qualId, deletedAt: expect.any(Date) });
    });
  });

  describe('findBMQualifications', () => {
    it('should find BM qualifications excluding soft-deleted by default', async () => {
      mockPrisma.bMQualification.findMany.mockResolvedValue([]);

      await manager.findBMQualifications({ tournamentId: 't-1' });

      expect(mockPrisma.bMQualification.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't-1', deletedAt: null },
      });
    });

    it('should include soft-deleted BM qualifications when includeDeleted is true', async () => {
      mockPrisma.bMQualification.findMany.mockResolvedValue([]);

      await manager.findBMQualifications({}, true);

      expect(mockPrisma.bMQualification.findMany).toHaveBeenCalledWith({
        where: {},
      });
    });
  });

  describe('softDeleteMRQualification', () => {
    it('should soft delete an MR qualification by setting deletedAt timestamp', async () => {
      const qualId = 'mr-qual-123';
      mockPrisma.mRQualification.update.mockResolvedValue({ id: qualId, deletedAt: new Date() });

      const result = await manager.softDeleteMRQualification(qualId);

      expect(mockPrisma.mRQualification.update).toHaveBeenCalledWith({
        where: { id: qualId },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result).toEqual({ id: qualId, deletedAt: expect.any(Date) });
    });
  });

  describe('findMRQualifications', () => {
    it('should find MR qualifications excluding soft-deleted by default', async () => {
      mockPrisma.mRQualification.findMany.mockResolvedValue([]);

      await manager.findMRQualifications({ tournamentId: 't-1' });

      expect(mockPrisma.mRQualification.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't-1', deletedAt: null },
      });
    });

    it('should include soft-deleted MR qualifications when includeDeleted is true', async () => {
      mockPrisma.mRQualification.findMany.mockResolvedValue([]);

      await manager.findMRQualifications({}, true);

      expect(mockPrisma.mRQualification.findMany).toHaveBeenCalledWith({
        where: {},
      });
    });
  });

  describe('softDeleteGPQualification', () => {
    it('should soft delete a GP qualification by setting deletedAt timestamp', async () => {
      const qualId = 'gp-qual-123';
      mockPrisma.gPQualification.update.mockResolvedValue({ id: qualId, deletedAt: new Date() });

      const result = await manager.softDeleteGPQualification(qualId);

      expect(mockPrisma.gPQualification.update).toHaveBeenCalledWith({
        where: { id: qualId },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result).toEqual({ id: qualId, deletedAt: expect.any(Date) });
    });
  });

  describe('findGPQualifications', () => {
    it('should find GP qualifications excluding soft-deleted by default', async () => {
      mockPrisma.gPQualification.findMany.mockResolvedValue([]);

      await manager.findGPQualifications({ tournamentId: 't-1' });

      expect(mockPrisma.gPQualification.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't-1', deletedAt: null },
      });
    });

    it('should include soft-deleted GP qualifications when includeDeleted is true', async () => {
      mockPrisma.gPQualification.findMany.mockResolvedValue([]);

      await manager.findGPQualifications({}, true);

      expect(mockPrisma.gPQualification.findMany).toHaveBeenCalledWith({
        where: {},
      });
    });
  });

  // ============================================================
  // Error Handling
  // ============================================================

  describe('Error handling', () => {
    it('should propagate errors from prisma.update in softDeletePlayer', async () => {
      mockPrisma.player.update.mockRejectedValue(new Error('Database error'));

      await expect(manager.softDeletePlayer('player-123')).rejects.toThrow('Database error');
    });

    it('should propagate errors from prisma.update in softDeleteTournament', async () => {
      mockPrisma.tournament.update.mockRejectedValue(new Error('Database error'));

      await expect(manager.softDeleteTournament('tournament-123')).rejects.toThrow('Database error');
    });

    it('should propagate errors from prisma.update in restorePlayer', async () => {
      mockPrisma.player.update.mockRejectedValue(new Error('Database error'));

      await expect(manager.restorePlayer('player-123')).rejects.toThrow('Database error');
    });

    it('should propagate errors from prisma.update in restoreTournament', async () => {
      mockPrisma.tournament.update.mockRejectedValue(new Error('Database error'));

      await expect(manager.restoreTournament('tournament-123')).rejects.toThrow('Database error');
    });

    it('should propagate errors from prisma.findMany in findPlayers', async () => {
      mockPrisma.player.findMany.mockRejectedValue(new Error('Database error'));

      await expect(manager.findPlayers()).rejects.toThrow('Database error');
    });

    it('should propagate errors from prisma.findMany in findTournaments', async () => {
      mockPrisma.tournament.findMany.mockRejectedValue(new Error('Database error'));

      await expect(manager.findTournaments()).rejects.toThrow('Database error');
    });

    it('should propagate errors from prisma.findFirst in findPlayer', async () => {
      mockPrisma.player.findFirst.mockRejectedValue(new Error('Database error'));

      await expect(manager.findPlayer('player-123')).rejects.toThrow('Database error');
    });

    it('should propagate errors from prisma.findFirst in findTournament', async () => {
      mockPrisma.tournament.findFirst.mockRejectedValue(new Error('Database error'));

      await expect(manager.findTournament('tournament-123')).rejects.toThrow('Database error');
    });

    it('should propagate errors from prisma.update in softDeleteBMMatch', async () => {
      mockPrisma.bMMatch.update.mockRejectedValue(new Error('Database error'));

      await expect(manager.softDeleteBMMatch('bm-match-123')).rejects.toThrow('Database error');
    });

    it('should propagate errors from prisma.update in softDeleteTTEntry', async () => {
      mockPrisma.tTEntry.update.mockRejectedValue(new Error('Database error'));

      await expect(manager.softDeleteTTEntry('tt-entry-123')).rejects.toThrow('Database error');
    });
  });
});

// ============================================================
// getSoftDeleteManager (Factory / Singleton)
// ============================================================

describe('getSoftDeleteManager', () => {
  it('should return a SoftDeleteManager instance', () => {
    const mockPrisma = new PrismaClient();
    const managerInstance = getSoftDeleteManager(mockPrisma);

    // The returned value should be an instance of SoftDeleteManager
    expect(managerInstance).toBeInstanceOf(SoftDeleteManager);
  });

  it('should return the same instance on subsequent calls (singleton)', () => {
    const mockPrisma = new PrismaClient();
    const first = getSoftDeleteManager(mockPrisma);
    const second = getSoftDeleteManager(mockPrisma);

    // Singleton pattern: both calls should return the same object reference
    expect(first).toBe(second);
  });
});

// ============================================================
// applySoftDeleteMiddleware (Deprecated)
// ============================================================

describe('applySoftDeleteMiddleware', () => {
  it('should log a deprecation warning when called', () => {
    const { createLogger } = jest.requireMock('@/lib/logger') as {
      createLogger: jest.Mock;
    };

    /**
     * Reset the createLogger mock to capture calls specifically from
     * applySoftDeleteMiddleware and verify the deprecation warning.
     */
    const mockWarn = jest.fn();
    createLogger.mockReturnValue({
      info: jest.fn(),
      warn: mockWarn,
      error: jest.fn(),
      debug: jest.fn(),
    });

    const mockPrisma = new PrismaClient();

    // Call the deprecated function
    applySoftDeleteMiddleware(mockPrisma);

    // Verify the deprecation warning logger was created with correct scope
    expect(createLogger).toHaveBeenCalledWith('soft-delete-middleware');

    // Verify the deprecation warning message was logged
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('applySoftDeleteMiddleware is deprecated')
    );
  });

  it('should not throw when called', () => {
    const mockPrisma = new PrismaClient();

    // The deprecated function should complete without errors
    expect(() => applySoftDeleteMiddleware(mockPrisma)).not.toThrow();
  });
});

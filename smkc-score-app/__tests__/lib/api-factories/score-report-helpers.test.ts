/**
 * @module __tests__/lib/api-factories/score-report-helpers.test.ts
 *
 * Test suite for score report shared helpers from `@/lib/api-factories/score-report-helpers`.
 *
 * This suite validates the reusable helper functions that encapsulate common sub-patterns
 * shared across the BM, MR, and GP score report API routes. Tests cover:
 *
 * - checkScoreReportAuth: Session-based authorization (admin + player)
 *   - Admin session authorization with full override capability
 *   - Player session authorization via credential login
 * - validateCharacter: Character validation against SMK roster
 * - createScoreEntryLog: Audit trail logging (non-critical, graceful failure)
 * - createCharacterUsageLog: Character usage tracking (non-critical, graceful failure)
 * - recalculatePlayerStats: Shared player stats recalculation (BM/MR/GP)
 *
 * Tests mock all dependencies including prisma, auth, and logger
 * to isolate the helper functions for independent testing.
 */
// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly

import {
  checkScoreReportAuth,
  validateCharacter,
  createScoreEntryLog,
  createCharacterUsageLog,
  recalculatePlayerStats,
  recalculatePlayersStats,
} from '@/lib/api-factories/score-report-helpers';

import { NextRequest } from 'next/server';
import { SMK_CHARACTERS } from '@/lib/constants';

// Mock dependencies
jest.mock('@/lib/prisma');
jest.mock('@/lib/auth');
jest.mock('@/lib/logger');

import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/prisma';

describe('Score Report Helpers', () => {
  let mockAuth: jest.MockedFunction<typeof auth>;
  let mockLogger: ReturnType<typeof createLogger>;
  let mockPrisma: typeof prisma;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAuth = auth as jest.MockedFunction<typeof auth>;
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    };

    (createLogger as jest.Mock).mockReturnValue(mockLogger);
    mockPrisma = prisma as jest.Mocked<typeof prisma>;
  });

  // ============================================================
  // checkScoreReportAuth Tests (6 cases)
  // ============================================================

  describe('checkScoreReportAuth', () => {
    const mockRequest = new NextRequest('http://localhost:3000');
    const mockTournamentId = 'tournament-123';

    const createMockMatch = (overrides = {}) => ({
      player1Id: 'player-1',
      player2Id: 'player-2',
      ...overrides,
    });

    it('should return true when session user is admin', async () => {
      const mockMatch = createMockMatch();

      mockAuth.mockResolvedValue({
        user: {
          id: 'admin-user',
          role: 'admin',
          userType: 'admin',
        },
      });

      const result = await checkScoreReportAuth(mockRequest, mockTournamentId, 1, mockMatch);

      expect(result).toBe(true);
    });

    it('authorizes OAuth-linked player when Player.userId matches session.user.id', async () => {
      /* Discord-linked session: session.user.id is the User row id and the
       * Player row stores that same id in player.userId. */
      const mockMatch = createMockMatch({
        player1Id: 'player-123',
        player1: { userId: 'player-user' },
      });

      mockAuth.mockResolvedValue({
        user: {
          id: 'player-user',
          playerId: 'player-123',
          userType: 'player',
          role: 'player',
        },
      });

      const result = await checkScoreReportAuth(mockRequest, mockTournamentId, 1, mockMatch);

      expect(result).toBe(true);
    });

    it('authorizes credentials-only player when session.user.id equals session.user.playerId', async () => {
      /* Credentials (password) login: authorize() returns `{ id: player.id,
       * playerId: player.id }`, so session.user.id === session.user.playerId
       * and Player.userId is typically null. Player.userId linkage is not
       * required in this case because the player record is the session
       * subject itself. */
      const mockMatch = createMockMatch({
        player1Id: 'player-123',
        player1: { userId: null },
      });

      mockAuth.mockResolvedValue({
        user: {
          id: 'player-123',
          playerId: 'player-123',
          userType: 'player',
          role: 'player',
        },
      });

      const result = await checkScoreReportAuth(mockRequest, mockTournamentId, 1, mockMatch);

      expect(result).toBe(true);
    });

    it('rejects OAuth session when Player.userId linkage is missing', async () => {
      /* Leakage guard: session carries a playerId but the linked Player row
       * is not tied to that session's user. Auth must fail so a leaked
       * playerId cannot be used from an unrelated OAuth session. */
      const mockMatch = createMockMatch({
        player1Id: 'player-123',
        player1: { userId: 'different-user' },
      });

      mockAuth.mockResolvedValue({
        user: {
          id: 'player-user',
          playerId: 'player-123',
          userType: 'player',
          role: 'player',
        },
      });

      const result = await checkScoreReportAuth(mockRequest, mockTournamentId, 1, mockMatch);

      expect(result).toBe(false);
    });

    it('should return false when no session exists', async () => {
      const mockMatch = createMockMatch();

      mockAuth.mockResolvedValue(null);

      const result = await checkScoreReportAuth(mockRequest, mockTournamentId, 1, mockMatch);

      expect(result).toBe(false);
    });

    it('should return false when session user is wrong player', async () => {
      const mockMatch = createMockMatch({ player1Id: 'player-1', player2Id: 'player-2' });

      mockAuth.mockResolvedValue({
        user: {
          id: 'different-user',
          playerId: 'player-999',
          userType: 'player',
          role: 'member',
        },
      });

      const result = await checkScoreReportAuth(mockRequest, mockTournamentId, 1, mockMatch);

      expect(result).toBe(false);
    });
  });

  // ============================================================
  // validateCharacter Tests (2 cases)
  // ============================================================

  describe('validateCharacter', () => {
    it('should return true when character is undefined', () => {
      const result = validateCharacter(undefined);
      expect(result).toBe(true);
    });

    it('should return false when character is not in SMK_CHARACTERS', () => {
      const result = validateCharacter('InvalidCharacter');
      expect(result).toBe(false);
    });

    it('should return true when character is in SMK_CHARACTERS', () => {
      const result = validateCharacter(SMK_CHARACTERS[0]);
      expect(result).toBe(true);
    });
  });

  // ============================================================
  // createScoreEntryLog Tests (2 cases)
  // ============================================================

  describe('createScoreEntryLog', () => {
    const mockLogData = {
      tournamentId: 'tournament-123',
      matchId: 'match-456',
      matchType: 'BM',
      playerId: 'player-789',
      reportedData: { score1: 3, score2: 1 },
      clientIp: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    };

    it('should create log entry successfully (silent success)', async () => {
      mockPrisma.scoreEntryLog.create.mockResolvedValue({
        id: 'log-1',
        ...mockLogData,
      });

      await createScoreEntryLog(mockLogger, mockLogData);

      expect(mockPrisma.scoreEntryLog.create).toHaveBeenCalledWith({
        data: {
          tournamentId: mockLogData.tournamentId,
          matchId: mockLogData.matchId,
          matchType: mockLogData.matchType,
          playerId: mockLogData.playerId,
          reportedData: mockLogData.reportedData as any,
          ipAddress: mockLogData.clientIp,
          userAgent: mockLogData.userAgent,
        },
      });
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should log warning when create fails (non-critical)', async () => {
      mockPrisma.scoreEntryLog.create.mockRejectedValue(new Error('Database connection failed'));

      await createScoreEntryLog(mockLogger, mockLogData);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to create score entry log',
        {
          error: expect.any(Error),
          tournamentId: mockLogData.tournamentId,
          matchId: mockLogData.matchId,
          playerId: mockLogData.playerId,
        }
      );
    });
  });

  // ============================================================
  // createCharacterUsageLog Tests (2 cases)
  // ============================================================

  describe('createCharacterUsageLog', () => {
    const mockCharacterData = {
      matchId: 'match-456',
      matchType: 'BM',
      playerId: 'player-789',
      character: 'Mario',
      tournamentId: 'tournament-123',
    };

    it('should create character usage log entry successfully (silent success)', async () => {
      mockPrisma.matchCharacterUsage.create.mockResolvedValue({
        id: 'char-log-1',
        ...mockCharacterData,
      });

      await createCharacterUsageLog(mockLogger, mockCharacterData);

      expect(mockPrisma.matchCharacterUsage.create).toHaveBeenCalledWith({
        data: {
          matchId: mockCharacterData.matchId,
          matchType: mockCharacterData.matchType,
          playerId: mockCharacterData.playerId,
          character: mockCharacterData.character,
        },
      });
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should log warning when create fails (non-critical)', async () => {
      mockPrisma.matchCharacterUsage.create.mockRejectedValue(new Error('Database connection failed'));

      await createCharacterUsageLog(mockLogger, mockCharacterData);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to create character usage log',
        {
          error: expect.any(Error),
          tournamentId: mockCharacterData.tournamentId,
          matchId: mockCharacterData.matchId,
          playerId: mockCharacterData.playerId,
          character: mockCharacterData.character,
        }
      );
    });
  });

  // ============================================================
  // recalculatePlayerStats Tests
  // ============================================================

  describe('recalculatePlayerStats', () => {
    /**
     * Create a mock match record with player IDs and score fields.
     * Supports both score1/score2 (BM/MR) and points1/points2 (GP) patterns.
     */
    function createMockMatch(
      player1Id: string,
      player2Id: string,
      scores: Record<string, number>,
    ) {
      return { player1Id, player2Id, ...scores };
    }

    /** Config for round-differential mode (BM/MR pattern) */
    const differentialConfig: RecalculateStatsConfig = {
      matchModel: 'testMatch',
      qualificationModel: 'bMQualification',
      scoreFields: { p1: 'score1', p2: 'score2' },
      determineResult: (my, opp) =>
        my > opp ? 'win' : my < opp ? 'loss' : 'tie',
      useRoundDifferential: true,
    };

    /** Config for absolute-points mode (GP pattern) */
    const absoluteConfig: RecalculateStatsConfig = {
      matchModel: 'testMatch',
      qualificationModel: 'gPQualification',
      scoreFields: { p1: 'points1', p2: 'points2' },
      determineResult: (my, opp) =>
        my > opp ? 'win' : my < opp ? 'loss' : 'tie',
      useRoundDifferential: false,
    };

    let mockFindMany: jest.Mock;
    let mockExecuteRawUnsafe: jest.Mock;

    beforeEach(() => {
      mockFindMany = jest.fn();
      mockExecuteRawUnsafe = jest.fn();
      /* Dynamic model access: prisma[config.matchModel].findMany */
      (mockPrisma as any).testMatch = { findMany: mockFindMany };
      (mockPrisma as any).$executeRawUnsafe = mockExecuteRawUnsafe;
    });

    function expectBulkUpdateWith(
      modelTable: 'BMQualification' | 'GPQualification',
      expectedUpdates: Array<Record<string, unknown>>,
    ) {
      expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
      const [sql, payload, tournamentId] = mockExecuteRawUnsafe.mock.calls[0];
      expect(sql).toContain(`UPDATE ${modelTable}`);
      expect(sql).toContain('json_each(?)');
      expect(tournamentId).toBe('tourney-1');
      expect(JSON.parse(payload)).toEqual(expectedUpdates);
    }

    it('should correctly calculate stats with round differential (BM/MR)', async () => {
      /* Player p1 played 3 matches: 1 win (3-1), 1 loss (1-3), 1 tie (2-2) */
      mockFindMany.mockResolvedValue([
        createMockMatch('p1', 'p2', { score1: 3, score2: 1 }),
        createMockMatch('p1', 'p3', { score1: 1, score2: 3 }),
        createMockMatch('p4', 'p1', { score1: 2, score2: 2 }),
      ]);

      await recalculatePlayerStats(differentialConfig, 'tourney-1', 'p1');

      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          tournamentId: 'tourney-1',
          stage: 'qualification',
          completed: true,
          OR: [
            { player1Id: { in: ['p1'] } },
            { player2Id: { in: ['p1'] } },
          ],
        },
      });

      expectBulkUpdateWith('BMQualification', [
        {
          playerId: 'p1',
          mp: 3,
          wins: 1,
          ties: 1,
          losses: 1,
          winRounds: 6,     // 3 + 1 + 2 (as player2 in 3rd match)
          lossRounds: 6,    // 1 + 3 + 2
          points: 0,        // 6 - 6 = 0 differential
          score: 3,         // 1*2 + 1 = 3 match points
        },
      ]);
    });

    it('should correctly calculate stats with absolute points (GP)', async () => {
      /* Player p1 played 2 matches: 1 win (18-12), 1 loss (6-15) */
      mockFindMany.mockResolvedValue([
        createMockMatch('p1', 'p2', { points1: 18, points2: 12 }),
        createMockMatch('p3', 'p1', { points1: 15, points2: 6 }),
      ]);

      await recalculatePlayerStats(absoluteConfig, 'tourney-1', 'p1');

      expectBulkUpdateWith('GPQualification', [
        {
          playerId: 'p1',
          mp: 2,
          wins: 1,
          ties: 0,
          losses: 1,
          points: 24,       // 18 + 6 = total driver points
          score: 2,         // 1*2 + 0 = 2 match points
        },
      ]);
    });

    it('should handle empty match list (no completed matches)', async () => {
      mockFindMany.mockResolvedValue([]);

      await recalculatePlayerStats(differentialConfig, 'tourney-1', 'p1');

      expectBulkUpdateWith('BMQualification', [
        {
          playerId: 'p1',
          mp: 0, wins: 0, ties: 0, losses: 0,
          winRounds: 0, lossRounds: 0, points: 0, score: 0,
        },
      ]);
    });

    it('should correctly resolve player side when player is player2', async () => {
      /* Player is always player2 in these matches */
      mockFindMany.mockResolvedValue([
        createMockMatch('other', 'p1', { score1: 1, score2: 3 }), // p1 wins
        createMockMatch('other', 'p1', { score1: 4, score2: 0 }), // p1 loses
      ]);

      await recalculatePlayerStats(differentialConfig, 'tourney-1', 'p1');

      expectBulkUpdateWith('BMQualification', [
        {
          playerId: 'p1',
          mp: 2,
          wins: 1,
          losses: 1,
          ties: 0,
          winRounds: 3,     // 3 + 0
          lossRounds: 5,    // 1 + 4
          points: -2,       // 3 - 5 = -2
          score: 2,         // 1*2 + 0
        },
      ]);
    });

    it('should support custom determineResult function (BM-style)', async () => {
      /**
       * BM-specific: calculateMatchResult requires score sum = 4.
       * Simulate with a custom determiner that always returns 'tie' for 2-2.
       */
      const bmConfig: RecalculateStatsConfig = {
        ...differentialConfig,
        determineResult: (my, opp) => {
          if (my + opp !== 4) return 'tie'; // invalid BM score → tie
          return my > opp ? 'win' : my < opp ? 'loss' : 'tie';
        },
      };

      mockFindMany.mockResolvedValue([
        createMockMatch('p1', 'p2', { score1: 3, score2: 1 }),
        createMockMatch('p1', 'p3', { score1: 2, score2: 2 }),
      ]);

      await recalculatePlayerStats(bmConfig, 'tourney-1', 'p1');

      expectBulkUpdateWith('BMQualification', [
        {
          playerId: 'p1',
          mp: 2, wins: 1, ties: 1, losses: 0,
          winRounds: 5, lossRounds: 3, points: 2, score: 3,
        },
      ]);
    });

    it('should recalculate multiple players with one match query and one bulk update', async () => {
      mockFindMany.mockResolvedValue([
        createMockMatch('p1', 'p2', { score1: 3, score2: 1 }),
        createMockMatch('p3', 'p2', { score1: 2, score2: 2 }),
      ]);

      await recalculatePlayersStats(differentialConfig, 'tourney-1', ['p1', 'p2', 'p1']);

      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          tournamentId: 'tourney-1',
          stage: 'qualification',
          completed: true,
          OR: [
            { player1Id: { in: ['p1', 'p2'] } },
            { player2Id: { in: ['p1', 'p2'] } },
          ],
        },
      });
      expectBulkUpdateWith('BMQualification', [
        {
          playerId: 'p1',
          mp: 1,
          wins: 1,
          ties: 0,
          losses: 0,
          winRounds: 3,
          lossRounds: 1,
          points: 2,
          score: 2,
        },
        {
          playerId: 'p2',
          mp: 2,
          wins: 0,
          ties: 1,
          losses: 1,
          winRounds: 3,
          lossRounds: 5,
          points: -2,
          score: 1,
        },
      ]);
    });
  });
});

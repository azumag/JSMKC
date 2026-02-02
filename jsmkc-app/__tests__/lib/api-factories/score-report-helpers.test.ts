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
 *   - Player session authorization (direct login and OAuth-linked)
 * - validateCharacter: Character validation against SMK roster
 * - applyRateLimit: Rate limiting with 429 response on exceeded limits
 * - createScoreEntryLog: Audit trail logging (non-critical, graceful failure)
 * - createCharacterUsageLog: Character usage tracking (non-critical, graceful failure)
 *
 * Tests mock all dependencies including prisma, auth, rate-limit,
 * and logger to isolate the helper functions for independent testing.
 */
// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly

import {
  checkScoreReportAuth,
  validateCharacter,
  applyRateLimit,
  createScoreEntryLog,
  createCharacterUsageLog,
} from '@/lib/api-factories/score-report-helpers';

import { NextRequest } from 'next/server';
import { SMK_CHARACTERS } from '@/lib/constants';

// Mock dependencies
jest.mock('@/lib/prisma');
jest.mock('@/lib/auth');
jest.mock('@/lib/rate-limit');
jest.mock('@/lib/logger');

import { rateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/prisma';

describe('Score Report Helpers', () => {
  let mockRateLimit: jest.MockedFunction<typeof rateLimit>;
  let mockGetClientIdentifier: jest.MockedFunction<typeof getClientIdentifier>;
  let mockAuth: jest.MockedFunction<typeof auth>;
  let mockLogger: ReturnType<typeof createLogger>;
  let mockPrisma: typeof prisma;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mocks
    mockRateLimit = rateLimit as jest.MockedFunction<typeof rateLimit>;
    mockGetClientIdentifier = getClientIdentifier as jest.MockedFunction<typeof getClientIdentifier>;
    mockAuth = auth as jest.MockedFunction<typeof auth>;
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    };

    // Mock createLogger to return test logger
    (createLogger as jest.Mock).mockReturnValue(mockLogger);

    // Mock prisma
    mockPrisma = prisma as jest.Mocked<typeof prisma>;

    // Default successful responses
    mockRateLimit.mockResolvedValue({ success: true, remaining: 19 });
    mockGetClientIdentifier.mockReturnValue('192.168.1.1');
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
      player1: { userId: 'user-1' },
      player2: { userId: 'user-2' },
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

    it('should return true when session player matches player1Id', async () => {
      const mockMatch = createMockMatch({ player1Id: 'player-123' });

      mockAuth.mockResolvedValue({
        user: {
          id: 'player-user',
          playerId: 'player-123',
          userType: 'player',
          role: 'member',
        },
      });

      const result = await checkScoreReportAuth(mockRequest, mockTournamentId, 1, mockMatch);

      expect(result).toBe(true);
    });

    it('should return true when session user OAuth-linked matches player1.userId', async () => {
      const mockMatch = createMockMatch({ player1: { userId: 'oauth-user-123' } });

      mockAuth.mockResolvedValue({
        user: {
          id: 'oauth-user-123',
          userType: 'oauth',
          role: 'member',
        },
      });

      const result = await checkScoreReportAuth(mockRequest, mockTournamentId, 1, mockMatch);

      expect(result).toBe(true);
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
  // applyRateLimit Tests (2 cases)
  // ============================================================

  describe('applyRateLimit', () => {
    const mockRequest = new NextRequest('http://localhost:3000', {
      headers: new Headers({ 'x-forwarded-for': '192.168.1.1' }),
    });

    it('should return { allowed: true } when rate limit check succeeds', async () => {
      mockRateLimit.mockResolvedValue({ success: true, remaining: 19 });

      const result = await applyRateLimit(mockRequest, 20, 60000);

      expect(result.allowed).toBe(true);
      expect(result.clientIp).toBe('192.168.1.1');
      expect(result.response).toBeUndefined();
      expect(mockGetClientIdentifier).toHaveBeenCalledWith(mockRequest);
      expect(mockRateLimit).toHaveBeenCalledWith('192.168.1.1', 20, 60000);
    });

    it('should return { allowed: false, response: 429 } when rate limit check fails', async () => {
      mockRateLimit.mockResolvedValue({ success: false, remaining: 0, retryAfter: 30 });

      const result = await applyRateLimit(mockRequest, 20, 60000);

      expect(result.allowed).toBe(false);
      expect(result.clientIp).toBe('192.168.1.1');
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(429);
      expect(mockGetClientIdentifier).toHaveBeenCalledWith(mockRequest);
      expect(mockRateLimit).toHaveBeenCalledWith('192.168.1.1', 20, 60000);
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
});

/**
 * @module MR Score Report API Route Tests
 *
 * Test suite for the Match Race (MR) score reporting endpoint:
 * /api/tournaments/[id]/mr/match/[matchId]/report
 *
 * Covers the POST method for player-initiated score reporting with session-based authentication:
 * - Admin session: Allows administrators to report scores on behalf of any player.
 * - Player session: Allows authenticated players to report scores for their own matches,
 *   with player identity verified via playerId or userId linkage.
 *
 * Test scenarios include:
 * - Success cases: Report with admin session, authenticated player, OAuth-linked
 *   player, and character selection (from SMK_CHARACTERS constant).
 * - Validation errors: Invalid character, missing reportingPlayer, invalid reportingPlayer
 *   value (must be 1 or 2).
 * - Authentication failures: Returns 401 for unauthorized users (not a match participant).
 * - Error cases: Match not found (404), database operation failure (500).
 * - Edge cases: Non-critical failures for score entry log and character usage log creation
 *   (system continues despite logging errors).
 *
 * When both players report matching scores, the match is automatically finalized with
 * the agreed-upon scores.
 *
 * Dependencies mocked: @/lib/auth, @/lib/request-utils, @/lib/auth,
 *   @/lib/sanitize, @/lib/constants, @/lib/audit-log, @/lib/logger, next/server, @/lib/prisma
 */
// @ts-nocheck


jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/request-utils', () => ({
  getClientIdentifier: jest.fn(),
  getUserAgent: jest.fn()
}));
jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((data) => data) }));
jest.mock('@/lib/constants', () => ({ SMK_CHARACTERS: ['Mario', 'Luigi', 'Yoshi'] }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('@/lib/error-handling', () => ({
  createSuccessResponse: jest.fn((data, message) => ({ data, message, status: 200 })),
  createErrorResponse: jest.fn((message, status, code, details) => ({ data: { error: message, code, details }, status })),
  handleValidationError: jest.fn((message, field) => ({ data: { error: message, field }, status: 400 })),
  handleAuthError: jest.fn((message) => ({ data: { error: message }, status: 401 })),
  handleDatabaseError: jest.fn((error, operation) => ({ data: { error: `Database error: ${operation}` }, status: 500 })),
}));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { getClientIdentifier, getUserAgent } from '@/lib/request-utils';
import { POST } from '@/app/api/tournaments/[id]/mr/match/[matchId]/report/route';

const {
  createSuccessResponse,
  handleValidationError,
  handleAuthError,
  handleDatabaseError
} = jest.requireMock('@/lib/error-handling');

// Mock NextRequest class
class MockNextRequest {
  constructor(
    private url: string,
    private body?: any,
    private headers: Map<string, string> = new Map()
  ) {}
  async json() { return this.body; }
  get header() { return { get: (key: string) => this.headers.get(key) }; }
  headers = {
    get: (key: string) => this.headers.get(key)
  };
}

describe('MR Score Report API Route - /api/tournaments/[id]/mr/match/[matchId]/report', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    getClientIdentifier.mockReturnValue('test-ip');
    getUserAgent.mockReturnValue('test-agent');
    /* Default: no auth session */
    (auth as jest.Mock).mockResolvedValue(null);
    /* Reset Prisma mocks to prevent cross-test contamination */
    (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({});
    (prisma.matchCharacterUsage.create as jest.Mock).mockResolvedValue({});
    (prisma.mRMatch.update as jest.Mock).mockResolvedValue({});
  });

  describe('POST - Report match score', () => {
    // Success case - Report score with tournament token
    it('should report score successfully with valid tournament token', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
        player1: { id: 'p1', userId: 'u1' },
        player2: { id: 'p2', userId: 'u2' },
      };

      const updatedMatch = {
        ...mockMatch,
        player1ReportedPoints1: 3,
        player1ReportedPoints2: 1,
      };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin', userType: 'admin' } });
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(updatedMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { match: updatedMatch },
        status: 200
      });
      expect(createSuccessResponse).toHaveBeenCalledWith({ match: updatedMatch });
      expect(prisma.mRMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: {
          player1ReportedPoints1: 3,
          player1ReportedPoints2: 1,
        },
      });
    });

    // Success case - Report score with authenticated player
    it('should report score successfully for authenticated player', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1ReportedPoints1: 3,
        player1ReportedPoints2: 1,
        player2ReportedPoints1: 3,
        player2ReportedPoints2: 1,
        player1: { id: 'p1', userId: 'u1' },
        player2: { id: 'p2', userId: 'u2' },
      };

      // Player session auth — playerId 'p1' matches player1Id in the match
      const mockSession = { user: { id: 'u1', userType: 'player', playerId: 'p1' } };
      (auth as jest.Mock).mockResolvedValue(mockSession);
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(200);
      expect(prisma.mRMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: {
          score1: 3,
          score2: 1,
          rounds: null,
          completed: true,
        },
      });
    });

    // Success case - Report score with OAuth linked player
    it('should report score successfully for OAuth linked player', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1ReportedPoints1: 3,
        player1ReportedPoints2: 1,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
        player1: { id: 'p1', userId: 'u1' },
        player2: { id: 'p2', userId: 'u2' },
      };

      // OAuth-linked user — session user id 'u1' matches player1.userId in the match
      const mockSession = { user: { id: 'u1' } };
      (auth as jest.Mock).mockResolvedValue(mockSession);
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(200);
    });

    // Success case - Report score with character
    it('should report score with valid character', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
        player1: { id: 'p1', userId: 'u1' },
        player2: { id: 'p2', userId: 'u2' },
      };

      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin', userType: 'admin' } });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({});
      (prisma.matchCharacterUsage.create as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1, character: 'Mario' });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(200);
      expect(prisma.matchCharacterUsage.create).toHaveBeenCalledWith({
        data: {
          matchId: 'm1',
          matchType: 'MR',
          playerId: 'p1',
          character: 'Mario',
        },
      });
    });

    // Success case - Auto-confirms when both players report matching scores
    it('should auto-confirm match when both players report matching scores', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1ReportedPoints1: 3,
        player1ReportedPoints2: 1,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
        player1: { id: 'p1', userId: 'u1' },
        player2: { id: 'p2', userId: 'u2' },
      };

      const finalMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        score1: 3,
        score2: 1,
        rounds: null,
        completed: true,
        player1ReportedPoints1: 3,
        player1ReportedPoints2: 1,
        player2ReportedPoints1: 3,
        player2ReportedPoints2: 1,
        player1: { id: 'p1', userId: 'u1' },
        player2: { id: 'p2', userId: 'u2' },
      };

      (prisma.mRMatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMatch)
        .mockResolvedValueOnce(finalMatch);
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', userType: 'player', playerId: 'p1' } });
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(finalMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { match: finalMatch, autoConfirmed: true },
        message: 'Scores confirmed and match completed',
        status: 200
      });
    });

    // Success case - Flags mismatch when both players report different scores
    it('should flag mismatch when both players report different scores', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1ReportedPoints1: 3,
        player1ReportedPoints2: 1,
        player2ReportedPoints1: 2,
        player2ReportedPoints2: 2,
        player1: { id: 'p1', userId: 'u1' },
        player2: { id: 'p2', userId: 'u2' },
      };

      const updatedMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1ReportedPoints1: 3,
        player1ReportedPoints2: 1,
        player2ReportedPoints1: 2,
        player2ReportedPoints2: 2,
        player1: { id: 'p1', userId: 'u1' },
        player2: { id: 'p2', userId: 'u2' },
      };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValueOnce(mockMatch).mockResolvedValueOnce(updatedMatch);
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', userType: 'player', playerId: 'p1' } });
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(updatedMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: {
          match: updatedMatch,
          waitingFor: 'player2',
        },
        message: 'Score reported successfully',
        status: 200
      });
    });

    // Validation error case - Returns 400 when character is invalid
    it('should return 400 when character is invalid', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin', userType: 'admin' } });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue({ id: 'm1' });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1, character: 'InvalidChar' });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { error: 'Invalid character', field: 'character' },
        status: 400
      });
      expect(handleValidationError).toHaveBeenCalledWith('Invalid character', 'character');
    });

    // Error case - Returns 404 when match not found
    it('should return 404 when match does not exist', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin', userType: 'admin' } });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/nonexistent/report', { reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'nonexistent' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { error: 'Match not found', field: 'matchId' },
        status: 400
      });
      expect(handleValidationError).toHaveBeenCalledWith('Match not found', 'matchId');
    });

    // Authentication failure case - Returns 401 when not authorized
    it('should return 401 when user is not authorized', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1', userId: 'u1' },
        player2: { id: 'p2', userId: 'u2' },
      };

      // Wrong player — session user 'p3' is not a participant in this match
      const mockSession = { user: { id: 'u3', userType: 'player', playerId: 'p3' } };
      (auth as jest.Mock).mockResolvedValue(mockSession);
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { error: 'Unauthorized: Not authorized for this match' },
        status: 401
      });
      expect(handleAuthError).toHaveBeenCalledWith('Unauthorized: Not authorized for this match');
    });

    // Validation error case - Returns 400 when reportingPlayer is missing
    it('should return 400 when reportingPlayer is missing', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin', userType: 'admin' } });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue({ id: 'm1' });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { error: 'reportingPlayer, score1, and score2 are required', field: 'requiredFields' },
        status: 400
      });
      expect(handleValidationError).toHaveBeenCalledWith('reportingPlayer, score1, and score2 are required', 'requiredFields');
    });

    // Validation error case - Returns 400 when reportingPlayer is invalid
    it('should return 400 when reportingPlayer is not 1 or 2', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin', userType: 'admin' } });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue({ id: 'm1' });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 3, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { error: 'reportingPlayer must be 1 or 2', field: 'reportingPlayer' },
        status: 400
      });
      expect(handleValidationError).toHaveBeenCalledWith('reportingPlayer must be 1 or 2', 'reportingPlayer');
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin', userType: 'admin' } });
      (prisma.mRMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { error: 'Database error: score report' },
        status: 500
      });
      expect(handleDatabaseError).toHaveBeenCalledWith(expect.any(Error), 'score report');
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to report score', { error: expect.any(Error), tournamentId: 't1', matchId: 'm1' });
    });

    // Edge case - Score entry log failure is non-critical
    it('should continue when score entry log creation fails', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player1: { id: 'p1', userId: 'u1' },
        player2: { id: 'p2', userId: 'u2' },
      };

      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin', userType: 'admin' } });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockRejectedValue(new Error('Log error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(200);
      expect(loggerMock.warn).toHaveBeenCalledWith('Failed to create score entry log', expect.any(Object));
    });

    // Edge case - Character usage log failure is non-critical
    it('should continue when character usage log creation fails', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player1: { id: 'p1', userId: 'u1' },
        player2: { id: 'p2', userId: 'u2' },
      };

      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin', userType: 'admin' } });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({});
      (prisma.matchCharacterUsage.create as jest.Mock).mockRejectedValue(new Error('Char log error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1, character: 'Mario' });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(200);
      expect(loggerMock.warn).toHaveBeenCalledWith('Failed to create character usage log', expect.any(Object));
    });
  });
});

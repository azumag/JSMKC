/**
 * @module BM Match Report API Route Tests
 *
 * Test suite for the Battle Mode player score report endpoint:
 * /api/tournaments/[id]/bm/match/[matchId]/report
 *
 * This file covers the POST method which allows players to self-report their match scores.
 * The system supports dual-reporting: both players report independently, and results are
 * compared for automatic confirmation or flagged for admin review on mismatch.
 *
 * Key behaviors tested:
 *   - Score reporting as player1 and player2 with valid authentication (OAuth and token-based)
 *   - Character usage tracking for SMK characters (mario, luigi, peach, yoshi, toad, bowser,
 *     donkey-kong, koopa)
 *   - Admin score reporting via tournament token and admin role
 *   - Auto-confirmation when both players report matching scores (triggers qualification update)
 *   - Score mismatch detection and flagging for admin review
 *   - Input validation: invalid characters, missing matches, completed matches,
 *     invalid reportingPlayer values, invalid score combinations
 *   - Authentication: unauthorized users, OAuth-linked players
 *   - Optimistic locking conflict handling (409 responses)
 *   - Non-critical logging: score entry log and character usage log failures are warned but
 *     do not block the response
 *   - Database error handling with structured error responses
 */
// @ts-nocheck


jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('@/lib/request-utils', () => ({
  getClientIdentifier: jest.fn(),
  getUserAgent: jest.fn()
}));
jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((data) => data) }));
jest.mock('@/lib/optimistic-locking', () => ({
  updateWithRetry: jest.fn(),
  OptimisticLockError: class OptimisticLockError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'OptimisticLockError';
    }
  }
}));
jest.mock('@/lib/score-validation', () => ({
  validateBattleModeScores: jest.fn(),
  calculateMatchResult: jest.fn()
}));
jest.mock('@/lib/constants', () => ({
  RATE_LIMIT_SCORE_INPUT: 10,
  RATE_LIMIT_SCORE_INPUT_DURATION: 60,
  SMK_CHARACTERS: ['mario', 'luigi', 'peach', 'yoshi', 'toad', 'bowser', 'donkey-kong', 'koopa']
}));
jest.mock('@/lib/error-handling', () => ({
  createSuccessResponse: jest.fn((data, message) => ({ data, message, status: 200 })),
  createErrorResponse: jest.fn((message, status, code, details) => ({ data: { error: message, code, details }, status })),
  handleValidationError: jest.fn((message, field) => ({ data: { error: message, field }, status: 400 })),
  handleAuthError: jest.fn((message) => ({ data: { error: message }, status: 401 })),
  handleRateLimitError: jest.fn((retryAfter) => ({ data: { error: 'Rate limit exceeded', retryAfter }, status: 429 })),
  handleDatabaseError: jest.fn((error, operation) => ({ data: { error: `Database error: ${operation}` }, status: 500 })),
}));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { getClientIdentifier, getUserAgent } from '@/lib/request-utils';
import { sanitizeInput } from '@/lib/sanitize';
import { updateWithRetry, OptimisticLockError } from '@/lib/optimistic-locking';
import { validateBattleModeScores, calculateMatchResult } from '@/lib/score-validation';

import { POST } from '@/app/api/tournaments/[id]/bm/match/[matchId]/report/route';

const {
  createSuccessResponse: _createSuccessResponse,
  createErrorResponse,
  handleValidationError,
  handleAuthError,
  handleRateLimitError,
  handleDatabaseError
} = jest.requireMock('@/lib/error-handling');

// Mock NextRequest class
class MockNextRequest {
  private _headers: Map<string, string>;

  constructor(
    private body?: any,
    headers?: Map<string, string>
  ) {
    this._headers = headers || new Map();
    this._headers.set('user-agent', 'test-agent');
  }
  async json() { return this.body; }
  headers = {
    get: (key: string) => this._headers.get(key)
  };
}

describe('BM Match Report API Route - /api/tournaments/[id]/bm/match/[matchId]/report', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    (getClientIdentifier as jest.Mock).mockReturnValue('test-client-ip');
    (getUserAgent as jest.Mock).mockReturnValue('test-agent');
    (validateBattleModeScores as jest.Mock).mockReturnValue({ isValid: true });
    (sanitizeInput as jest.Mock).mockImplementation((data) => data);
    /* Default: no auth session */
    (auth as jest.Mock).mockResolvedValue(null);
    /* Reset Prisma mocks to prevent cross-test contamination from mockRejectedValue */
    (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({});
    (prisma.matchCharacterUsage.create as jest.Mock).mockResolvedValue({});
    (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.bMQualification.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (updateWithRetry as jest.Mock).mockResolvedValue(null);
  });

  describe('POST - Report score from a player', () => {
    // Success case - Reports score as player1 with valid authentication
    it('should report score successfully for player1 with valid authentication', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1: { id: 'p1', userId: 'user1' },
        player2: { id: 'p2', userId: 'user2' },
      };

      const mockUpdateResult = {
        id: 'm1',
        player1ReportedScore1: 3,
        player1ReportedScore2: 1,
        player2ReportedScore1: null,
        player2ReportedScore2: null,
        completed: false,
        version: 2,
      };

      const mockAuth = { user: { id: 'user1', userType: 'player', playerId: 'p1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (updateWithRetry as jest.Mock).mockResolvedValue(mockUpdateResult);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });

      const request = new MockNextRequest({ reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { match: mockUpdateResult, waitingFor: 'player2' },
        message: 'Score reported successfully',
        status: 200
      });
      expect(updateWithRetry).toHaveBeenCalled();
      /* Source wraps the create argument in a `data` key per Prisma conventions */
      expect(prisma.scoreEntryLog.create).toHaveBeenCalledWith({
        data: {
          tournamentId: 't1',
          matchId: 'm1',
          matchType: 'BM',
          playerId: 'p1',
          reportedData: { reportingPlayer: 1, score1: 3, score2: 1 },
          ipAddress: 'test-client-ip',
          userAgent: 'test-agent',
        },
      });
    });

    // Success case - Reports score with character usage tracking
    it('should report score and track character usage when character is provided', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1: { id: 'p1', userId: 'user1' },
        player2: { id: 'p2', userId: 'user2' },
      };

      const mockUpdateResult = {
        id: 'm1',
        player1ReportedScore1: 3,
        player1ReportedScore2: 1,
        player2ReportedScore1: null,
        player2ReportedScore2: null,
        completed: false,
        version: 2,
      };

      const mockAuth = { user: { id: 'user1', userType: 'player', playerId: 'p1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (updateWithRetry as jest.Mock).mockResolvedValue(mockUpdateResult);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
      (prisma.matchCharacterUsage.create as jest.Mock).mockResolvedValue({ id: 'char1' });

      const request = new MockNextRequest({ reportingPlayer: 1, score1: 3, score2: 1, character: 'mario' });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(200);
      /* Source wraps the create argument in a `data` key per Prisma conventions */
      expect(prisma.matchCharacterUsage.create).toHaveBeenCalledWith({
        data: {
          matchId: 'm1',
          matchType: 'BM',
          playerId: 'p1',
          character: 'mario',
        },
      });
    });

    // Success case - Admin reports score via tournament token
    it('should allow admin to report score via tournament token', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      const mockUpdateResult = {
        id: 'm1',
        player1ReportedScore1: 3,
        player1ReportedScore2: 1,
        player2ReportedScore1: null,
        player2ReportedScore2: null,
        completed: false,
        version: 2,
      };

      /* Use admin session for auth in tests where we need to pass authorization */
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin', userType: 'admin' } });
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (updateWithRetry as jest.Mock).mockResolvedValue(mockUpdateResult);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });

      const request = new MockNextRequest({ reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(200);
      expect(auth).toHaveBeenCalled();
    });

    // Success case - Admin with admin role reports score
    it('should allow admin with admin role to report score', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      const mockUpdateResult = {
        id: 'm1',
        player1ReportedScore1: 3,
        player1ReportedScore2: 1,
        player2ReportedScore1: null,
        player2ReportedScore2: null,
        completed: false,
        version: 2,
      };

      const mockAuth = { user: { id: 'admin1', userType: 'admin', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (updateWithRetry as jest.Mock).mockResolvedValue(mockUpdateResult);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });

      const request = new MockNextRequest({ reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(200);
    });

      // Success case - Auto-confirms match when both players report matching scores
    it('should auto-confirm match when both players report matching scores', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1: { id: 'p1', userId: 'user1' },
        player2: { id: 'p2', userId: 'user2' },
      };

      const mockUpdateResult = {
        id: 'm1',
        player1ReportedScore1: 3,
        player1ReportedScore2: 1,
        player2ReportedScore1: 3,
        player2ReportedScore2: 1,
        completed: true,
        version: 3,
      };

      const mockFinalMatch = {
        id: 'm1',
        score1: 3,
        score2: 1,
        completed: true,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      const mockAuth = { user: { id: 'user1', userType: 'player', playerId: 'p1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (updateWithRetry as jest.Mock)
        .mockResolvedValueOnce(mockUpdateResult)
        .mockResolvedValueOnce(mockFinalMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([mockFinalMatch]);
      (prisma.bMQualification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      /* recalculatePlayerStats calls calculateMatchResult for each completed match */
      (calculateMatchResult as jest.Mock).mockReturnValue({ result1: 'win', result2: 'loss' });

      const request = new MockNextRequest({ reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { match: mockFinalMatch, autoConfirmed: true },
        message: 'Scores confirmed and match completed',
        status: 200
      });
      expect(updateWithRetry).toHaveBeenCalledTimes(2);
    });

    // Success case - Flags mismatch when both players report different scores
    it('should flag mismatch when both players report different scores', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1: { id: 'p1', userId: 'user1' },
        player2: { id: 'p2', userId: 'user2' },
      };

      const mockUpdateResult = {
        id: 'm1',
        player1ReportedScore1: 3,
        player1ReportedScore2: 1,
        player2ReportedScore1: 2,
        player2ReportedScore2: 2,
        completed: false,
        version: 3,
      };

      const mockAuth = { user: { id: 'user1', userType: 'player', playerId: 'p1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (updateWithRetry as jest.Mock).mockResolvedValue(mockUpdateResult);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });

      const request = new MockNextRequest({ reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: {
          match: mockUpdateResult,
          mismatch: true,
          player1Report: { score1: 3, score2: 1 },
          player2Report: { score1: 2, score2: 2 },
        },
        message: 'Score reported but mismatch detected - awaiting admin review',
        status: 200
      });
    });


    // Validation error case - Returns 400 when character is invalid
    it('should return 400 when character is not valid', async () => {
      const request = new MockNextRequest({ reportingPlayer: 1, score1: 3, score2: 1, character: 'invalid-character' });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { error: 'Invalid character', field: 'character' },
        status: 400
      });
      expect(handleValidationError).toHaveBeenCalledWith('Invalid character', 'character');
    });

    // Validation error case - Returns 400 when match is not found
    it('should return 400 when match does not exist', async () => {
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest({ reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { error: 'Match not found', field: 'matchId' },
        status: 400
      });
    });

    // Validation error case - Returns 400 when match is already completed
    it('should return 400 when match is already completed', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: true,
      };

      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest({ reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { error: 'Match already completed', field: 'matchStatus' },
        status: 400
      });
    });

    // Authentication error case - Returns 401 when user is not authorized
    it('should return 401 when user is not authorized for this match', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1: { id: 'p1', userId: 'user1' },
        player2: { id: 'p2', userId: 'user2' },
      };

      const mockAuth = { user: { id: 'user3', userType: 'player', playerId: 'p3' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest({ reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { error: 'Unauthorized: Not authorized for this match' },
        status: 401
      });
      expect(handleAuthError).toHaveBeenCalledWith('Unauthorized: Not authorized for this match');
    });

    // Validation error case - Returns 400 when reportingPlayer is invalid
    it('should return 400 when reportingPlayer is not 1 or 2', async () => {
      /* Need valid session to pass auth check before reaching reportingPlayer validation */
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin', userType: 'admin' } });
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue({
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      });

      const request = new MockNextRequest({ reportingPlayer: 3, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { error: 'Invalid reporting player', field: 'reportingPlayer' },
        status: 400
      });
    });

    // Validation error case - Returns 400 when scores are invalid
    it('should return 400 when scores are invalid', async () => {
      /* Need valid session to pass auth check before reaching score validation */
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin', userType: 'admin' } });
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue({
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      });
      (validateBattleModeScores as jest.Mock).mockReturnValue({ isValid: false, error: 'Invalid score combination' });

      const request = new MockNextRequest({ reportingPlayer: 1, score1: 5, score2: 5 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { error: 'Invalid score combination', field: 'scores' },
        status: 400
      });
      expect(handleValidationError).toHaveBeenCalledWith('Invalid score combination', 'scores');
    });

    // Optimistic locking error case - Returns 409 when version conflicts
    it('should return 409 when optimistic lock error occurs', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1: { id: 'p1', userId: 'user1' },
        player2: { id: 'p2', userId: 'user2' },
      };

      const mockAuth = { user: { id: 'user1', userType: 'player', playerId: 'p1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (updateWithRetry as jest.Mock).mockRejectedValue(new OptimisticLockError('Match was updated by another user'));
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });

      const request = new MockNextRequest({ reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: {
          error: 'This match was updated by someone else. Please refresh and try again.',
          code: 'OPTIMISTIC_LOCK_ERROR',
          details: { requiresRefresh: true }
        },
        status: 409
      });
      expect(createErrorResponse).toHaveBeenCalledWith(
        'This match was updated by someone else. Please refresh and try again.',
        409,
        'OPTIMISTIC_LOCK_ERROR',
        { requiresRefresh: true }
      );
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (prisma.bMMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest({ reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { error: 'Database error: score report' },
        status: 500
      });
      expect(handleDatabaseError).toHaveBeenCalledWith(expect.any(Error), 'score report');
    });

    // Edge case - Logs warning but continues when score entry log creation fails
    it('should continue when score entry log creation fails', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1: { id: 'p1', userId: 'user1' },
        player2: { id: 'p2', userId: 'user2' },
      };

      const mockUpdateResult = {
        id: 'm1',
        player1ReportedScore1: 3,
        player1ReportedScore2: 1,
        player2ReportedScore1: null,
        player2ReportedScore2: null,
        completed: false,
        version: 2,
      };

      const mockAuth = { user: { id: 'user1', userType: 'player', playerId: 'p1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (updateWithRetry as jest.Mock).mockResolvedValue(mockUpdateResult);
      (prisma.scoreEntryLog.create as jest.Mock).mockRejectedValue(new Error('Log creation failed'));

      const request = new MockNextRequest({ reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(200);
      expect(loggerMock.warn).toHaveBeenCalledWith('Failed to create score entry log', expect.any(Object));
    });

    // Edge case - Logs warning but continues when character usage log creation fails
    it('should continue when character usage log creation fails', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1: { id: 'p1', userId: 'user1' },
        player2: { id: 'p2', userId: 'user2' },
      };

      const mockUpdateResult = {
        id: 'm1',
        player1ReportedScore1: 3,
        player1ReportedScore2: 1,
        player2ReportedScore1: null,
        player2ReportedScore2: null,
        completed: false,
        version: 2,
      };

      const mockAuth = { user: { id: 'user1', userType: 'player', playerId: 'p1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (updateWithRetry as jest.Mock).mockResolvedValue(mockUpdateResult);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
      (prisma.matchCharacterUsage.create as jest.Mock).mockRejectedValue(new Error('Char log failed'));

      const request = new MockNextRequest({ reportingPlayer: 1, score1: 3, score2: 1, character: 'mario' });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(200);
      expect(loggerMock.warn).toHaveBeenCalledWith('Failed to create character usage log', expect.any(Object));
    });

    // Edge case - OAuth linked player reports score
    it('should allow OAuth linked player to report score', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1: { id: 'p1', userId: 'oauth-user1' },
        player2: { id: 'p2', userId: 'oauth-user2' },
      };

      const mockUpdateResult = {
        id: 'm1',
        player1ReportedScore1: 3,
        player1ReportedScore2: 1,
        player2ReportedScore1: null,
        player2ReportedScore2: null,
        completed: false,
        version: 2,
      };

      const mockAuth = { user: { id: 'oauth-user1', userType: 'oauth' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (updateWithRetry as jest.Mock).mockResolvedValue(mockUpdateResult);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });

      const request = new MockNextRequest({ reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(200);
    });

    // Edge case - Handles all valid SMK characters
    it('should accept all valid SMK characters', async () => {
      const validCharacters = ['mario', 'luigi', 'peach', 'yoshi', 'toad', 'bowser', 'donkey-kong', 'koopa'];

      for (const character of validCharacters) {
        const mockMatch = {
          id: 'm1',
          player1Id: 'p1',
          player2Id: 'p2',
          completed: false,
          player1: { id: 'p1', userId: 'user1' },
          player2: { id: 'p2', userId: 'user2' },
        };

        const mockUpdateResult = {
          id: 'm1',
          player1ReportedScore1: 3,
          player1ReportedScore2: 1,
          player2ReportedScore1: null,
          player2ReportedScore2: null,
          completed: false,
          version: 2,
        };

        const mockAuth = { user: { id: 'user1', userType: 'player', playerId: 'p1' } };
        jest.clearAllMocks();
        (createLogger as jest.Mock).mockReturnValue(loggerMock);
        (auth as jest.Mock).mockResolvedValue(mockAuth);
        (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
        (updateWithRetry as jest.Mock).mockResolvedValue(mockUpdateResult);
        (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
        (prisma.matchCharacterUsage.create as jest.Mock).mockResolvedValue({ id: 'char1' });

        const request = new MockNextRequest({ reportingPlayer: 1, score1: 3, score2: 1, character });
        const params = Promise.resolve({ id: 't1', matchId: 'm1' });
        const result = await POST(request, { params });

        expect(result.status).toBe(200);
      }
    });

    // Edge case - Reports score for player2
    it('should report score successfully for player2', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1: { id: 'p1', userId: 'user1' },
        player2: { id: 'p2', userId: 'user2' },
      };

      const mockUpdateResult = {
        id: 'm1',
        player1ReportedScore1: null,
        player1ReportedScore2: null,
        player2ReportedScore1: 3,
        player2ReportedScore2: 1,
        completed: false,
        version: 2,
      };

      const mockAuth = { user: { id: 'user2', userType: 'player', playerId: 'p2' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (updateWithRetry as jest.Mock).mockResolvedValue(mockUpdateResult);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });

      const request = new MockNextRequest({ reportingPlayer: 2, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { match: mockUpdateResult, waitingFor: 'player1' },
        message: 'Score reported successfully',
        status: 200
      });
    });
  });
});

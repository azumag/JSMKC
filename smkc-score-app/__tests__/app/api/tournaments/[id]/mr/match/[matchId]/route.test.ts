/**
 * @module MR Match API Route Tests
 *
 * Test suite for the Match Race (MR) individual match endpoint:
 * /api/tournaments/[id]/mr/match/[matchId]
 *
 * Covers the following HTTP methods and scenarios:
 * - GET: Fetches a single match by its ID with player details included.
 *   Tests include success cases (valid matchId), error cases (match not found, database failure).
 * - PUT: Updates a match score using optimistic locking to prevent concurrent modification
 *   conflicts. Tests include success cases (with/without rounds data, incomplete matches),
 *   validation errors (missing score1/score2/version, non-numeric version), MR-specific score
 *   validation (range [0,4]), optimistic lock conflict (409 status), error cases (database
 *   failure), and edge cases (zero scores, version increment verification).
 *
 * All responses use structured error-handling helpers (createSuccessResponse,
 * createErrorResponse, handleValidationError, handleDatabaseError).
 */
// @ts-nocheck

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));

jest.mock('@/lib/optimistic-locking', () => ({
  updateMRMatchScore: jest.fn(),
  OptimisticLockError: class OptimisticLockError extends Error {
    constructor(message: string, public currentVersion: number) {
      super(message);
      this.name = 'OptimisticLockError';
    }
  },
}));

jest.mock('@/lib/error-handling', () => ({
  createSuccessResponse: jest.fn((data) => ({ data, status: 200 })),
  createErrorResponse: jest.fn((message, status, code, details) => ({ data: { error: message, code, details }, status })),
  handleValidationError: jest.fn((message, field) => ({ data: { error: message, field }, status: 400 })),
  handleDatabaseError: jest.fn((error, operation) => ({ data: { error: `Database error: ${operation}` }, status: 500 })),
}));

jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((data) => data) }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() })) }));
jest.mock('@/lib/score-validation', () => ({
  validateMatchRaceScores: jest.requireActual('@/lib/score-validation').validateMatchRaceScores,
}));
/* Mock qualification-confirmed-check: the match-detail-route factory now checks
 * if qualification is locked before allowing score edits. Return null (= not locked). */
jest.mock('@/lib/qualification-confirmed-check', () => ({
  checkQualificationConfirmed: jest.fn().mockResolvedValue(null),
}));
/* Mock rate-limit: required by the factory's PUT handler */
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ success: true, remaining: 100 }),
}));
/* Mock request-utils: required by the factory's rate-limit integration */
jest.mock('@/lib/request-utils', () => ({
  getClientIdentifier: jest.fn().mockReturnValue('127.0.0.1'),
}));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { updateMRMatchScore, OptimisticLockError } from '@/lib/optimistic-locking';
import { GET, PUT } from '@/app/api/tournaments/[id]/mr/match/[matchId]/route';

const {
  createSuccessResponse,
  createErrorResponse,
  handleValidationError,
  handleDatabaseError,
} = jest.requireMock('@/lib/error-handling');

// Mock NextRequest class
class MockNextRequest {
  constructor(
    private url: string,
    private body?: Record<string, unknown>,
  ) {}
  async json() { return this.body; }
}

describe('MR Match API Route - /api/tournaments/[id]/mr/match/[matchId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });
    // Stage-aware validation: factory calls findUnique({select:{stage:true}}) before validating.
    (prisma.mRMatch as any).findUnique = jest.fn().mockResolvedValue({ stage: 'qualification' });
  });

  describe('GET - Fetch single match', () => {
    // Success case - Returns match with player details
    it('should return match with player details for valid matchId', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        matchNumber: 1,
        stage: 'qualification',
        score1: 3,
        score2: 1,
        completed: true,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1');
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await GET(request, { params });

      expect(result).toEqual({ data: mockMatch, status: 200 });
      expect(createSuccessResponse).toHaveBeenCalledWith(mockMatch);
      expect(prisma.mRMatch.findUnique).toHaveBeenCalledWith({
        where: { id: 'm1' },
        include: { player1: true, player2: true },
      });
    });

    // Error case - Returns 404 when match not found
    it('should return 404 when match does not exist', async () => {
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/nonexistent');
      const params = Promise.resolve({ id: 't1', matchId: 'nonexistent' });
      const result = await GET(request, { params });

      expect(result).toEqual({
        data: { error: 'Match not found', code: 'NOT_FOUND', details: undefined },
        status: 404,
      });
      expect(createErrorResponse).toHaveBeenCalledWith('Match not found', 404, 'NOT_FOUND');
    });

    // Error case - Returns 500 when database query fails
    it('should return 500 when database query fails', async () => {
      (prisma.mRMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1');
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await GET(request, { params });

      expect(result).toEqual({
        data: { error: 'Database error: fetch match' },
        status: 500,
      });
      expect(handleDatabaseError).toHaveBeenCalledWith(expect.any(Error), 'fetch match');
    });
  });

  describe('PUT - Update match score with optimistic locking', () => {
    // Authorization failure case - Returns 403 when user is not authenticated
    it('should return 403 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 3, score2: 1, completed: true, rounds: [1, 2, 3, 4], version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'Forbidden', code: 'FORBIDDEN', details: undefined },
        status: 403,
      });
      expect(createErrorResponse).toHaveBeenCalledWith('Forbidden', 403, 'FORBIDDEN');
    });

    // Authorization failure case - Returns 403 when user is not admin
    it('should return 403 when user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'user1', role: 'member' } });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 3, score2: 1, completed: true, rounds: [1, 2, 3, 4], version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'Forbidden', code: 'FORBIDDEN', details: undefined },
        status: 403,
      });
    });

    // Success case - Updates match score successfully
    it('should update match score with optimistic locking', async () => {
      const mockUpdatedMatch = {
        id: 'm1',
        score1: 3,
        score2: 1,
        completed: true,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      (updateMRMatchScore as jest.Mock).mockResolvedValue({ version: 2 });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockUpdatedMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 3, score2: 1, completed: true, rounds: [1, 2, 3, 4], version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { match: mockUpdatedMatch, version: 2 },
        status: 200,
      });
      expect(createSuccessResponse).toHaveBeenCalledWith({ match: mockUpdatedMatch, version: 2 });
      expect(updateMRMatchScore).toHaveBeenCalledWith(
        prisma, 'm1', 1, 3, 1, true, [1, 2, 3, 4]
      );
    });

    // Success case - Updates match without rounds data
    it('should update match score without rounds data', async () => {
      const mockUpdatedMatch = {
        id: 'm1',
        score1: 2,
        score2: 2,
        completed: true,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      (updateMRMatchScore as jest.Mock).mockResolvedValue({ version: 2 });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockUpdatedMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 2, score2: 2, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(updateMRMatchScore).toHaveBeenCalledWith(
        prisma, 'm1', 1, 2, 2, undefined, undefined
      );
    });

    // Success case - Updates incomplete match (2-2 draw)
    it('should update incomplete match (not completed)', async () => {
      const mockUpdatedMatch = {
        id: 'm1',
        score1: 2,
        score2: 2,
        completed: false,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      (updateMRMatchScore as jest.Mock).mockResolvedValue({ version: 2 });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockUpdatedMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 2, score2: 2, completed: false, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
    });

    // Validation error case - Returns 400 when score1 is missing
    it('should return 400 when score1 is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score2: 1, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'score1 and score2 are required', field: 'scores' },
        status: 400,
      });
      expect(handleValidationError).toHaveBeenCalledWith('score1 and score2 are required', 'scores');
    });

    // Validation error case - Returns 400 when score2 is missing
    it('should return 400 when score2 is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 3, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'score1 and score2 are required', field: 'scores' },
        status: 400,
      });
    });

    // Validation error case - Returns 400 when version is missing
    it('should return 400 when version is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'version is required and must be a number', field: 'version' },
        status: 400,
      });
      expect(handleValidationError).toHaveBeenCalledWith('version is required and must be a number', 'version');
    });

    // Validation error case - Returns 400 when version is not a number
    it('should return 400 when version is not a number', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 3, score2: 1, version: 'not-a-number' });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'version is required and must be a number', field: 'version' },
        status: 400,
      });
    });

    // Validation error case - Rejects out-of-range MR score
    it('should return 400 when score exceeds MAX_RACE_WIN_SCORE', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 5, score2: 0, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'Match race score must be an integer between 0 and 4', field: 'scores' },
        status: 400,
      });
      expect(updateMRMatchScore).not.toHaveBeenCalled();
    });

    // Validation error case - Rejects negative MR score
    it('should return 400 when score is negative', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: -1, score2: 4, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'Match race score must be an integer between 0 and 4', field: 'scores' },
        status: 400,
      });
      expect(updateMRMatchScore).not.toHaveBeenCalled();
    });

    // Optimistic lock conflict case - Returns 409 when version conflict occurs
    it('should return 409 when optimistic lock conflict occurs', async () => {
      (updateMRMatchScore as jest.Mock).mockRejectedValue(new OptimisticLockError('Version conflict', 5));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 3, score2: 1, version: 2 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: {
          error: 'The match was modified by another user. Please refresh and try again.',
          code: 'VERSION_CONFLICT',
          details: { currentVersion: 5 },
        },
        status: 409,
      });
      expect(createErrorResponse).toHaveBeenCalledWith(
        'The match was modified by another user. Please refresh and try again.',
        409,
        'VERSION_CONFLICT',
        { currentVersion: 5 }
      );
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (updateMRMatchScore as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 3, score2: 1, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'Database error: update match' },
        status: 500,
      });
      expect(handleDatabaseError).toHaveBeenCalledWith(expect.any(Error), 'update match');
    });

    // Edge case - Handles clean sweep (0-4)
    it('should handle zero scores correctly', async () => {
      const mockUpdatedMatch = {
        id: 'm1',
        score1: 0,
        score2: 4,
        completed: true,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      (updateMRMatchScore as jest.Mock).mockResolvedValue({ version: 2 });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockUpdatedMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 0, score2: 4, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(updateMRMatchScore).toHaveBeenCalledWith(
        prisma, 'm1', 1, 0, 4, undefined, undefined
      );
    });

    // Edge case - Increments version correctly
    it('should increment version number after successful update', async () => {
      const mockUpdatedMatch = {
        id: 'm1',
        score1: 3,
        score2: 2,
        completed: true,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      (updateMRMatchScore as jest.Mock).mockResolvedValue({ version: 5 });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockUpdatedMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 3, score2: 1, version: 4 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data.version).toBe(5);
    });
  });
});

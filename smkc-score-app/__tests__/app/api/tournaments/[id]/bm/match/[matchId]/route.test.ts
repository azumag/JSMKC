/**
 * @module BM Match API Route Tests
 *
 * Test suite for the individual Battle Mode match endpoint: /api/tournaments/[id]/bm/match/[matchId]
 *
 * This file covers two HTTP methods:
 *   - GET: Retrieves a single battle mode match by matchId, including player1 and player2 details.
 *          Uses the error-handling utility for consistent response formatting.
 *   - PUT: Updates a match score using optimistic locking to prevent concurrent update conflicts.
 *          Accepts score1, score2, version (required), and optional completed/rounds fields.
 *          Returns the updated match with a new version number.
 *
 * Key behaviors tested:
 *   - Successful match retrieval with complete and incomplete match states
 *   - 404 handling when match does not exist (mapped to validation error)
 *   - Database error handling with structured error responses
 *   - Optimistic locking: version validation, 409 conflict responses with currentVersion details
 *   - Input validation: missing scores, missing/invalid version, null values
 *   - Edge cases: zero scores, string version coercion, negative version numbers
 *   - Rounds data passthrough to the optimistic locking update function
 */
// @ts-nocheck


jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));

jest.mock('@/lib/optimistic-locking', () => ({
  updateBMMatchScore: jest.fn(),
  OptimisticLockError: class OptimisticLockError extends Error {
    constructor(message: string, public currentVersion: number) {
      super(message);
      this.name = 'OptimisticLockError';
    }
  }
}));

jest.mock('@/lib/error-handling', () => ({
  createSuccessResponse: jest.fn((data, message) => ({ data, message, status: 200 })),
  createErrorResponse: jest.fn((message, status, code, details) => ({ data: { error: message, code, details }, status })),
  handleValidationError: jest.fn((message, field) => ({ data: { error: message, field }, status: 400 })),
  handleDatabaseError: jest.fn((error, operation) => ({ data: { error: `Database error: ${operation}` }, status: 500 })),
}));

jest.mock('@/lib/sanitize', () => ({
  sanitizeInput: jest.fn((input: unknown) => input),
}));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { updateBMMatchScore, OptimisticLockError } from '@/lib/optimistic-locking';
import { GET, PUT } from '@/app/api/tournaments/[id]/bm/match/[matchId]/route';

const {
  createSuccessResponse: _createSuccessResponse,
  createErrorResponse,
  handleValidationError,
  handleDatabaseError
} = jest.requireMock('@/lib/error-handling');

// Mock NextRequest class
class MockNextRequest {
  constructor(private body?: any, private headers: Map<string, string> = new Map()) {}
  async json() { return this.body; }
}

describe('BM Match API Route - /api/tournaments/[id]/bm/match/[matchId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock auth to return admin user by default for PUT tests
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });
  });

  describe('GET - Retrieve a single battle mode match', () => {
    // Success case - Returns match with player details when match exists
    it('should return match with player1 and player2 details', async () => {
      const mockMatch = {
        id: 'm1',
        matchNumber: 1,
        stage: 'qualification',
        player1Id: 'p1',
        player2Id: 'p2',
        score1: 3,
        score2: 1,
        completed: true,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest();
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await GET(request, { params });

      expect(result).toEqual({
        data: mockMatch,
        message: undefined,
        status: 200
      });
      expect(prisma.bMMatch.findUnique).toHaveBeenCalledWith({
        where: { id: 'm1' },
        include: {
          player1: true,
          player2: true,
        },
      });
    });

    // Success case - Returns match with null scores when not completed
    it('should return match with null scores when match is not completed', async () => {
      const mockMatch = {
        id: 'm1',
        matchNumber: 1,
        stage: 'qualification',
        player1Id: 'p1',
        player2Id: 'p2',
        score1: null,
        score2: null,
        completed: false,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest();
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual(mockMatch);
    });

    // Error case - Returns 404 when match is not found
    it('should return 404 when match does not exist', async () => {
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest();
      const params = Promise.resolve({ id: 't1', matchId: 'nonexistent' });
      const result = await GET(request, { params });

      expect(result).toEqual({
        data: { error: 'Match not found', field: 'matchId' },
        status: 400
      });
      expect(handleValidationError).toHaveBeenCalledWith('Match not found', 'matchId');
    });

    // Error case - Returns 500 when database query fails
    it('should return 500 when database query fails', async () => {
      (prisma.bMMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest();
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await GET(request, { params });

      expect(result).toEqual({
        data: { error: 'Database error: fetch match' },
        status: 500
      });
      expect(handleDatabaseError).toHaveBeenCalledWith(expect.any(Error), 'fetch match');
    });

    // Edge case - Handles invalid matchId format
    it('should handle invalid matchId format gracefully', async () => {
      (prisma.bMMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Invalid UUID'));

      const request = new MockNextRequest();
      const params = Promise.resolve({ id: 't1', matchId: 'invalid-uuid' });
      const result = await GET(request, { params });

      expect(result.status).toBe(500);
      expect(handleDatabaseError).toHaveBeenCalled();
    });

    // Edge case - Returns match with all fields including reported scores
    it('should return match with all available fields including player reported scores', async () => {
      const mockMatch = {
        id: 'm1',
        matchNumber: 1,
        stage: 'qualification',
        player1Id: 'p1',
        player2Id: 'p2',
        score1: 3,
        score2: 1,
        completed: true,
        player1ReportedScore1: 3,
        player1ReportedScore2: 1,
        player2ReportedScore1: 3,
        player2ReportedScore2: 1,
        version: 2,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest();
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual(mockMatch);
    });
  });

  describe('PUT - Update battle mode match score with optimistic locking', () => {
    // Authorization failure case - Returns 403 when user is not authenticated
    it('should return 403 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest({ score1: 3, score2: 1, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'Forbidden', code: 'FORBIDDEN' },
        status: 403
      });
    });

    // Authorization failure case - Returns 403 when user is not admin
    it('should return 403 when user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'user1', role: 'member' } });

      const request = new MockNextRequest({ score1: 3, score2: 1, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'Forbidden', code: 'FORBIDDEN' },
        status: 403
      });
    });

    // Success case - Updates match score with valid version
    it('should update match score and return updated match with version', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        score1: 3,
        score2: 1,
        completed: true,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      const updateResult = { match: mockMatch, version: 2 };

      (updateBMMatchScore as jest.Mock).mockResolvedValue(updateResult);
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue({
        ...mockMatch,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      });

      const request = new MockNextRequest({ score1: 3, score2: 1, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { match: expect.objectContaining({ id: 'm1' }), version: 2 },
        message: undefined,
        status: 200
      });
      expect(updateBMMatchScore).toHaveBeenCalledWith(
        prisma,
        'm1',
        1,
        3,
        1,
        undefined,
        undefined
      );
      expect(prisma.bMMatch.findUnique).toHaveBeenCalledWith({
        where: { id: 'm1' },
        include: { player1: true, player2: true },
      });
    });

    // Success case - Updates match with completed flag explicitly set
    it('should update match score with completed flag', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        score1: 3,
        score2: 1,
        completed: true,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      const updateResult = { match: mockMatch, version: 2 };

      (updateBMMatchScore as jest.Mock).mockResolvedValue(updateResult);
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue({
        ...mockMatch,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      });

      const request = new MockNextRequest({ score1: 3, score2: 1, completed: true, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(updateBMMatchScore).toHaveBeenCalledWith(
        prisma,
        'm1',
        1,
        3,
        1,
        true,
        undefined
      );
    });

    // Success case - Updates match with rounds data
    it('should update match score with rounds data', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        score1: 3,
        score2: 1,
        rounds: [1, 2, 3, 4],
        completed: true,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      const updateResult = { match: mockMatch, version: 2 };

      (updateBMMatchScore as jest.Mock).mockResolvedValue(updateResult);
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue({
        ...mockMatch,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      });

      const request = new MockNextRequest({ score1: 3, score2: 1, rounds: [1, 2, 3, 4], version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(updateBMMatchScore).toHaveBeenCalledWith(
        prisma,
        'm1',
        1,
        3,
        1,
        undefined,
        [1, 2, 3, 4]
      );
    });

    // Validation error case - Returns 400 when score1 is missing
    it('should return 400 when score1 is missing', async () => {
      const request = new MockNextRequest({ score2: 1, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'score1 and score2 are required', field: 'scores' },
        status: 400
      });
      expect(handleValidationError).toHaveBeenCalledWith('score1 and score2 are required', 'scores');
      expect(updateBMMatchScore).not.toHaveBeenCalled();
    });

    // Validation error case - Returns 400 when score2 is missing
    it('should return 400 when score2 is missing', async () => {
      const request = new MockNextRequest({ score1: 3, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'score1 and score2 are required', field: 'scores' },
        status: 400
      });
      expect(handleValidationError).toHaveBeenCalledWith('score1 and score2 are required', 'scores');
      expect(updateBMMatchScore).not.toHaveBeenCalled();
    });

    // Validation error case - Returns 400 when both scores are missing
    it('should return 400 when both score1 and score2 are missing', async () => {
      const request = new MockNextRequest({ version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'score1 and score2 are required', field: 'scores' },
        status: 400
      });
      expect(updateBMMatchScore).not.toHaveBeenCalled();
    });

    // Edge case - null score1 passes validation because source checks `=== undefined` not `=== null`
    // null !== undefined, so null values pass through to the optimistic locking update
    it('should treat null score1 as valid (null !== undefined)', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        score1: null,
        score2: 1,
        completed: false,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      const updateResult = { match: mockMatch, version: 2 };

      (updateBMMatchScore as jest.Mock).mockResolvedValue(updateResult);
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue({
        ...mockMatch,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      });

      const request = new MockNextRequest({ score1: null, score2: 1, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      /* Source code checks `score1 === undefined`, and null !== undefined,
         so null scores pass validation and proceed to the update */
      expect(result.status).toBe(200);
      expect(updateBMMatchScore).toHaveBeenCalledWith(
        prisma,
        'm1',
        1,
        null,
        1,
        undefined,
        undefined
      );
    });

    // Edge case - null score2 passes validation because source checks `=== undefined` not `=== null`
    it('should treat null score2 as valid (null !== undefined)', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        score1: 3,
        score2: null,
        completed: false,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      const updateResult = { match: mockMatch, version: 2 };

      (updateBMMatchScore as jest.Mock).mockResolvedValue(updateResult);
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue({
        ...mockMatch,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      });

      const request = new MockNextRequest({ score1: 3, score2: null, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      /* Source code checks `score2 === undefined`, and null !== undefined,
         so null scores pass validation and proceed to the update */
      expect(result.status).toBe(200);
      expect(updateBMMatchScore).toHaveBeenCalledWith(
        prisma,
        'm1',
        1,
        3,
        null,
        undefined,
        undefined
      );
    });

    // Validation error case - Returns 400 when version is missing
    it('should return 400 when version is missing', async () => {
      const request = new MockNextRequest({ score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'version is required and must be a number', field: 'version' },
        status: 400
      });
      expect(handleValidationError).toHaveBeenCalledWith('version is required and must be a number', 'version');
      expect(updateBMMatchScore).not.toHaveBeenCalled();
    });

    // Validation error case - Returns 400 when version is not a number
    it('should return 400 when version is not a number', async () => {
      const request = new MockNextRequest({ score1: 3, score2: 1, version: 'not-a-number' });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'version is required and must be a number', field: 'version' },
        status: 400
      });
      expect(updateBMMatchScore).not.toHaveBeenCalled();
    });

    // Validation error case - Returns 400 when version is null
    it('should return 400 when version is null', async () => {
      const request = new MockNextRequest({ score1: 3, score2: 1, version: null });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'version is required and must be a number', field: 'version' },
        status: 400
      });
      expect(updateBMMatchScore).not.toHaveBeenCalled();
    });

    // Optimistic locking error case - Returns 409 when version conflicts
    it('should return 409 when optimistic lock error occurs (version conflict)', async () => {
      const lockError = new OptimisticLockError('Match was updated by another user', 3);
      (updateBMMatchScore as jest.Mock).mockRejectedValue(lockError);

      const request = new MockNextRequest({ score1: 3, score2: 1, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: {
          error: 'The match was modified by another user. Please refresh and try again.',
          code: 'VERSION_CONFLICT',
          details: { currentVersion: 3 }
        },
        status: 409
      });
      expect(createErrorResponse).toHaveBeenCalledWith(
        'The match was modified by another user. Please refresh and try again.',
        409,
        'VERSION_CONFLICT',
        { currentVersion: 3 }
      );
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (updateBMMatchScore as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest({ score1: 3, score2: 1, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'Database error: update match' },
        status: 500
      });
      expect(handleDatabaseError).toHaveBeenCalledWith(expect.any(Error), 'update match');
    });

    // Error case - Returns 500 when fetching updated match fails
    it('should return 500 when fetching updated match after update fails', async () => {
      const mockMatch = { id: 'm1', player1Id: 'p1', player2Id: 'p2' };
      const updateResult = { match: mockMatch, version: 2 };

      (updateBMMatchScore as jest.Mock).mockResolvedValue(updateResult);
      (prisma.bMMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Fetch error'));

      const request = new MockNextRequest({ score1: 3, score2: 1, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(500);
      expect(handleDatabaseError).toHaveBeenCalledWith(expect.any(Error), 'update match');
    });

    // Edge case - Handles zero scores
    it('should handle zero scores correctly', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        score1: 0,
        score2: 4,
        completed: true,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      const updateResult = { match: mockMatch, version: 2 };

      (updateBMMatchScore as jest.Mock).mockResolvedValue(updateResult);
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue({
        ...mockMatch,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      });

      const request = new MockNextRequest({ score1: 0, score2: 4, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
    });

    // Edge case - Handles version as a number string (coercion)
    it('should handle version as a number string', async () => {
      const mockMatch = { id: 'm1', player1Id: 'p1', player2Id: 'p2' };
      const updateResult = { match: mockMatch, version: 2 };

      (updateBMMatchScore as jest.Mock).mockResolvedValue(updateResult);
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue({
        ...mockMatch,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      });

      const request = new MockNextRequest({ score1: 3, score2: 1, version: '1' });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      // Version check fails because '1' is a string, not a number
      expect(result).toEqual({
        data: { error: 'version is required and must be a number', field: 'version' },
        status: 400
      });
    });

    // Edge case - Handles negative version number
    it('should handle negative version number', async () => {
      const mockMatch = { id: 'm1', player1Id: 'p1', player2Id: 'p2' };
      const updateResult = { match: mockMatch, version: -1 };

      (updateBMMatchScore as jest.Mock).mockResolvedValue(updateResult);
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue({
        ...mockMatch,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      });

      const request = new MockNextRequest({ score1: 3, score2: 1, version: -1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
    });
  });
});

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
 *   validation errors (missing score1/score2/version, non-numeric version), optimistic lock
 *   conflict (409 status), error cases (database failure), and edge cases (zero scores,
 *   version increment verification).
 *
 * The optimistic locking mechanism ensures that concurrent updates to the same match are
 * detected and rejected with a 409 Conflict response, prompting the client to refresh.
 *
 * Dependencies mocked: @/lib/optimistic-locking, @/lib/sanitize, @/lib/logger, next/server, @/lib/prisma
 */
// @ts-nocheck


jest.mock('@/lib/optimistic-locking', () => ({
  updateMRMatchScore: jest.fn(),
  OptimisticLockError: class OptimisticLockError extends Error {
    constructor(message: string, public currentVersion: number) {
      super(message);
      this.name = 'OptimisticLockError';
    }
  },
}));

jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((data) => data) }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn() })) }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { updateMRMatchScore, OptimisticLockError } from '@/lib/optimistic-locking';
import { GET, PUT } from '@/app/api/tournaments/[id]/mr/match/[matchId]/route';

const sanitizeMock = jest.requireMock('@/lib/sanitize') as { sanitizeInput: jest.Mock };
const NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };

// Mock NextRequest class
class MockNextRequest {
  constructor(
    private url: string,
    private body?: Record<string, unknown>,
    private headers: Map<string, string> = new Map()
  ) {}
  async json() { return this.body; }
  get header() { return { get: (key: string) => this.headers.get(key) }; }
  headers = {
    get: (key: string) => this.headers.get(key)
  };
}

describe('MR Match API Route - /api/tournaments/[id]/mr/match/[matchId]', () => {
  const loggerMock = { error: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: unknown, options?: { status?: number }) => ({ data, status: options?.status || 200 }));
    sanitizeMock.sanitizeInput.mockImplementation((data) => data);
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

      expect(result.data).toEqual(mockMatch);
      expect(result.status).toBe(200);
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

      expect(result.data).toEqual({ error: 'Match not found' });
      expect(result.status).toBe(404);
    });

    // Error case - Returns 500 when database query fails
    it('should return 500 when database query fails', async () => {
      (prisma.mRMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1');
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Failed to fetch match' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch match', { error: expect.any(Error), matchId: 'm1' });
    });
  });

  describe('PUT - Update match score with optimistic locking', () => {
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

      expect(result.data).toEqual({
        success: true,
        data: mockUpdatedMatch,
        version: 2
      });
      expect(result.status).toBe(200);
      expect(updateMRMatchScore).toHaveBeenCalledWith(
        prisma,
        'm1',
        1,
        3,
        1,
        true,
        [1, 2, 3, 4]
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
        prisma,
        'm1',
        1,
        2,
        2,
        undefined,
        undefined
      );
    });

    // Success case - Updates incomplete match
    it('should update incomplete match (not completed)', async () => {
      const mockUpdatedMatch = {
        id: 'm1',
        score1: 2,
        score2: 1,
        completed: false,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      (updateMRMatchScore as jest.Mock).mockResolvedValue({ version: 2 });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockUpdatedMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 2, score2: 1, completed: false, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
    });

    // Validation error case - Returns 400 when score1 is missing
    it('should return 400 when score1 is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score2: 1, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'score1 and score2 are required' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when score2 is missing
    it('should return 400 when score2 is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 3, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'score1 and score2 are required' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when version is missing
    it('should return 400 when version is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'version is required and must be a number' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when version is not a number
    it('should return 400 when version is not a number', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 3, score2: 1, version: 'not-a-number' });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'version is required and must be a number' });
      expect(result.status).toBe(400);
    });

    // Optimistic lock conflict case - Returns 409 when version conflict occurs
    it('should return 409 when optimistic lock conflict occurs', async () => {
      (updateMRMatchScore as jest.Mock).mockRejectedValue(new OptimisticLockError('Version conflict', 5));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 3, score2: 1, version: 2 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({
        success: false,
        error: 'Version conflict',
        message: 'The match was modified by another user. Please refresh and try again.',
        currentVersion: 5
      });
      expect(result.status).toBe(409);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (updateMRMatchScore as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 3, score2: 1, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Failed to update match' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to update match', { error: expect.any(Error), matchId: 'm1' });
    });

    // Edge case - Handles zero scores
    it('should handle zero scores correctly', async () => {
      const mockUpdatedMatch = {
        id: 'm1',
        score1: 0,
        score2: 0,
        completed: true,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      (updateMRMatchScore as jest.Mock).mockResolvedValue({ version: 2 });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockUpdatedMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 0, score2: 0, version: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(updateMRMatchScore).toHaveBeenCalledWith(
        prisma,
        'm1',
        1,
        0,
        0,
        undefined,
        undefined
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

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1', { score1: 3, score2: 2, version: 4 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data.version).toBe(5);
    });
  });
});

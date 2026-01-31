/**
 * @module GP Match API Route Tests - /api/tournaments/[id]/gp/match/[matchId]
 *
 * Test suite for the individual Grand Prix match endpoint. Covers:
 * - GET: Fetching a single GP match by ID with player details.
 * - PUT: Updating match scores using optimistic locking (version field)
 *   to prevent concurrent update conflicts. Returns 409 when the match
 *   has been modified by another user since it was last read.
 *
 * Optimistic locking is critical for tournament operations where multiple
 * admins may be entering scores simultaneously.
 */
// @ts-nocheck


jest.mock('@/lib/optimistic-locking', () => ({
  updateGPMatchScore: jest.fn(),
  OptimisticLockError: class OptimisticLockError extends Error {
    constructor(public currentVersion: number) {
      super('Version conflict');
      this.name = 'OptimisticLockError';
    }
  },
}));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));
jest.mock('@/lib/sanitize', () => ({
  sanitizeInput: jest.fn((input: unknown) => input),
}));

import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { GET, PUT } from '@/app/api/tournaments/[id]/gp/match/[matchId]/route';
import { updateGPMatchScore, OptimisticLockError } from '@/lib/optimistic-locking';

const NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };

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

describe('GP Match API Route - /api/tournaments/[id]/gp/match/[matchId]', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: any, options?: any) => ({ data, status: options?.status || 200 }));
  });

  describe('GET - Fetch single grand prix match', () => {
    // Success case - Returns match with valid match ID
    it('should return match with valid match ID', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        matchNumber: 1,
        stage: 'qualification',
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
        points1: 18,
        points2: 6,
        completed: true,
      };

      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1');
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual(mockMatch);
      expect(result.status).toBe(200);
      expect(prisma.gPMatch.findUnique).toHaveBeenCalledWith({
        where: { id: 'm1' },
        include: { player1: true, player2: true },
      });
    });

    // Not found case - Returns 404 when match is not found
    it('should return 404 when match is not found', async () => {
      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/nonexistent');
      const params = Promise.resolve({ id: 't1', matchId: 'nonexistent' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Match not found' });
      expect(result.status).toBe(404);
    });

    // Error case - Returns 500 when database query fails
    it('should return 500 when database query fails', async () => {
      (prisma.gPMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1');
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Failed to fetch grand prix match' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch GP match', { error: expect.any(Error), matchId: 'm1' });
    });

    // Edge case - Handles invalid match ID gracefully
    it('should handle invalid match ID gracefully', async () => {
      (prisma.gPMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Invalid UUID'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/invalid-id');
      const params = Promise.resolve({ id: 't1', matchId: 'invalid-id' });
      const result = await GET(request, { params });

      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('PUT - Update match score with optimistic locking', () => {
    // Success case - Updates match score with version
    it('should update match score and return new version', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        points1: 18,
        points2: 6,
        completed: true,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      const mockUpdateResult = { version: 2 };
      const races = [
        { course: 'Mario Circuit 1', position1: 1, position2: 2, points1: 9, points2: 6 },
        { course: 'Donut Plains 1', position1: 1, position2: 2, points1: 9, points2: 6 },
        { course: 'Ghost Valley 1', position1: 1, position2: 2, points1: 9, points2: 6 },
        { course: 'Bowser Castle 1', position1: 1, position2: 2, points1: 9, points2: 6 },
      ];

      (updateGPMatchScore as jest.Mock).mockResolvedValue(mockUpdateResult);
      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 18,
        points2: 6,
        completed: true,
        races,
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({
        success: true,
        data: mockMatch,
        version: 2,
      });
      expect(result.status).toBe(200);
      expect(updateGPMatchScore).toHaveBeenCalledWith(
        prisma,
        'm1',
        1,
        18,
        6,
        true,
        races
      );
    });

    // Success case - Updates match without completed flag
    it('should update match score without completed flag', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        points1: 12,
        points2: 12,
        completed: false,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      const mockUpdateResult = { version: 3 };

      (updateGPMatchScore as jest.Mock).mockResolvedValue(mockUpdateResult);
      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 12,
        points2: 12,
        version: 2,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data.success).toBe(true);
      expect(result.status).toBe(200);
      expect(updateGPMatchScore).toHaveBeenCalledWith(
        prisma,
        'm1',
        2,
        12,
        12,
        undefined,
        undefined
      );
    });

    // Version conflict case - Returns 409 when version mismatch occurs
    it('should return 409 conflict error when version mismatch occurs', async () => {
      const conflictError = new OptimisticLockError(5);

      (updateGPMatchScore as jest.Mock).mockRejectedValue(conflictError);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 18,
        points2: 6,
        completed: true,
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({
        success: false,
        error: 'Version conflict',
        message: 'The match was modified by another user. Please refresh and try again.',
        currentVersion: 5,
      });
      expect(result.status).toBe(409);
    });

    // Validation error case - Returns 400 when points1 is missing
    it('should return 400 when points1 is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points2: 6,
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'points1 and points2 are required' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when points2 is missing
    it('should return 400 when points2 is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 18,
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'points1 and points2 are required' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when both points are missing
    it('should return 400 when both points1 and points2 are missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'points1 and points2 are required' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when version is missing
    it('should return 400 when version is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 18,
        points2: 6,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'version is required and must be a number' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when version is not a number
    it('should return 400 when version is not a number', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 18,
        points2: 6,
        version: 'not-a-number',
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'version is required and must be a number' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when version is null
    it('should return 400 when version is null', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 18,
        points2: 6,
        version: null,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'version is required and must be a number' });
      expect(result.status).toBe(400);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (updateGPMatchScore as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 18,
        points2: 6,
        completed: true,
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Failed to update match' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to update match', { error: expect.any(Error), matchId: 'm1' });
    });

    // Edge case - Handles zero points
    it('should handle zero points correctly', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        points1: 0,
        points2: 0,
        completed: false,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      const mockUpdateResult = { version: 2 };

      (updateGPMatchScore as jest.Mock).mockResolvedValue(mockUpdateResult);
      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 0,
        points2: 0,
        completed: false,
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data.success).toBe(true);
      expect(result.status).toBe(200);
    });

    // Edge case - Handles races array being undefined
    it('should handle undefined races array', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        points1: 18,
        points2: 6,
        completed: true,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      const mockUpdateResult = { version: 2 };

      (updateGPMatchScore as jest.Mock).mockResolvedValue(mockUpdateResult);
      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 18,
        points2: 6,
        completed: true,
        version: 1,
        races: undefined,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data.success).toBe(true);
      expect(result.status).toBe(200);
      expect(updateGPMatchScore).toHaveBeenCalledWith(
        prisma,
        'm1',
        1,
        18,
        6,
        true,
        undefined
      );
    });
  });
});

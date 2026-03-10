/**
 * @module GP Match API Route Tests - /api/tournaments/[id]/gp/match/[matchId]
 *
 * Test suite for the individual Grand Prix match endpoint. Covers:
 * - GET: Fetching a single GP match by ID with player details.
 * - PUT: Updating match scores using optimistic locking (version field)
 *   to prevent concurrent update conflicts. Returns 409 when the match
 *   has been modified by another user since it was last read.
 *
 * All responses use structured error-handling helpers (createSuccessResponse,
 * createErrorResponse, handleValidationError, handleDatabaseError).
 */
// @ts-nocheck

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));

jest.mock('@/lib/optimistic-locking', () => ({
  updateGPMatchScore: jest.fn(),
  OptimisticLockError: class OptimisticLockError extends Error {
    constructor(public currentVersion: number) {
      super('Version conflict');
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

jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() })) }));
jest.mock('@/lib/sanitize', () => ({
  sanitizeInput: jest.fn((input: unknown) => input),
}));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { GET, PUT } from '@/app/api/tournaments/[id]/gp/match/[matchId]/route';
import { updateGPMatchScore, OptimisticLockError } from '@/lib/optimistic-locking';

const {
  createSuccessResponse,
  createErrorResponse,
  handleValidationError,
  handleDatabaseError,
} = jest.requireMock('@/lib/error-handling');

class MockNextRequest {
  constructor(
    private url: string,
    private body?: any,
  ) {}
  async json() { return this.body; }
}

describe('GP Match API Route - /api/tournaments/[id]/gp/match/[matchId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });
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

      expect(result).toEqual({ data: mockMatch, status: 200 });
      expect(createSuccessResponse).toHaveBeenCalledWith(mockMatch);
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

      expect(result).toEqual({
        data: { error: 'Match not found', code: 'NOT_FOUND', details: undefined },
        status: 404,
      });
      expect(createErrorResponse).toHaveBeenCalledWith('Match not found', 404, 'NOT_FOUND');
    });

    // Error case - Returns 500 when database query fails
    it('should return 500 when database query fails', async () => {
      (prisma.gPMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1');
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await GET(request, { params });

      expect(result).toEqual({
        data: { error: 'Database error: fetch match' },
        status: 500,
      });
      expect(handleDatabaseError).toHaveBeenCalledWith(expect.any(Error), 'fetch match');
    });

    // Edge case - Handles invalid match ID gracefully
    it('should handle invalid match ID gracefully', async () => {
      (prisma.gPMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Invalid UUID'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/invalid-id');
      const params = Promise.resolve({ id: 't1', matchId: 'invalid-id' });
      const result = await GET(request, { params });

      expect(result.status).toBe(500);
      expect(handleDatabaseError).toHaveBeenCalled();
    });
  });

  describe('PUT - Update match score with optimistic locking', () => {
    // Authorization failure case - Returns 403 when user is not authenticated
    it('should return 403 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 18, points2: 6, completed: true, version: 1,
      });
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

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 18, points2: 6, completed: true, version: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'Forbidden', code: 'FORBIDDEN', details: undefined },
        status: 403,
      });
    });

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

      const races = [
        { course: 'Mario Circuit 1', position1: 1, position2: 2, points1: 9, points2: 6 },
        { course: 'Donut Plains 1', position1: 1, position2: 2, points1: 9, points2: 6 },
        { course: 'Ghost Valley 1', position1: 1, position2: 2, points1: 9, points2: 6 },
        { course: 'Bowser Castle 1', position1: 1, position2: 2, points1: 9, points2: 6 },
      ];

      (updateGPMatchScore as jest.Mock).mockResolvedValue({ version: 2 });
      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 18, points2: 6, completed: true, races, version: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { match: mockMatch, version: 2 },
        status: 200,
      });
      expect(createSuccessResponse).toHaveBeenCalledWith({ match: mockMatch, version: 2 });
      expect(updateGPMatchScore).toHaveBeenCalledWith(
        prisma, 'm1', 1, 18, 6, true, races
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

      (updateGPMatchScore as jest.Mock).mockResolvedValue({ version: 3 });
      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 12, points2: 12, version: 2,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ match: mockMatch, version: 3 });
      expect(result.status).toBe(200);
      expect(updateGPMatchScore).toHaveBeenCalledWith(
        prisma, 'm1', 2, 12, 12, undefined, undefined
      );
    });

    // Version conflict case - Returns 409 when version mismatch occurs
    it('should return 409 conflict error when version mismatch occurs', async () => {
      const conflictError = new OptimisticLockError(5);

      (updateGPMatchScore as jest.Mock).mockRejectedValue(conflictError);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 18, points2: 6, completed: true, version: 1,
      });
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

    // Validation error case - Returns 400 when points1 is missing
    it('should return 400 when points1 is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points2: 6, version: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'points1 and points2 are required', field: 'scores' },
        status: 400,
      });
      expect(handleValidationError).toHaveBeenCalledWith('points1 and points2 are required', 'scores');
    });

    // Validation error case - Returns 400 when points2 is missing
    it('should return 400 when points2 is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 18, version: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'points1 and points2 are required', field: 'scores' },
        status: 400,
      });
    });

    // Validation error case - Returns 400 when both points are missing
    it('should return 400 when both points1 and points2 are missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'points1 and points2 are required', field: 'scores' },
        status: 400,
      });
    });

    // Validation error case - Returns 400 when version is missing
    it('should return 400 when version is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 18, points2: 6,
      });
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
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 18, points2: 6, version: 'not-a-number',
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'version is required and must be a number', field: 'version' },
        status: 400,
      });
    });

    // Validation error case - Returns 400 when version is null
    it('should return 400 when version is null', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 18, points2: 6, version: null,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'version is required and must be a number', field: 'version' },
        status: 400,
      });
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (updateGPMatchScore as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 18, points2: 6, completed: true, version: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result).toEqual({
        data: { error: 'Database error: update match' },
        status: 500,
      });
      expect(handleDatabaseError).toHaveBeenCalledWith(expect.any(Error), 'update match');
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

      (updateGPMatchScore as jest.Mock).mockResolvedValue({ version: 2 });
      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 0, points2: 0, completed: false, version: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ match: mockMatch, version: 2 });
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

      (updateGPMatchScore as jest.Mock).mockResolvedValue({ version: 2 });
      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1', {
        points1: 18, points2: 6, completed: true, version: 1, races: undefined,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ match: mockMatch, version: 2 });
      expect(result.status).toBe(200);
      expect(updateGPMatchScore).toHaveBeenCalledWith(
        prisma, 'm1', 1, 18, 6, true, undefined
      );
    });
  });
});

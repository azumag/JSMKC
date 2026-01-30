/**
 * @module MR Finals Match Update API Route Tests
 *
 * Test suite for the Match Race (MR) individual finals match update endpoint:
 * /api/tournaments/[id]/mr/finals/matches/[matchId]
 *
 * Covers the PUT method for updating a specific finals match score:
 * - Success cases: Updates match with valid scores and rounds data, updates match
 *   without rounds data, and automatically sets completed=true when score reaches 7
 *   (best of 13 format: first to 7).
 * - Authentication failure cases: Returns 401 when user is not authenticated,
 *   session has no user object, or user role is not admin.
 * - Error cases: Returns 404 when match does not exist, returns 500 when database
 *   operation fails.
 * - Validation error cases: Returns 400 for invalid request body (non-numeric scores),
 *   negative scores, or scores exceeding 7.
 * - Edge cases: Handles zero scores correctly, allows setting completed explicitly
 *   to false (for score corrections), and handles non-critical audit log creation
 *   failures gracefully.
 *
 * The rounds data is an array of objects containing course and winner information
 * for each individual race within the match.
 *
 * Dependencies mocked: @/lib/auth, @/lib/audit-log, @/lib/sanitize, @/lib/logger,
 *   next/server, @/lib/prisma
 */
// @ts-nocheck


jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/audit-log', () => ({ createAuditLog: jest.fn(), AUDIT_ACTIONS: { UPDATE_MR_MATCH: 'UPDATE_MR_MATCH' } }));
jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((data) => data) }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { createAuditLog } from '@/lib/audit-log';
import { PUT } from '@/app/api/tournaments/[id]/mr/finals/matches/[matchId]/route';

const sanitizeMock = jest.requireMock('@/lib/sanitize') as { sanitizeInput: jest.Mock };
const auditLogMock = jest.requireMock('@/lib/audit-log') as { createAuditLog: jest.Mock };
const NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };

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

describe('MR Finals Match API Route - /api/tournaments/[id]/mr/finals/matches/[matchId]', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: any, options?: any) => ({ data, status: options?.status || 200 }));
    sanitizeMock.sanitizeInput.mockImplementation((data) => data);
  });

  describe('PUT - Update finals match', () => {
    // Success case - Updates match with valid scores
    it('should update match with valid scores', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockMatch = {
        id: 'm1',
        stage: 'finals',
        score1: 3,
        score2: 1,
        completed: true,
        player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
        player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
      };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (createAuditLog as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches/m1', {
        score1: 3,
        score2: 1,
        completed: true,
        rounds: [{ course: 'MC1', winner: 1 }, { course: 'MC2', winner: 1 }, { course: 'MC3', winner: 2 }, { course: 'MC4', winner: 1 }],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({
        message: 'Match updated successfully',
        match: mockMatch,
      });
      expect(result.status).toBe(200);
      expect(prisma.mRMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: {
          score1: 3,
          score2: 1,
          completed: true,
          rounds: [
            { course: 'MC1', winner: 1 },
            { course: 'MC2', winner: 1 },
            { course: 'MC3', winner: 2 },
            { course: 'MC4', winner: 1 },
          ],
        },
        include: { player1: true, player2: true },
      });
    });

    // Success case - Updates match without rounds data
    // Auto-complete triggers at score >= 7 (MR finals target wins), so scores 3/1 result in completed: false
    it('should update match without rounds data', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockMatch = {
        id: 'm1',
        stage: 'finals',
        score1: 3,
        score2: 1,
        completed: false,
        player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
        player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
      };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (createAuditLog as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches/m1', {
        score1: 3,
        score2: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      // Auto-complete only triggers at score >= 7, so completed is false for score 3/1
      expect(prisma.mRMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: {
          score1: 3,
          score2: 1,
          completed: false,
        },
        include: { player1: true, player2: true },
      });
    });

    // Success case - Automatically sets completed to true when score reaches 7
    it('should automatically set completed to true when score reaches 7', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockMatch = {
        id: 'm1',
        stage: 'finals',
        score1: 7,
        score2: 3,
        completed: true,
        player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
        player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
      };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (createAuditLog as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches/m1', {
        score1: 7,
        score2: 3,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(prisma.mRMatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            completed: true,
          }),
        })
      );
    });

    // Authentication failure case - Returns 401 when user is not authenticated
    it('should return 401 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches/m1', {
        score1: 3,
        score2: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(401);
    });

    // Authentication failure case - Returns 401 when user has no user object
    it('should return 401 when session exists but user is missing', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: null });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches/m1', {
        score1: 3,
        score2: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(401);
    });

    // Authentication failure case - Returns 401 when user is not admin
    it('should return 401 when user role is not admin', async () => {
      const mockAuth = { user: { id: 'player1', role: 'player' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches/m1', {
        score1: 3,
        score2: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(401);
    });

    // Error case - Returns 404 when match not found
    it('should return 404 when match does not exist', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches/nonexistent', {
        score1: 3,
        score2: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'nonexistent' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ error: 'Match not found' });
      expect(result.status).toBe(404);
    });

    // Validation error case - Returns 400 for invalid request body
    it('should return 400 for invalid request body', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches/m1', {
        score1: 'invalid',
        score2: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when score1 is negative
    it('should return 400 when score1 is negative', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches/m1', {
        score1: -1,
        score2: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when score1 exceeds 7
    it('should return 400 when score1 exceeds 7', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches/m1', {
        score1: 8,
        score2: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(400);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      (prisma.mRMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches/m1', {
        score1: 3,
        score2: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ error: 'Failed to update match' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to update match', { error: expect.any(Error), tournamentId: 't1', matchId: 'm1' });
    });

    // Edge case - Updates with zero scores
    it('should handle zero scores correctly', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockMatch = {
        id: 'm1',
        stage: 'finals',
        score1: 0,
        score2: 0,
        completed: false,
        player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
        player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
      };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (createAuditLog as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches/m1', {
        score1: 0,
        score2: 0,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
    });

    // Edge case - Sets completed explicitly to false
    it('should allow setting completed explicitly to false', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockMatch = {
        id: 'm1',
        stage: 'finals',
        score1: 3,
        score2: 2,
        completed: false,
        player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
        player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
      };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (createAuditLog as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches/m1', {
        score1: 3,
        score2: 2,
        completed: false,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(prisma.mRMatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            completed: false,
          }),
        })
      );
    });

    // Edge case - Audit log failure is non-critical
    it('should continue when audit log creation fails', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockMatch = {
        id: 'm1',
        stage: 'finals',
        score1: 3,
        score2: 1,
        completed: true,
        player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
        player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
      };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (createAuditLog as jest.Mock).mockRejectedValue(new Error('Audit log failed'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches/m1', {
        score1: 3,
        score2: 1,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(loggerMock.warn).toHaveBeenCalledWith('Failed to create audit log', expect.any(Object));
    });
  });
});

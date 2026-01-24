// @ts-nocheck


jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('@/lib/rate-limit', () => ({ getServerSideIdentifier: jest.fn() }));
jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((data) => data) }));
jest.mock('@/lib/audit-log', () => ({ createAuditLog: jest.fn(), AUDIT_ACTIONS: { UPDATE_BM_MATCH: 'UPDATE_BM_MATCH' } }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { PUT } from '@/app/api/tournaments/[id]/bm/finals/matches/[matchId]/route';

const rateLimitMock = jest.requireMock('@/lib/rate-limit') as { getServerSideIdentifier: jest.Mock };
const sanitizeMock = jest.requireMock('@/lib/sanitize') as { sanitizeInput: jest.Mock };
const auditLogMock = jest.requireMock('@/lib/audit-log') as { createAuditLog: jest.Mock, AUDIT_ACTIONS: { UPDATE_BM_MATCH: string } };
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

describe('BM Finals Match API Route - /api/tournaments/[id]/bm/finals/matches/[matchId]', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: any, options?: any) => ({ data, status: options?.status || 200 }));
    rateLimitMock.getServerSideIdentifier.mockResolvedValue('test-ip');
  });

  describe('PUT - Update finals match', () => {
    // Success case - Updates match score with valid data and admin auth
    it('should update match score with valid data and admin authentication', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        stage: 'finals',
        score1: 0,
        score2: 0,
        completed: false,
        player1: mockPlayer1,
        player2: mockPlayer2,
      };
      
      const mockUpdatedMatch = {
        ...mockMatch,
        score1: 5,
        score2: 3,
        completed: true,
      };
      
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue(mockUpdatedMatch);
      
      const requestBody = {
        score1: 5,
        score2: 3,
        completed: true,
      };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches/m1', requestBody, new Map([['user-agent', 'test-agent']]));
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });
      
      expect(result.status).toBe(200);
      expect(result.data.message).toBe('Match updated successfully');
      expect(result.data.match).toEqual(mockUpdatedMatch);
      expect(prisma.bMMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: {
          score1: 5,
          score2: 3,
          completed: true,
        },
        include: { player1: true, player2: true },
      });
      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith({
        userId: 'admin1',
        ipAddress: 'test-ip',
        userAgent: 'test-agent',
        action: auditLogMock.AUDIT_ACTIONS.UPDATE_BM_MATCH,
        targetId: 'm1',
        targetType: 'BMMatch',
        details: {
          tournamentId: 't1',
          player1Nickname: 'P1',
          player2Nickname: 'P2',
          score1: 5,
          score2: 3,
          completed: true,
        },
      });
    });

    // Success case - Auto-completes match when score reaches target wins (5)
    it('should auto-complete match when score reaches target wins', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockMatch = {
        id: 'm1',
        score1: 0,
        score2: 0,
        completed: false,
        player1: mockPlayer1,
        player2: mockPlayer2,
      };
      
      const mockUpdatedMatch = {
        ...mockMatch,
        score1: 5,
        score2: 2,
        completed: true,
      };
      
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue(mockUpdatedMatch);
      
      const requestBody = { score1: 5, score2: 2 };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches/m1', requestBody);
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });
      
      expect(result.status).toBe(200);
      expect(prisma.bMMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: {
          score1: 5,
          score2: 2,
          completed: true,
        },
        include: { player1: true, player2: true },
      });
    });

    // Success case - Auto-completes when player 2 reaches target wins
    it('should auto-complete when player 2 reaches target wins', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockMatch = {
        id: 'm1',
        score1: 0,
        score2: 0,
        completed: false,
        player1: mockPlayer1,
        player2: mockPlayer2,
      };
      
      const mockUpdatedMatch = { ...mockMatch, score1: 2, score2: 5, completed: true };
      
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue(mockUpdatedMatch);
      
      const requestBody = { score1: 2, score2: 5 };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches/m1', requestBody);
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });
      
      expect(result.status).toBe(200);
      expect(prisma.bMMatch.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ completed: true }),
      }));
    });

    // Success case - Updates match with rounds data
    it('should update match with rounds data when provided', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockMatch = {
        id: 'm1',
        score1: 0,
        score2: 0,
        completed: false,
        player1: mockPlayer1,
        player2: mockPlayer2,
      };
      
      const mockUpdatedMatch = { ...mockMatch, score1: 3, score2: 2, completed: false, rounds: [{ arena: 'A1', winner: 1 }] };
      
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue(mockUpdatedMatch);
      
      const requestBody = {
        score1: 3,
        score2: 2,
        rounds: [
          { arena: 'A1', winner: 1 },
          { arena: 'A2', winner: 2 },
          { arena: 'A3', winner: 1 },
        ],
      };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches/m1', requestBody);
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });
      
      expect(result.status).toBe(200);
      expect(prisma.bMMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: {
          score1: 3,
          score2: 2,
          completed: false,
          rounds: [
            { arena: 'A1', winner: 1 },
            { arena: 'A2', winner: 2 },
            { arena: 'A3', winner: 1 },
          ],
        },
        include: { player1: true, player2: true },
      });
    });

    // Success case - Updates match without auto-completing when below target
    it('should not auto-complete when scores are below target wins', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockMatch = {
        id: 'm1',
        score1: 0,
        score2: 0,
        completed: false,
        player1: mockPlayer1,
        player2: mockPlayer2,
      };
      
      const mockUpdatedMatch = { ...mockMatch, score1: 3, score2: 4, completed: false };
      
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue(mockUpdatedMatch);
      
      const requestBody = { score1: 3, score2: 4 };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches/m1', requestBody);
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });
      
      expect(result.status).toBe(200);
      expect(prisma.bMMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: {
          score1: 3,
          score2: 4,
          completed: false,
        },
        include: { player1: true, player2: true },
      });
    });

    // Success case - Manually completes match even when scores are below target
    it('should manually complete match when completed flag is set to true', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockMatch = {
        id: 'm1',
        score1: 2,
        score2: 2,
        completed: false,
        player1: mockPlayer1,
        player2: mockPlayer2,
      };
      
      const mockUpdatedMatch = { ...mockMatch, completed: true };
      
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue(mockUpdatedMatch);
      
      const requestBody = { score1: 2, score2: 2, completed: true };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches/m1', requestBody);
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });
      
      expect(result.status).toBe(200);
      expect(prisma.bMMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: {
          score1: 2,
          score2: 2,
          completed: true,
        },
        include: { player1: true, player2: true },
      });
    });

    // Authentication failure case - Returns 401 when not authenticated
    it('should return 401 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);
      
      const requestBody = { score1: 3, score2: 2 };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches/m1', requestBody);
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });
      
      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(401);
      expect(prisma.bMMatch.findUnique).not.toHaveBeenCalled();
    });

    // Authentication failure case - Returns 401 when user has no user object
    it('should return 401 when session exists but user is missing', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: null });
      
      const requestBody = { score1: 3, score2: 2 };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches/m1', requestBody);
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });
      
      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(401);
    });

    // Authorization failure case - Returns 401 when user is not admin
    it('should return 401 when user is not an admin', async () => {
      const mockAuth = { user: { id: 'user1', role: 'user' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const requestBody = { score1: 3, score2: 2 };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches/m1', requestBody);
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });
      
      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(401);
    });

    // Validation error case - Returns 400 when score1 is out of range
    it('should return 400 when score1 is out of valid range (0-5)', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const requestBody = { score1: 6, score2: 2 };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches/m1', requestBody);
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });
      
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when score2 is out of range
    it('should return 400 when score2 is out of valid range (0-5)', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const requestBody = { score1: 3, score2: -1 };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches/m1', requestBody);
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });
      
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when rounds data is invalid
    it('should return 400 when rounds data contains invalid arena', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const requestBody = {
        score1: 3,
        score2: 2,
        rounds: [{ arena: 123, winner: 1 }],
      };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches/m1', requestBody);
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });
      
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when rounds data contains invalid winner
    it('should return 400 when rounds data contains invalid winner', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const requestBody = {
        score1: 3,
        score2: 2,
        rounds: [{ arena: 'A1', winner: 3 }],
      };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches/m1', requestBody);
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });
      
      expect(result.status).toBe(400);
    });

    // Not found case - Returns 404 when match does not exist
    it('should return 404 when match is not found', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(null);
      
      const requestBody = { score1: 3, score2: 2 };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches/m1', requestBody);
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });
      
      expect(result.data).toEqual({ error: 'Match not found' });
      expect(result.status).toBe(404);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      (prisma.bMMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const requestBody = { score1: 3, score2: 2 };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches/m1', requestBody);
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });
      
      expect(result.data).toEqual({ error: 'Failed to update match' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to update match', { error: expect.any(Error), tournamentId: 't1', matchId: 'm1' });
    });

    // Edge case - Handles invalid JSON in request body
    it('should handle invalid JSON in request body', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockRequest = {
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
        headers: { get: jest.fn() },
      } as any;
      
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(mockRequest, { params });
      
      expect(result.status).toBe(500);
    });

    // Edge case - Uses x-forwarded-for header for IP address
    it('should use x-forwarded-for header for IP address when available', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockMatch = {
        id: 'm1',
        score1: 0,
        score2: 0,
        completed: false,
        player1: mockPlayer1,
        player2: mockPlayer2,
      };
      
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue({ ...mockMatch, completed: true });
      
      const requestBody = { score1: 5, score2: 3 };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches/m1', requestBody, new Map([['x-forwarded-for', '192.168.1.1'], ['user-agent', 'test-agent']]));
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });
      
      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        ipAddress: '192.168.1.1',
      }));
    });

    // Edge case - Audit log failure is non-critical
    it('should continue even if audit log creation fails', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockMatch = {
        id: 'm1',
        score1: 0,
        score2: 0,
        completed: false,
        player1: mockPlayer1,
        player2: mockPlayer2,
      };
      
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue({ ...mockMatch, completed: true });
      auditLogMock.createAuditLog.mockRejectedValue(new Error('Audit log failed'));
      
      const requestBody = { score1: 5, score2: 3 };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches/m1', requestBody);
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });
      
      expect(result.status).toBe(200);
      expect(loggerMock.warn).toHaveBeenCalledWith('Failed to create audit log', expect.any(Object));
    });

    // Edge case - Handles zero scores correctly
    it('should handle zero scores correctly', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockMatch = {
        id: 'm1',
        score1: 0,
        score2: 0,
        completed: false,
        player1: mockPlayer1,
        player2: mockPlayer2,
      };
      
      const mockUpdatedMatch = { ...mockMatch };
      
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue(mockUpdatedMatch);
      
      const requestBody = { score1: 0, score2: 0 };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches/m1', requestBody);
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await PUT(request, { params });
      
      expect(result.status).toBe(200);
    });
  });
});

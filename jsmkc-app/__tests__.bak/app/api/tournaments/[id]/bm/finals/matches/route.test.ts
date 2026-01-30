// @ts-nocheck


jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('@/lib/rate-limit', () => ({ getServerSideIdentifier: jest.fn() }));
jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((data) => data) }));
jest.mock('@/lib/audit-log', () => ({ createAuditLog: jest.fn(), AUDIT_ACTIONS: { CREATE_BM_MATCH: 'CREATE_BM_MATCH' } }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { POST } from '@/app/api/tournaments/[id]/bm/finals/matches/route';

const rateLimitMock = jest.requireMock('@/lib/rate-limit') as { getServerSideIdentifier: jest.Mock };
const sanitizeMock = jest.requireMock('@/lib/sanitize') as { sanitizeInput: jest.Mock };
const auditLogMock = jest.requireMock('@/lib/audit-log') as { createAuditLog: jest.Mock, AUDIT_ACTIONS: { CREATE_BM_MATCH: string } };
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

describe('BM Finals Matches API Route - /api/tournaments/[id]/bm/finals/matches', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: any, options?: any) => ({ data, status: options?.status || 200 }));
    rateLimitMock.getServerSideIdentifier.mockResolvedValue('test-ip');
  });

  describe('POST - Create finals match', () => {
    // Success case - Creates finals match with valid data and admin auth
    it('should create a finals match with valid data and admin authentication', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockCreatedMatch = {
        id: 'm1',
        tournamentId: 't1',
        matchNumber: 1,
        stage: 'finals',
        player1: mockPlayer1,
        player2: mockPlayer2,
      };
      
      (prisma.player.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockPlayer1)
        .mockResolvedValueOnce(mockPlayer2);
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.bMMatch.create as jest.Mock).mockResolvedValue(mockCreatedMatch);
      
      const requestBody = {
        player1Id: 'p1',
        player2Id: 'p2',
        player1Side: 1,
        player2Side: 2,
        tvNumber: 1,
        bracket: 'winners',
        bracketPosition: 'QF1',
        isGrandFinal: false,
      };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', requestBody, new Map([['user-agent', 'test-agent']]));
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(201);
      expect(result.data.message).toBe('Match created successfully');
      expect(result.data.match).toEqual(mockCreatedMatch);
      expect(prisma.bMMatch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tournamentId: 't1',
          matchNumber: 1,
          stage: 'finals',
          round: 'QF1',
          tvNumber: 1,
          player1Id: 'p1',
          player2Id: 'p2',
          player1Side: 1,
          player2Side: 2,
          bracket: 'winners',
          bracketPosition: 'QF1',
          isGrandFinal: false,
          completed: false,
          score1: 0,
          score2: 0,
          losses: 0,
          rounds: {},
        }),
        include: { player1: true, player2: true },
      });
      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith({
        userId: 'admin1',
        ipAddress: 'test-ip',
        userAgent: 'test-agent',
        action: auditLogMock.AUDIT_ACTIONS.CREATE_BM_MATCH,
        targetId: 'm1',
        targetType: 'BMMatch',
        details: {
          tournamentId: 't1',
          player1Nickname: 'P1',
          player2Nickname: 'P2',
          bracket: 'winners',
          bracketPosition: 'QF1',
          isGrandFinal: false,
        },
      });
    });

    // Success case - Uses default values for optional fields
    it('should use default values for optional fields when not provided', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockCreatedMatch = { id: 'm1', player1: mockPlayer1, player2: mockPlayer2 };
      
      (prisma.player.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockPlayer1)
        .mockResolvedValueOnce(mockPlayer2);
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.bMMatch.create as jest.Mock).mockResolvedValue(mockCreatedMatch);
      
      const requestBody = {
        player1Id: 'p1',
        player2Id: 'p2',
      };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', requestBody);
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(201);
      expect(prisma.bMMatch.create).toHaveBeenCalledWith(expect.objectContaining({
        player1Side: 1,
        player2Side: 2,
        bracket: 'winners',
        isGrandFinal: false,
      }));
    });

    // Success case - Increments match number based on existing matches
    it('should calculate match number based on existing matches', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockPlayer1 = { id: 'p1', name: 'Player 1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2' };
      const mockLastMatch = { matchNumber: 5 };
      const mockCreatedMatch = { id: 'm1', matchNumber: 6, player1: mockPlayer1, player2: mockPlayer2 };
      
      (prisma.player.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockPlayer1)
        .mockResolvedValueOnce(mockPlayer2);
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(mockLastMatch);
      (prisma.bMMatch.create as jest.Mock).mockResolvedValue(mockCreatedMatch);
      
      const requestBody = { player1Id: 'p1', player2Id: 'p2' };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', requestBody);
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(201);
      expect(prisma.bMMatch.create).toHaveBeenCalledWith(expect.objectContaining({
        matchNumber: 6,
      }));
    });

    // Authentication failure case - Returns 401 when not authenticated
    it('should return 401 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);
      
      const requestBody = { player1Id: 'p1', player2Id: 'p2' };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', requestBody);
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(401);
      expect(prisma.player.findUnique).not.toHaveBeenCalled();
    });

    // Authentication failure case - Returns 401 when user has no user object
    it('should return 401 when session exists but user is missing', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: null });
      
      const requestBody = { player1Id: 'p1', player2Id: 'p2' };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', requestBody);
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(401);
    });

    // Authorization failure case - Returns 401 when user is not admin
    it('should return 401 when user is not an admin', async () => {
      const mockAuth = { user: { id: 'user1', role: 'user' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const requestBody = { player1Id: 'p1', player2Id: 'p2' };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', requestBody);
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(401);
    });

    // Validation error case - Returns 400 when player1Id is invalid UUID
    it('should return 400 when player1Id is not a valid UUID', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const requestBody = { player1Id: 'invalid-uuid', player2Id: 'p2' };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', requestBody);
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(400);
      expect(result.data.error).toBeDefined();
    });

    // Validation error case - Returns 400 when player2Id is invalid UUID
    it('should return 400 when player2Id is not a valid UUID', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const requestBody = { player1Id: 'p1', player2Id: 'not-a-uuid' };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', requestBody);
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when player1Side is out of range
    it('should return 400 when player1Side is out of valid range (1-2)', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const requestBody = { player1Id: 'p1', player2Id: 'p2', player1Side: 3 };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', requestBody);
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when bracket is invalid
    it('should return 400 when bracket value is invalid', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const requestBody = { player1Id: 'p1', player2Id: 'p2', bracket: 'invalid' };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', requestBody);
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when player1Id is missing
    it('should return 400 when player1Id is missing', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const requestBody = { player2Id: 'p2' };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', requestBody);
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when player2Id is missing
    it('should return 400 when player2Id is missing', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const requestBody = { player1Id: 'p1' };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', requestBody);
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(400);
    });

    // Not found case - Returns 404 when player1 does not exist
    it('should return 404 when player1 is not found', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      (prisma.player.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'p2', name: 'Player 2' });
      
      const requestBody = { player1Id: 'p1', player2Id: 'p2' };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', requestBody);
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'One or both players not found' });
      expect(result.status).toBe(404);
    });

    // Not found case - Returns 404 when player2 does not exist
    it('should return 404 when player2 is not found', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      (prisma.player.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'p1', name: 'Player 1' })
        .mockResolvedValueOnce(null);
      
      const requestBody = { player1Id: 'p1', player2Id: 'p2' };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', requestBody);
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'One or both players not found' });
      expect(result.status).toBe(404);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      (prisma.player.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const requestBody = { player1Id: 'p1', player2Id: 'p2' };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', requestBody);
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Failed to create match' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to create match', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Handles invalid JSON in request body
    it('should handle invalid JSON in request body', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockRequest = {
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
        headers: { get: jest.fn() },
      } as any;
      
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(mockRequest, { params });
      
      expect(result.status).toBe(500);
    });

    // Edge case - Uses x-forwarded-for header for IP address
    it('should use x-forwarded-for header for IP address when available', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockCreatedMatch = { id: 'm1', player1: mockPlayer1, player2: mockPlayer2 };
      
      (prisma.player.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockPlayer1)
        .mockResolvedValueOnce(mockPlayer2);
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.bMMatch.create as jest.Mock).mockResolvedValue(mockCreatedMatch);
      
      const requestBody = { player1Id: 'p1', player2Id: 'p2' };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', requestBody, new Map([['x-forwarded-for', '192.168.1.1'], ['user-agent', 'test-agent']]));
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        ipAddress: '192.168.1.1',
      }));
    });

    // Edge case - Uses x-real-ip header when x-forwarded-for is not available
    it('should use x-real-ip header when x-forwarded-for is not available', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockCreatedMatch = { id: 'm1', player1: mockPlayer1, player2: mockPlayer2 };
      
      (prisma.player.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockPlayer1)
        .mockResolvedValueOnce(mockPlayer2);
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.bMMatch.create as jest.Mock).mockResolvedValue(mockCreatedMatch);
      
      const requestBody = { player1Id: 'p1', player2Id: 'p2' };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', requestBody, new Map([['x-real-ip', '10.0.0.1'], ['user-agent', 'test-agent']]));
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        ipAddress: '10.0.0.1',
      }));
    });

    // Edge case - Falls back to 'unknown' when no IP headers available
    it('should fall back to "unknown" when no IP headers are available', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockCreatedMatch = { id: 'm1', player1: mockPlayer1, player2: mockPlayer2 };
      
      (prisma.player.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockPlayer1)
        .mockResolvedValueOnce(mockPlayer2);
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.bMMatch.create as jest.Mock).mockResolvedValue(mockCreatedMatch);
      
      const requestBody = { player1Id: 'p1', player2Id: 'p2' };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', requestBody);
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        ipAddress: 'unknown',
      }));
    });

    // Edge case - Audit log failure is non-critical
    it('should continue even if audit log creation fails', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockCreatedMatch = { id: 'm1', player1: mockPlayer1, player2: mockPlayer2 };
      
      (prisma.player.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockPlayer1)
        .mockResolvedValueOnce(mockPlayer2);
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.bMMatch.create as jest.Mock).mockResolvedValue(mockCreatedMatch);
      auditLogMock.createAuditLog.mockRejectedValue(new Error('Audit log failed'));
      
      const requestBody = { player1Id: 'p1', player2Id: 'p2' };
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', requestBody);
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(201);
      expect(loggerMock.warn).toHaveBeenCalledWith('Failed to create audit log', expect.any(Object));
    });
  });
});

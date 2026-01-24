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
import { GET, POST, PUT } from '@/app/api/tournaments/[id]/bm/route';

const rateLimitMock = jest.requireMock('@/lib/rate-limit') as { getServerSideIdentifier: jest.Mock };
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

describe('BM API Route - /api/tournaments/[id]/bm', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    NextResponseMock.json.mockImplementation((data: any, options?: any) => ({ data, status: options?.status || 200 }));
    rateLimitMock.getServerSideIdentifier.mockResolvedValue('test-ip');
  });

  describe('GET - Fetch battle mode qualification data', () => {
    // Success case - Returns qualifications and matches with valid tournament ID
    it('should return qualifications and matches for a valid tournament', async () => {
      const mockQualifications = [
        { id: 'q1', tournamentId: 't1', playerId: 'p1', group: 'A', score: 6, points: 10, player: { id: 'p1', name: 'Player 1' } },
      ];
      const mockMatches = [
        { id: 'm1', tournamentId: 't1', matchNumber: 1, stage: 'qualification', player1: { id: 'p1', name: 'Player 1' }, player2: { id: 'p2', name: 'Player 2' } },
      ];
      
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.data).toEqual({ qualifications: mockQualifications, matches: mockMatches });
      expect(result.status).toBe(200);
      expect(prisma.bMQualification.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player: true },
        orderBy: [{ group: 'asc' }, { score: 'desc' }, { points: 'desc' }],
      });
      expect(prisma.bMMatch.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: 'qualification' },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });
    });

    // Success case - Returns empty arrays when no data exists
    it('should return empty arrays when no qualifications or matches exist', async () => {
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.data).toEqual({ qualifications: [], matches: [] });
      expect(result.status).toBe(200);
    });

    // Error case - Returns 500 when database query fails
    it('should return 500 error when database query fails', async () => {
      (prisma.bMQualification.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.data).toEqual({ error: 'Failed to fetch battle mode data' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch BM data', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Handles invalid tournament ID gracefully
    it('should handle invalid tournament ID gracefully', async () => {
      (prisma.bMQualification.findMany as jest.Mock).mockRejectedValue(new Error('Invalid UUID'));
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/invalid-id/bm');
      const params = Promise.resolve({ id: 'invalid-id' });
      const result = await GET(request, { params });
      
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('POST - Setup battle mode qualification', () => {
    // Success case - Creates qualifications and matches with authenticated admin
    it('should create qualifications and round-robin matches with valid players array', async () => {
      const mockAuth = { user: { id: 'admin1', name: 'Admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockPlayers = [
        { playerId: 'p1', group: 'A', seeding: 1 },
        { playerId: 'p2', group: 'A', seeding: 2 },
      ];
      const mockQualifications = [{ id: 'q1', tournamentId: 't1', playerId: 'p1', group: 'A' }];
      
      (prisma.bMQualification.create as jest.Mock).mockResolvedValue({ id: 'q1' });
      (prisma.bMMatch.create as jest.Mock).mockResolvedValue({ id: 'm1' });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm', { players: mockPlayers });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ message: 'Battle mode setup complete', qualifications: expect.any(Array) });
      expect(result.status).toBe(201);
      expect(prisma.bMQualification.deleteMany).toHaveBeenCalledWith({ where: { tournamentId: 't1' } });
      expect(prisma.bMMatch.deleteMany).toHaveBeenCalledWith({ where: { tournamentId: 't1', stage: 'qualification' } });
      expect(prisma.bMQualification.create).toHaveBeenCalledTimes(2);
      expect(prisma.bMMatch.create).toHaveBeenCalledTimes(1);
      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith({
        userId: 'admin1',
        ipAddress: 'test-ip',
        userAgent: 'unknown',
        action: 'CREATE_BM_MATCH',
        targetId: 't1',
        targetType: 'Tournament',
        details: { mode: 'qualification', playerCount: 2 },
      });
    });

    // Success case - Handles multiple groups correctly
    it('should generate matches for multiple groups separately', async () => {
      const mockAuth = { user: { id: 'admin1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockPlayers = [
        { playerId: 'p1', group: 'A' },
        { playerId: 'p2', group: 'A' },
        { playerId: 'p3', group: 'B' },
        { playerId: 'p4', group: 'B' },
      ];
      
      (prisma.bMQualification.create as jest.Mock).mockResolvedValue({ id: 'q1' });
      (prisma.bMMatch.create as jest.Mock).mockResolvedValue({ id: 'm1' });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm', { players: mockPlayers });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(201);
      expect(prisma.bMMatch.create).toHaveBeenCalledTimes(2);
      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        details: { mode: 'qualification', playerCount: 4 }
      }));
    });

    // Authentication failure case - Returns 401 when user is not authenticated
    it('should return 401 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm', { players: [] });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ success: false, error: 'Unauthorized' });
      expect(result.status).toBe(401);
      expect(prisma.bMQualification.deleteMany).not.toHaveBeenCalled();
    });

    // Authentication failure case - Returns 401 when user has no user object
    it('should return 401 when session exists but user is missing', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: null });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm', { players: [] });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ success: false, error: 'Unauthorized' });
      expect(result.status).toBe(401);
    });

    // Validation error case - Returns 400 when players array is missing
    it('should return 400 when players array is missing', async () => {
      const mockAuth = { user: { id: 'admin1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm', {});
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Players array is required' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when players array is not an array
    it('should return 400 when players is not an array', async () => {
      const mockAuth = { user: { id: 'admin1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm', { players: 'not-an-array' });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Players array is required' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when players array is empty
    it('should return 400 when players array is empty', async () => {
      const mockAuth = { user: { id: 'admin1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm', { players: [] });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Players array is required' });
      expect(result.status).toBe(400);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      const mockAuth = { user: { id: 'admin1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      (prisma.bMQualification.deleteMany as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm', { players: [{ playerId: 'p1', group: 'A' }] });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Failed to setup battle mode' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to setup BM', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Audit log failure is non-critical
    it('should continue even if audit log creation fails', async () => {
      const mockAuth = { user: { id: 'admin1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      (prisma.bMQualification.create as jest.Mock).mockResolvedValue({ id: 'q1' });
      (prisma.bMMatch.create as jest.Mock).mockResolvedValue({ id: 'm1' });
      auditLogMock.createAuditLog.mockRejectedValue(new Error('Audit log failed'));
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm', { players: [{ playerId: 'p1', group: 'A' }] });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(201);
      expect(loggerMock.warn).toHaveBeenCalledWith('Failed to create audit log', expect.any(Object));
    });
  });

  describe('PUT - Update match score', () => {
    // Success case - Updates match score and recalculates qualifications
    it('should update match score and recalculate player qualifications', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        score1: 3,
        score2: 1,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };
      
      const mockPlayer1Matches = [mockMatch];
      const mockPlayer2Matches = [mockMatch];
      
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bMQualification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });
      
      expect(result.data).toEqual({ match: mockMatch, result1: 'win', result2: 'loss' });
      expect(result.status).toBe(200);
      expect(prisma.bMMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { score1: 3, score2: 1, rounds: null, completed: true },
        include: { player1: true, player2: true },
      });
      expect(prisma.bMQualification.updateMany).toHaveBeenCalledTimes(2);
    });

    // Success case - Calculates tie result correctly
    it('should handle tie results correctly', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };
      
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bMQualification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm', { matchId: 'm1', score1: 2, score2: 2 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });
      
      expect(result.data).toEqual({ match: mockMatch, result1: 'tie', result2: 'tie' });
      expect(result.status).toBe(200);
    });

    // Success case - Handles incomplete match (total rounds != 4)
    it('should handle incomplete match (total rounds not equal to 4)', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };
      
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bMQualification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm', { matchId: 'm1', score1: 2, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });
      
      expect(result.data).toEqual({ match: mockMatch, result1: 'tie', result2: 'tie' });
    });

    // Success case - Includes rounds data when provided
    it('should include rounds data when provided', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };
      
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bMQualification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm', { matchId: 'm1', score1: 3, score2: 1, rounds: [1, 2, 3, 4] });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });
      
      expect(prisma.bMMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { score1: 3, score2: 1, rounds: [1, 2, 3, 4], completed: true },
        include: { player1: true, player2: true },
      });
    });

    // Validation error case - Returns 400 when matchId is missing
    it('should return 400 when matchId is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm', { score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });
      
      expect(result.data).toEqual({ error: 'matchId, score1, and score2 are required' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when score1 is missing
    it('should return 400 when score1 is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm', { matchId: 'm1', score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });
      
      expect(result.data).toEqual({ error: 'matchId, score1, and score2 are required' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when score2 is missing
    it('should return 400 when score2 is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm', { matchId: 'm1', score1: 3 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });
      
      expect(result.data).toEqual({ error: 'matchId, score1, and score2 are required' });
      expect(result.status).toBe(400);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (prisma.bMMatch.update as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });
      
      expect(result.data).toEqual({ error: 'Failed to update match' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to update match', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Recalculates stats correctly for multiple matches
    it('should recalculate stats correctly when player has multiple completed matches', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };
      
      const mockPlayer1Matches = [
        { ...mockMatch, id: 'm1', score1: 3, score2: 1, player1Id: 'p1', player2Id: 'p2' },
        { id: 'm2', score1: 2, score2: 2, player1Id: 'p1', player2Id: 'p3' },
      ];
      const mockPlayer2Matches = [
        { id: 'm1', score1: 3, score2: 1, player1Id: 'p1', player2Id: 'p2' },
      ];
      
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.findMany as jest.Mock)
        .mockResolvedValueOnce(mockPlayer1Matches)
        .mockResolvedValueOnce(mockPlayer2Matches);
      (prisma.bMQualification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });
      
      expect(result.status).toBe(200);
      expect(prisma.bMQualification.updateMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', playerId: 'p1' },
        data: expect.objectContaining({
          mp: 2,
          wins: 1,
          ties: 1,
          losses: 0,
          score: 3,
        }),
      });
    });
  });
});

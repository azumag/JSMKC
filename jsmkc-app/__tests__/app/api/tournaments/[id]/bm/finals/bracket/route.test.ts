// @ts-nocheck
jest.mock('@/lib/prisma', () => ({
  default: {
    bMQualification: { findMany: jest.fn() },
    bMMatch: { findMany: jest.fn() },
  },
}));

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('@/lib/rate-limit', () => ({ getServerSideIdentifier: jest.fn() }));
jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((data) => data) }));
jest.mock('@/lib/audit-log', () => ({ createAuditLog: jest.fn(), AUDIT_ACTIONS: { CREATE_BRACKET: 'CREATE_BRACKET' } }));
jest.mock('@/lib/tournament/double-elimination', () => ({ generateDoubleEliminationBracket: jest.fn() }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { generateDoubleEliminationBracket } from '@/lib/tournament/double-elimination';
import { GET, POST } from '@/app/api/tournaments/[id]/bm/finals/bracket/route';

const rateLimitMock = jest.requireMock('@/lib/rate-limit') as { getServerSideIdentifier: jest.Mock };
const sanitizeMock = jest.requireMock('@/lib/sanitize') as { sanitizeInput: jest.Mock };
const auditLogMock = jest.requireMock('@/lib/audit-log') as { createAuditLog: jest.Mock, AUDIT_ACTIONS: { CREATE_BRACKET: string } };
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

describe('BM Finals Bracket API Route - /api/tournaments/[id]/bm/finals/bracket', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: any, options?: any) => ({ data, status: options?.status || 200 }));
    rateLimitMock.getServerSideIdentifier.mockResolvedValue('test-ip');
  });

  describe('GET - Fetch finals bracket', () => {
    // Success case - Returns bracket with matches and players
    it('should return bracket data with matches and qualified players', async () => {
      const mockQualifications = [
        {
          id: 'q1',
          tournamentId: 't1',
          playerId: 'p1',
          score: 10,
          points: 20,
          player: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'P1',
          },
        },
        {
          id: 'q2',
          tournamentId: 't1',
          playerId: 'p2',
          score: 9,
          points: 18,
          player: {
            id: 'p2',
            name: 'Player 2',
            nickname: 'P2',
          },
        },
      ];
      
      const mockMatches = [
        {
          id: 'm1',
          tournamentId: 't1',
          matchNumber: 1,
          stage: 'finals',
          player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
          player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
        },
      ];
      
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.status).toBe(200);
      expect(result.data.matches).toEqual(mockMatches);
      expect(result.data.players).toHaveLength(2);
      expect(result.data.totalPlayers).toBe(2);
      expect(result.data.players[0]).toEqual({
        playerId: 'p1',
        playerName: 'Player 1',
        playerNickname: 'P1',
        qualifyingRank: 1,
        losses: 0,
        points: 20,
      });
      expect(prisma.bMQualification.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player: true },
        orderBy: [{ score: 'desc' }, { points: 'desc' }],
      });
      expect(prisma.bMMatch.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: 'finals' },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });
    });

    // Success case - Returns empty arrays when no data exists
    it('should return empty arrays when no bracket data exists', async () => {
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.status).toBe(200);
      expect(result.data.matches).toEqual([]);
      expect(result.data.players).toEqual([]);
      expect(result.data.totalPlayers).toBe(0);
    });

    // Success case - Correctly assigns qualifying ranks based on order
    it('should assign qualifying ranks based on qualification order', async () => {
      const mockQualifications = [
        { playerId: 'p1', score: 10, points: 20, player: { id: 'p1', name: 'Player 1', nickname: 'P1' } },
        { playerId: 'p2', score: 9, points: 18, player: { id: 'p2', name: 'Player 2', nickname: 'P2' } },
        { playerId: 'p3', score: 8, points: 16, player: { id: 'p3', name: 'Player 3', nickname: 'P3' } },
      ];
      
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.data.players[0].qualifyingRank).toBe(1);
      expect(result.data.players[1].qualifyingRank).toBe(2);
      expect(result.data.players[2].qualifyingRank).toBe(3);
    });

    // Error case - Returns 500 when database query fails
    it('should return 500 error when database query fails', async () => {
      (prisma.bMQualification.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.data).toEqual({ error: 'Failed to fetch bracket' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch bracket', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Handles invalid tournament ID gracefully
    it('should handle invalid tournament ID gracefully', async () => {
      (prisma.bMQualification.findMany as jest.Mock).mockRejectedValue(new Error('Invalid UUID'));
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/invalid-id/bm/finals/bracket');
      const params = Promise.resolve({ id: 'invalid-id' });
      const result = await GET(request, { params });
      
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('POST - Generate bracket', () => {
    // Success case - Generates bracket from qualification results with admin auth
    it('should generate double-elimination bracket with admin authentication', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockQualifications = [
        {
          id: 'q1',
          tournamentId: 't1',
          playerId: 'p1',
          score: 10,
          points: 20,
          player: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'P1',
          },
        },
        {
          id: 'q2',
          tournamentId: 't1',
          playerId: 'p2',
          score: 9,
          points: 18,
          player: {
            id: 'p2',
            name: 'Player 2',
            nickname: 'P2',
          },
        },
      ];
      
      const mockGeneratedBracket = {
        winnerBracket: [{ matchNumber: 1, player1: 'p1', player2: 'p2' }],
        loserBracket: [],
        grandFinal: null,
      };
      
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (generateDoubleEliminationBracket as jest.Mock).mockReturnValue(mockGeneratedBracket);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket', null, new Map([['user-agent', 'test-agent']]));
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(200);
      expect(result.data).toEqual(mockGeneratedBracket);
      expect(generateDoubleEliminationBracket).toHaveBeenCalledWith(
        [
          {
            playerId: 'p1',
            playerName: 'Player 1',
            playerNickname: 'P1',
            qualifyingRank: 1,
            losses: 0,
            points: 20,
          },
          {
            playerId: 'p2',
            playerName: 'Player 2',
            playerNickname: 'P2',
            qualifyingRank: 2,
            losses: 0,
            points: 18,
          },
        ],
        'BM'
      );
      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith({
        userId: 'admin1',
        ipAddress: 'test-ip',
        userAgent: 'test-agent',
        action: auditLogMock.AUDIT_ACTIONS.CREATE_BRACKET,
        targetId: 't1',
        targetType: 'Tournament',
        details: {
          tournamentId: 't1',
          bracketSize: 2,
          winnerCount: 1,
          loserCount: 0,
        },
      });
    });

    // Success case - Generates bracket for all qualified players
    it('should generate bracket including all qualified players', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockQualifications = [
        { playerId: 'p1', score: 10, points: 20, player: { id: 'p1', name: 'Player 1', nickname: 'P1' } },
        { playerId: 'p2', score: 9, points: 18, player: { id: 'p2', name: 'Player 2', nickname: 'P2' } },
        { playerId: 'p3', score: 8, points: 16, player: { id: 'p3', name: 'Player 3', nickname: 'P3' } },
        { playerId: 'p4', score: 7, points: 14, player: { id: 'p4', name: 'Player 4', nickname: 'P4' } },
      ];
      
      const mockGeneratedBracket = {
        winnerBracket: [
          { matchNumber: 1, player1: 'p1', player2: 'p4' },
          { matchNumber: 2, player1: 'p2', player2: 'p3' },
        ],
        loserBracket: [],
        grandFinal: null,
      };
      
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (generateDoubleEliminationBracket as jest.Mock).mockReturnValue(mockGeneratedBracket);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(200);
      expect(generateDoubleEliminationBracket).toHaveBeenCalledWith(expect.any(Array), 'BM');
      expect(generateDoubleEliminationBracket).toHaveBeenCalledWith(expect.objectContaining({ length: 4 }), 'BM');
    });

    // Authentication failure case - Returns 401 when not authenticated
    it('should return 401 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(401);
      expect(prisma.bMQualification.findMany).not.toHaveBeenCalled();
    });

    // Authentication failure case - Returns 401 when user has no user object
    it('should return 401 when session exists but user is missing', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: null });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(401);
    });

    // Authorization failure case - Returns 401 when user is not admin
    it('should return 401 when user is not an admin', async () => {
      const mockAuth = { user: { id: 'user1', role: 'user' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(401);
    });

    // Validation error case - Returns 400 when no qualification results found
    it('should return 400 when no qualification results exist', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([]);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'No qualification results found' });
      expect(result.status).toBe(400);
      expect(generateDoubleEliminationBracket).not.toHaveBeenCalled();
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      (prisma.bMQualification.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Failed to generate bracket' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to generate bracket', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Error case - Returns 500 when bracket generation fails
    it('should return 500 when bracket generation function throws error', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockQualifications = [
        { playerId: 'p1', score: 10, points: 20, player: { id: 'p1', name: 'Player 1', nickname: 'P1' } },
      ];
      
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (generateDoubleEliminationBracket as jest.Mock).mockImplementation(() => {
        throw new Error('Bracket generation failed');
      });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Failed to generate bracket' });
      expect(result.status).toBe(500);
    });

    // Edge case - Uses x-forwarded-for header for IP address
    it('should use x-forwarded-for header for IP address when available', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockQualifications = [
        { playerId: 'p1', score: 10, points: 20, player: { id: 'p1', name: 'Player 1', nickname: 'P1' } },
      ];
      
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (generateDoubleEliminationBracket as jest.Mock).mockReturnValue({
        winnerBracket: [],
        loserBracket: [],
        grandFinal: null,
      });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket', null, new Map([['x-forwarded-for', '192.168.1.1'], ['user-agent', 'test-agent']]));
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        ipAddress: '192.168.1.1',
      }));
    });

    // Edge case - Audit log failure is non-critical
    it('should continue even if audit log creation fails', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockQualifications = [
        { playerId: 'p1', score: 10, points: 20, player: { id: 'p1', name: 'Player 1', nickname: 'P1' } },
      ];
      
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (generateDoubleEliminationBracket as jest.Mock).mockReturnValue({
        winnerBracket: [],
        loserBracket: [],
        grandFinal: null,
      });
      auditLogMock.createAuditLog.mockRejectedValue(new Error('Audit log failed'));
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(200);
      expect(loggerMock.warn).toHaveBeenCalledWith('Failed to create audit log', expect.any(Object));
    });

    // Edge case - Correctly passes tournament mode 'BM' to bracket generator
    it('should pass correct tournament mode "BM" to bracket generator', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockQualifications = [
        { playerId: 'p1', score: 10, points: 20, player: { id: 'p1', name: 'Player 1', nickname: 'P1' } },
      ];
      
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (generateDoubleEliminationBracket as jest.Mock).mockReturnValue({
        winnerBracket: [],
        loserBracket: [],
        grandFinal: null,
      });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(generateDoubleEliminationBracket).toHaveBeenCalledWith(expect.any(Array), 'BM');
    });

    // Edge case - All players have zero losses initially
    it('should initialize all players with zero losses', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);
      
      const mockQualifications = [
        { playerId: 'p1', score: 10, points: 20, player: { id: 'p1', name: 'Player 1', nickname: 'P1' } },
        { playerId: 'p2', score: 9, points: 18, player: { id: 'p2', name: 'Player 2', nickname: 'P2' } },
      ];
      
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (generateDoubleEliminationBracket as jest.Mock).mockReturnValue({
        winnerBracket: [],
        loserBracket: [],
        grandFinal: null,
      });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      const playersArg = (generateDoubleEliminationBracket as jest.Mock).mock.calls[0][0];
      expect(playersArg[0].losses).toBe(0);
      expect(playersArg[1].losses).toBe(0);
    });
  });
});

/**
 * @module MR Finals Bracket API Route Tests
 *
 * Test suite for the Match Race (MR) finals bracket endpoint:
 * /api/tournaments/[id]/mr/finals/bracket
 *
 * Covers the following HTTP methods and scenarios:
 * - GET: Fetches bracket data including finals matches and qualified players with
 *   their ranking information. Tests include success cases (bracket with matches and
 *   players, empty bracket, players ordered by qualifying rank), and error cases
 *   (database query failure returning 500).
 * - POST: Generates a double elimination bracket from qualification standings.
 *   Requires admin authentication. Tests include success cases (generates bracket
 *   with winner/loser brackets and grand final), authentication failure cases
 *   (not authenticated, missing user object, non-admin role), validation errors
 *   (no qualification results found), error cases (bracket generation failure),
 *   and edge cases (single player bracket, bracket with grand final, non-critical
 *   audit log failure, qualification ordering by score desc then points desc).
 *
 * The bracket generation uses the double elimination algorithm from
 * @/lib/tournament/double-elimination, which produces winner bracket, loser bracket,
 * and grand final match structures.
 *
 * Dependencies mocked: @/lib/auth, @/lib/tournament/double-elimination,
 *   @/lib/audit-log, @/lib/logger, next/server, @/lib/prisma
 */
// @ts-nocheck


jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/tournament/double-elimination', () => ({
  generateDoubleEliminationBracket: jest.fn(() => ({
    winnerBracket: [],
    loserBracket: [],
    grandFinal: null,
  })),
}));
jest.mock('@/lib/audit-log', () => ({ createAuditLog: jest.fn(), AUDIT_ACTIONS: { CREATE_BRACKET: 'CREATE_BRACKET' } }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { generateDoubleEliminationBracket } from '@/lib/tournament/double-elimination';
import { createAuditLog } from '@/lib/audit-log';
import { GET, POST } from '@/app/api/tournaments/[id]/mr/finals/bracket/route';

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

describe('MR Finals Bracket API Route - /api/tournaments/[id]/mr/finals/bracket', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: any, options?: any) => ({ data, status: options?.status || 200 }));
  });

  describe('GET - Fetch bracket data', () => {
    // Success case - Returns bracket with matches and players
    it('should return bracket data with matches and players', async () => {
      const mockMatches = [
        { id: 'm1', matchNumber: 1, stage: 'finals', player1: { id: 'p1' }, player2: { id: 'p8' } },
      ];

      const mockQualifications = [
        { id: 'q1', playerId: 'p1', score: 10, points: 20, player: { id: 'p1', name: 'Player 1', nickname: 'P1' } },
        { id: 'q2', playerId: 'p2', score: 8, points: 16, player: { id: 'p2', name: 'Player 2', nickname: 'P2' } },
      ];

      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({
        matches: mockMatches,
        players: [
          { playerId: 'p1', playerName: 'Player 1', playerNickname: 'P1', qualifyingRank: 1, losses: 0, points: 20 },
          { playerId: 'p2', playerName: 'Player 2', playerNickname: 'P2', qualifyingRank: 2, losses: 0, points: 16 },
        ],
        totalPlayers: 2,
      });
      expect(result.status).toBe(200);
    });

    // Success case - Returns empty bracket when no matches exist
    it('should return empty bracket when no matches exist', async () => {
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({
        matches: [],
        players: [],
        totalPlayers: 0,
      });
      expect(result.status).toBe(200);
    });

    // Success case - Orders players by qualifying rank
    it('should order players by qualification rank', async () => {
      const mockQualifications = [
        { id: 'q1', playerId: 'p1', score: 10, points: 20, player: { id: 'p1', name: 'Player 1', nickname: 'P1' } },
        { id: 'q2', playerId: 'p2', score: 8, points: 16, player: { id: 'p2', name: 'Player 2', nickname: 'P2' } },
        { id: 'q3', playerId: 'p3', score: 6, points: 12, player: { id: 'p3', name: 'Player 3', nickname: 'P3' } },
      ];

      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data.players[0].qualifyingRank).toBe(1);
      expect(result.data.players[1].qualifyingRank).toBe(2);
      expect(result.data.players[2].qualifyingRank).toBe(3);
    });

    // Error case - Returns 500 when database query fails
    it('should return 500 when database query fails', async () => {
      (prisma.mRMatch.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Failed to fetch bracket' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch bracket', { error: expect.any(Error), tournamentId: 't1' });
    });
  });

  describe('POST - Generate bracket', () => {
    // Success case - Generates double elimination bracket
    it('should generate double elimination bracket', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockQualifications = [
        { id: 'q1', playerId: 'p1', score: 10, points: 20, player: { id: 'p1', name: 'Player 1', nickname: 'P1' } },
        { id: 'q2', playerId: 'p2', score: 8, points: 16, player: { id: 'p2', name: 'Player 2', nickname: 'P2' } },
      ];

      const mockBracket = {
        winnerBracket: [{ matchId: 'm1', player1: 'p1', player2: 'p8' }],
        loserBracket: [],
        grandFinal: null,
      };

      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (generateDoubleEliminationBracket as jest.Mock).mockReturnValue(mockBracket);
      (createAuditLog as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({
        winnerBracket: mockBracket.winnerBracket,
        loserBracket: mockBracket.loserBracket,
        grandFinal: mockBracket.grandFinal,
        totalPlayers: 2,
      });
      expect(result.status).toBe(200);
      expect(generateDoubleEliminationBracket).toHaveBeenCalledWith(
        [
          { playerId: 'p1', playerName: 'Player 1', playerNickname: 'P1', qualifyingRank: 1, losses: 0, points: 20 },
          { playerId: 'p2', playerName: 'Player 2', playerNickname: 'P2', qualifyingRank: 2, losses: 0, points: 16 },
        ],
        'MR'
      );
    });

    // Authentication failure case - Returns 401 when user is not authenticated
    it('should return 401 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(401);
    });

    // Authentication failure case - Returns 401 when user has no user object
    it('should return 401 when session exists but user is missing', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: null });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(401);
    });

    // Authentication failure case - Returns 401 when user is not admin
    it('should return 401 when user role is not admin', async () => {
      const mockAuth = { user: { id: 'player1', role: 'player' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(401);
    });

    // Validation error case - Returns 400 when no qualification results found
    it('should return 400 when no qualification results found', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ error: 'No qualification results found' });
      expect(result.status).toBe(400);
    });

    // Error case - Returns 500 when bracket generation fails
    it('should return 500 when bracket generation fails', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockQualifications = [
        { id: 'q1', playerId: 'p1', score: 10, points: 20, player: { id: 'p1', name: 'Player 1', nickname: 'P1' } },
      ];

      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (generateDoubleEliminationBracket as jest.Mock).mockRejectedValue(new Error('Bracket generation error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ error: 'Failed to generate bracket' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to generate bracket', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Generates bracket for single player
    it('should generate bracket for single player', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockQualifications = [
        { id: 'q1', playerId: 'p1', score: 10, points: 20, player: { id: 'p1', name: 'Player 1', nickname: 'P1' } },
      ];

      const mockBracket = {
        winnerBracket: [],
        loserBracket: [],
        grandFinal: null,
      };

      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (generateDoubleEliminationBracket as jest.Mock).mockReturnValue(mockBracket);
      (createAuditLog as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(200);
      expect(result.data.totalPlayers).toBe(1);
    });

    // Edge case - Generates bracket with grand final
    it('should generate bracket with grand final', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockQualifications = [
        { id: 'q1', playerId: 'p1', score: 10, points: 20, player: { id: 'p1', name: 'Player 1', nickname: 'P1' } },
        { id: 'q2', playerId: 'p2', score: 8, points: 16, player: { id: 'p2', name: 'Player 2', nickname: 'P2' } },
      ];

      const mockBracket = {
        winnerBracket: [{ matchId: 'm1' }],
        loserBracket: [{ matchId: 'm2' }],
        grandFinal: { matchId: 'm3' },
      };

      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (generateDoubleEliminationBracket as jest.Mock).mockReturnValue(mockBracket);
      (createAuditLog as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({
        winnerBracket: mockBracket.winnerBracket,
        loserBracket: mockBracket.loserBracket,
        grandFinal: mockBracket.grandFinal,
        totalPlayers: 2,
      });
    });

    // Edge case - Audit log failure is non-critical
    it('should continue when audit log creation fails', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockQualifications = [
        { id: 'q1', playerId: 'p1', score: 10, points: 20, player: { id: 'p1', name: 'Player 1', nickname: 'P1' } },
      ];

      const mockBracket = {
        winnerBracket: [],
        loserBracket: [],
        grandFinal: null,
      };

      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (generateDoubleEliminationBracket as jest.Mock).mockReturnValue(mockBracket);
      (createAuditLog as jest.Mock).mockRejectedValue(new Error('Audit log failed'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(200);
      expect(loggerMock.warn).toHaveBeenCalledWith('Failed to create audit log', expect.any(Object));
    });

    // Edge case - Orders qualifications by score desc, points desc
    it('should order qualifications by score descending, then points descending', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockQualifications = [
        { id: 'q1', playerId: 'p1', score: 10, points: 20, player: { id: 'p1', name: 'Player 1', nickname: 'P1' } },
        { id: 'q2', playerId: 'p2', score: 10, points: 16, player: { id: 'p2', name: 'Player 2', nickname: 'P2' } },
        { id: 'q3', playerId: 'p3', score: 8, points: 16, player: { id: 'p3', name: 'Player 3', nickname: 'P3' } },
      ];

      const mockBracket = { winnerBracket: [], loserBracket: [], grandFinal: null };

      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (generateDoubleEliminationBracket as jest.Mock).mockReturnValue(mockBracket);
      (createAuditLog as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      await POST(request, { params });

      expect(prisma.mRQualification.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player: true },
        orderBy: [{ score: 'desc' }, { points: 'desc' }],
      });
    });
  });
});

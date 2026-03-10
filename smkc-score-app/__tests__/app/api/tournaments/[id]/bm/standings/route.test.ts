/**
 * @module BM Standings API Route Tests
 *
 * Test suite for the Battle Mode standings endpoint: /api/tournaments/[id]/bm/standings
 *
 * This file covers the GET method which retrieves BM qualification standings
 * with server-side caching support via ETag and Cache-Control headers.
 * BM uses the non-paginated path with H2H tiebreaker (§4.1 step 3).
 *
 * Key behaviors tested:
 *   - Cached standings retrieval when cache is valid (with _cached flag and ETag header)
 *   - Fresh data fetching when cache is unavailable or expired
 *   - Cache bypass via If-None-Match: * header
 *   - Authentication enforcement: 403 for unauthenticated/non-admin
 *   - Error handling and graceful degradation
 *   - H2H tiebreaker for tied players within same group
 *   - Rank computation and transform
 */
// @ts-nocheck


jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/standings-cache', () => ({
  get: jest.fn(),
  set: jest.fn(),
  isExpired: jest.fn(() => false),
  generateETag: jest.fn(() => 'etag-123'),
}));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn() })) }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import _prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { get, set, isExpired, generateETag } from '@/lib/standings-cache';
import { GET } from '@/app/api/tournaments/[id]/bm/standings/route';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _NextResponseMock = jest.requireMock('next/server') as any;

// Mock NextRequest class
class MockNextRequest {
  private _url: string;
  private _headersMap: Map<string, string>;
  headers: { get: (key: string) => string | null };

  constructor(url: string, headers?: Map<string, string>) {
    this._url = url;
    this._headersMap = headers || new Map();
    this.headers = {
      get: (key: string) => this._headersMap.get(key) ?? null
    };
  }
  get url() { return this._url; }
}

describe('BM Standings API Route - /api/tournaments/[id]/bm/standings', () => {
  const loggerMock = { error: jest.fn() };
  const prisma = jest.requireMock('@/lib/prisma').default;

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: any, options?: any) => ({ data, status: options?.status || 200, headers: options?.headers }));
  });

  describe('GET - Fetch BM standings with caching', () => {
    it('should return cached standings when cache is valid', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });

      const cachedData = {
        data: [
          { id: 'q1', playerId: 'p1', group: 'A', score: 6, points: 10 },
          { id: 'q2', playerId: 'p2', group: 'A', score: 4, points: 8 },
        ],
        etag: 'etag-123',
        timestamp: Date.now(),
      };

      (get as jest.Mock).mockResolvedValue(cachedData);
      (isExpired as jest.Mock).mockReturnValue(false);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const result = await GET(request, { params: Promise.resolve({ id: 't1' }) });

      expect(result.data).toEqual({ ...cachedData.data, _cached: true });
      expect(result.headers).toEqual({
        'ETag': 'etag-123',
        'Cache-Control': 'public, max-age=300',
      });
      expect(get).toHaveBeenCalledWith('t1', 'qualification');
    });

    it('should fetch fresh data when cache is not available', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });

      const mockQualifications = [
        { id: 'q1', playerId: 'p1', group: 'A', score: 6, points: 4, mp: 3, wins: 3, ties: 0, losses: 0, winRounds: 10, lossRounds: 2, player: { name: 'Player 1', nickname: 'P1' } },
        { id: 'q2', playerId: 'p2', group: 'A', score: 4, points: 2, mp: 3, wins: 2, ties: 0, losses: 1, winRounds: 8, lossRounds: 4, player: { name: 'Player 2', nickname: 'P2' } },
      ];

      (get as jest.Mock).mockResolvedValue(null);
      prisma.bMQualification.findMany.mockResolvedValue(mockQualifications);
      // No H2H matches needed (no ties)
      (set as jest.Mock).mockResolvedValue(undefined);
      (generateETag as jest.Mock).mockReturnValue('new-etag-123');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const result = await GET(request, { params: Promise.resolve({ id: 't1' }) });

      expect(result.data.tournamentId).toBe('t1');
      expect(result.data.stage).toBe('qualification');
      expect(result.data.qualifications).toHaveLength(2);
      expect(result.data.qualifications[0]).toEqual({
        rank: 1,
        playerId: 'p1',
        playerName: 'Player 1',
        playerNickname: 'P1',
        group: 'A',
        matchesPlayed: 3,
        wins: 3,
        ties: 0,
        losses: 0,
        winRounds: 10,
        lossRounds: 2,
        points: 4,
        score: 6,
      });
      expect(result.data.qualifications[1].rank).toBe(2);
      expect(prisma.bMQualification.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player: true },
        orderBy: [{ group: 'asc' }, { score: 'desc' }, { points: 'desc' }],
      });
    });

    it('should fetch fresh data when cache is expired', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });

      const cachedData = {
        data: [],
        etag: 'old-etag',
        timestamp: Date.now() - 400000,
      };

      (get as jest.Mock).mockResolvedValue(cachedData);
      (isExpired as jest.Mock).mockReturnValue(true);
      prisma.bMQualification.findMany.mockResolvedValue([]);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const result = await GET(request, { params: Promise.resolve({ id: 't1' }) });

      expect(result.data.tournamentId).toBe('t1');
      expect(result.data.qualifications).toEqual([]);
      expect(prisma.bMQualification.findMany).toHaveBeenCalled();
    });

    it('should bypass cache when If-None-Match header is *', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });

      const cachedData = {
        data: [],
        etag: 'etag-123',
        timestamp: Date.now(),
      };

      (get as jest.Mock).mockResolvedValue(cachedData);
      (isExpired as jest.Mock).mockReturnValue(false);
      prisma.bMQualification.findMany.mockResolvedValue([]);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings', new Map([['if-none-match', '*']]));
      const result = await GET(request, { params: Promise.resolve({ id: 't1' }) });

      expect(result.data.tournamentId).toBe('t1');
      expect(prisma.bMQualification.findMany).toHaveBeenCalled();
    });

    // Authentication tests
    it('should return 403 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const result = await GET(request, { params: Promise.resolve({ id: 't1' }) });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
    });

    it('should return 403 when session exists but user is missing', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: null });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const result = await GET(request, { params: Promise.resolve({ id: 't1' }) });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
    });

    it('should return 403 when user role is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'player1', role: 'player' } });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const result = await GET(request, { params: Promise.resolve({ id: 't1' }) });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
    });

    it('should return 403 when user role is undefined', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'user1' } });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const result = await GET(request, { params: Promise.resolve({ id: 't1' }) });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
    });

    // Error handling
    it('should return 500 when findMany fails', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });

      (get as jest.Mock).mockResolvedValue(null);
      prisma.bMQualification.findMany.mockRejectedValue(new Error('DB error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const result = await GET(request, { params: Promise.resolve({ id: 't1' }) });

      expect(result.data).toEqual({ success: false, error: 'Failed to fetch BM standings', code: 'INTERNAL_ERROR' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch BM standings', { error: expect.any(Error), tournamentId: 't1' });
    });

    it('should return 500 when cache get operation fails', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });

      (get as jest.Mock).mockRejectedValue(new Error('Cache error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const result = await GET(request, { params: Promise.resolve({ id: 't1' }) });

      expect(result.data).toEqual({ success: false, error: 'Failed to fetch BM standings', code: 'INTERNAL_ERROR' });
      expect(result.status).toBe(500);
    });

    // Edge cases
    it('should handle empty standings correctly', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });

      (get as jest.Mock).mockResolvedValue(null);
      prisma.bMQualification.findMany.mockResolvedValue([]);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const result = await GET(request, { params: Promise.resolve({ id: 't1' }) });

      expect(result.data.qualifications).toEqual([]);
      expect(result.status).toBe(200);
    });

    it('should generate and set ETag correctly for fresh data', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });

      const mockQualifications = [
        { id: 'q1', playerId: 'p1', group: 'A', score: 6, points: 4, mp: 3, wins: 3, ties: 0, losses: 0, winRounds: 10, lossRounds: 2, player: { name: 'Player 1', nickname: 'P1' } },
      ];

      (get as jest.Mock).mockResolvedValue(null);
      prisma.bMQualification.findMany.mockResolvedValue(mockQualifications);
      (set as jest.Mock).mockResolvedValue(undefined);
      (generateETag as jest.Mock).mockReturnValue('generated-etag-456');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      await GET(request, { params: Promise.resolve({ id: 't1' }) });

      expect(generateETag).toHaveBeenCalledWith(mockQualifications);
      expect(set).toHaveBeenCalledWith('t1', 'qualification', mockQualifications, 'generated-etag-456');
    });

    it('should include ISO timestamp in lastUpdated field', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });

      (get as jest.Mock).mockResolvedValue(null);
      prisma.bMQualification.findMany.mockResolvedValue([]);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const result = await GET(request, { params: Promise.resolve({ id: 't1' }) });

      expect(result.data).toHaveProperty('lastUpdated');
      expect(typeof result.data.lastUpdated).toBe('string');
      expect(new Date(result.data.lastUpdated).toISOString()).toBe(result.data.lastUpdated);
    });

    it('should use correct stage identifier for caching', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });

      (get as jest.Mock).mockResolvedValue(null);
      prisma.bMQualification.findMany.mockResolvedValue([]);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const result = await GET(request, { params: Promise.resolve({ id: 't1' }) });

      expect(get).toHaveBeenCalledWith('t1', 'qualification');
      expect(set).toHaveBeenCalledWith('t1', 'qualification', expect.anything(), expect.any(String));
      expect(result.data).toHaveProperty('stage', 'qualification');
    });
  });

  describe('H2H tiebreaker (§4.1 step 3)', () => {
    it('should resolve ties by H2H direct match results', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });

      // Two players tied on score=4 and points=2 in group A
      const mockQualifications = [
        { id: 'q1', playerId: 'p1', group: 'A', score: 4, points: 2, mp: 3, wins: 2, ties: 0, losses: 1, winRounds: 8, lossRounds: 4, player: { name: 'Player 1', nickname: 'P1' } },
        { id: 'q2', playerId: 'p2', group: 'A', score: 4, points: 2, mp: 3, wins: 2, ties: 0, losses: 1, winRounds: 8, lossRounds: 4, player: { name: 'Player 2', nickname: 'P2' } },
      ];

      // P2 beat P1 in their direct match (3-1)
      const h2hMatches = [
        { player1Id: 'p1', player2Id: 'p2', score1: 1, score2: 3 },
      ];

      (get as jest.Mock).mockResolvedValue(null);
      prisma.bMQualification.findMany.mockResolvedValue(mockQualifications);
      prisma.bMMatch.findMany.mockResolvedValue(h2hMatches);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const result = await GET(request, { params: Promise.resolve({ id: 't1' }) });

      // P2 wins H2H, should be rank 1; P1 should be rank 2
      const qualifications = result.data.qualifications;
      expect(qualifications[0].playerId).toBe('p2');
      expect(qualifications[0].rank).toBe(1);
      expect(qualifications[1].playerId).toBe('p1');
      expect(qualifications[1].rank).toBe(2);

      // Verify H2H match query was made
      expect(prisma.bMMatch.findMany).toHaveBeenCalledWith({
        where: {
          tournamentId: 't1',
          stage: 'qualification',
          completed: true,
          player1Id: { in: ['p1', 'p2'] },
          player2Id: { in: ['p1', 'p2'] },
        },
        select: {
          player1Id: true,
          player2Id: true,
          score1: true,
          score2: true,
        },
      });
    });

    it('should keep players tied when H2H is a draw', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });

      const mockQualifications = [
        { id: 'q1', playerId: 'p1', group: 'A', score: 4, points: 2, mp: 3, wins: 2, ties: 0, losses: 1, winRounds: 8, lossRounds: 4, player: { name: 'Player 1', nickname: 'P1' } },
        { id: 'q2', playerId: 'p2', group: 'A', score: 4, points: 2, mp: 3, wins: 2, ties: 0, losses: 1, winRounds: 8, lossRounds: 4, player: { name: 'Player 2', nickname: 'P2' } },
      ];

      // Draw: 2-2 in BM means a tie
      const h2hMatches = [
        { player1Id: 'p1', player2Id: 'p2', score1: 2, score2: 2 },
      ];

      (get as jest.Mock).mockResolvedValue(null);
      prisma.bMQualification.findMany.mockResolvedValue(mockQualifications);
      prisma.bMMatch.findMany.mockResolvedValue(h2hMatches);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const result = await GET(request, { params: Promise.resolve({ id: 't1' }) });

      // Both should have rank 1 (still tied)
      expect(result.data.qualifications[0].rank).toBe(1);
      expect(result.data.qualifications[1].rank).toBe(1);
    });

    it('should not affect non-tied players', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });

      const mockQualifications = [
        { id: 'q1', playerId: 'p1', group: 'A', score: 6, points: 4, mp: 3, wins: 3, ties: 0, losses: 0, winRounds: 10, lossRounds: 2, player: { name: 'Player 1', nickname: 'P1' } },
        { id: 'q2', playerId: 'p2', group: 'A', score: 4, points: 2, mp: 3, wins: 2, ties: 0, losses: 1, winRounds: 8, lossRounds: 4, player: { name: 'Player 2', nickname: 'P2' } },
        { id: 'q3', playerId: 'p3', group: 'A', score: 2, points: 0, mp: 3, wins: 1, ties: 0, losses: 2, winRounds: 6, lossRounds: 6, player: { name: 'Player 3', nickname: 'P3' } },
      ];

      (get as jest.Mock).mockResolvedValue(null);
      prisma.bMQualification.findMany.mockResolvedValue(mockQualifications);
      // No H2H needed since no ties exist
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const result = await GET(request, { params: Promise.resolve({ id: 't1' }) });

      expect(result.data.qualifications[0].rank).toBe(1);
      expect(result.data.qualifications[1].rank).toBe(2);
      expect(result.data.qualifications[2].rank).toBe(3);
      // No H2H match query for non-tied groups
      expect(prisma.bMMatch.findMany).not.toHaveBeenCalled();
    });

    it('should handle cross-group ties (no H2H possible)', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });

      // Players tied on score/points but in different groups (same group value in orderBy)
      // Since BM orderBy includes group, players in different groups can't be "tied"
      // in the orderBy sense unless they have same group AND same score AND same points.
      // This test verifies that cross-group players with same stats get different ranks
      // because group ordering separates them.
      const mockQualifications = [
        { id: 'q1', playerId: 'p1', group: 'A', score: 4, points: 2, mp: 3, wins: 2, ties: 0, losses: 1, winRounds: 8, lossRounds: 4, player: { name: 'Player 1', nickname: 'P1' } },
        { id: 'q2', playerId: 'p2', group: 'B', score: 4, points: 2, mp: 3, wins: 2, ties: 0, losses: 1, winRounds: 8, lossRounds: 4, player: { name: 'Player 2', nickname: 'P2' } },
      ];

      (get as jest.Mock).mockResolvedValue(null);
      prisma.bMQualification.findMany.mockResolvedValue(mockQualifications);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const result = await GET(request, { params: Promise.resolve({ id: 't1' }) });

      // Different groups → different ranks (not tied in orderBy because group differs)
      expect(result.data.qualifications[0].rank).toBe(1);
      expect(result.data.qualifications[1].rank).toBe(2);
      // No H2H query needed
      expect(prisma.bMMatch.findMany).not.toHaveBeenCalled();
    });
  });
});

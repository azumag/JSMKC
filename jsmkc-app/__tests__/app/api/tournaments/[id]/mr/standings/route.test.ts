// @ts-nocheck
jest.mock('@/lib/prisma', () => ({
  default: {
    mRQualification: { findMany: jest.fn() },
  },
}));

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/standings-cache', () => ({
  get: jest.fn(),
  set: jest.fn(),
  isExpired: jest.fn(() => false),
  generateETag: jest.fn(() => 'etag-123'),
}));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn() })) }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { get, set, isExpired, generateETag } from '@/lib/standings-cache';
import { GET } from '@/app/api/tournaments/[id]/mr/standings/route';

const NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };

// Mock NextRequest class
class MockNextRequest {
  constructor(
    private url: string,
    private headers: Map<string, string> = new Map()
  ) {}
  get url() { return this.url; }
  headers = {
    get: (key: string) => this.headers.get(key)
  };
}

describe('MR Standings API Route - /api/tournaments/[id]/mr/standings', () => {
  const loggerMock = { error: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: unknown, options?: Record<string, unknown>) => ({ data, ...options }));
  });

  describe('GET - Fetch MR standings with caching', () => {
    // Success case - Returns cached standings when available and not expired
    it('should return cached standings when cache is valid', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const cachedData = {
        data: [
          { id: 'q1', playerId: 'p1', group: 'A', score: 6, points: 10, player: { name: 'Player 1', nickname: 'P1' } },
        ],
        etag: 'etag-123',
        timestamp: Date.now(),
      };

      (get as jest.Mock).mockResolvedValue(cachedData);
      (isExpired as jest.Mock).mockReturnValue(false);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ ...cachedData.data, _cached: true });
      expect(result.headers).toEqual({
        'ETag': 'etag-123',
        'Cache-Control': 'public, max-age=300',
      });
      expect(get).toHaveBeenCalledWith('t1', 'qualification');
    });

    // Success case - Fetches fresh data when cache is not available
    it('should fetch fresh data when cache is not available', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockQualifications = [
        { id: 'q1', playerId: 'p1', group: 'A', score: 6, points: 10, mp: 3, wins: 2, ties: 1, losses: 0, player: { name: 'Player 1', nickname: 'P1' } },
        { id: 'q2', playerId: 'p2', group: 'A', score: 4, points: 8, mp: 3, wins: 1, ties: 2, losses: 0, player: { name: 'Player 2', nickname: 'P2' } },
      ];

      (get as jest.Mock).mockResolvedValue(null);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (set as jest.Mock).mockResolvedValue(undefined);
      (generateETag as jest.Mock).mockReturnValue('new-etag-123');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({
        tournamentId: 't1',
        stage: 'qualification',
        lastUpdated: expect.any(String),
        qualifications: [
          { rank: 1, playerId: 'p1', playerName: 'Player 1', playerNickname: 'P1', group: 'A', matchesPlayed: 3, wins: 2, ties: 1, losses: 0, points: 10, score: 6 },
          { rank: 2, playerId: 'p2', playerName: 'Player 2', playerNickname: 'P2', group: 'A', matchesPlayed: 3, wins: 1, ties: 2, losses: 0, points: 8, score: 4 },
        ],
      });
      expect(prisma.mRQualification.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player: true },
        orderBy: [{ score: 'desc' }, { points: 'desc' }],
      });
      expect(set).toHaveBeenCalledWith('t1', 'qualification', mockQualifications, 'new-etag-123');
    });

    // Success case - Fetches fresh data when cache is expired
    it('should fetch fresh data when cache is expired', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const cachedData = {
        data: [],
        etag: 'old-etag',
        timestamp: Date.now() - 400000,
      };

      const mockQualifications = [
        { id: 'q1', playerId: 'p1', group: 'A', score: 6, points: 10, mp: 3, wins: 2, ties: 1, losses: 0, player: { name: 'Player 1', nickname: 'P1' } },
      ];

      (get as jest.Mock).mockResolvedValue(cachedData);
      (isExpired as jest.Mock).mockReturnValue(true);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({
        tournamentId: 't1',
        stage: 'qualification',
        lastUpdated: expect.any(String),
        qualifications: [
          { rank: 1, playerId: 'p1', playerName: 'Player 1', playerNickname: 'P1', group: 'A', matchesPlayed: 3, wins: 2, ties: 1, losses: 0, points: 10, score: 6 },
        ],
      });
      expect(prisma.mRQualification.findMany).toHaveBeenCalled();
    });

    // Success case - Bypasses cache when If-None-Match header is '*'
    it('should bypass cache when If-None-Match header is *', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const cachedData = {
        data: [],
        etag: 'etag-123',
        timestamp: Date.now(),
      };

      const mockQualifications = [
        { id: 'q1', playerId: 'p1', group: 'A', score: 6, points: 10, mp: 3, wins: 2, ties: 1, losses: 0, player: { name: 'Player 1', nickname: 'P1' } },
      ];

      (get as jest.Mock).mockResolvedValue(cachedData);
      (isExpired as jest.Mock).mockReturnValue(false);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/standings', new Map([['if-none-match', '*']]));
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({
        tournamentId: 't1',
        stage: 'qualification',
        lastUpdated: expect.any(String),
        qualifications: [
          { rank: 1, playerId: 'p1', playerName: 'Player 1', playerNickname: 'P1', group: 'A', matchesPlayed: 3, wins: 2, ties: 1, losses: 0, points: 10, score: 6 },
        ],
      });
      expect(prisma.mRQualification.findMany).toHaveBeenCalled();
    });

    // Authentication failure case - Returns 403 when user is not authenticated
    it('should return 403 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(403);
      expect(get).not.toHaveBeenCalled();
    });

    // Authentication failure case - Returns 403 when user has no user object
    it('should return 403 when session exists but user is missing', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: null });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(403);
    });

    // Authentication failure case - Returns 403 when user is not admin
    it('should return 403 when user role is not admin', async () => {
      const mockAuth = { user: { id: 'player1', role: 'player' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(403);
    });

    // Authentication failure case - Returns 403 when user role is undefined
    it('should return 403 when user role is undefined', async () => {
      const mockAuth = { user: { id: 'user1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(403);
    });

    // Error case - Returns 500 when database query fails
    it('should return 500 when database query fails', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      (get as jest.Mock).mockResolvedValue(null);
      (prisma.mRQualification.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Failed to fetch MR standings' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch MR standings', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Error case - Returns 500 when cache get operation fails
    it('should return 500 when cache get operation fails', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      (get as jest.Mock).mockRejectedValue(new Error('Cache error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Failed to fetch MR standings' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch MR standings', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Handles empty standings
    it('should handle empty standings correctly', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      (get as jest.Mock).mockResolvedValue(null);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({
        tournamentId: 't1',
        stage: 'qualification',
        lastUpdated: expect.any(String),
      });
      expect(result.status).toBe(200);
    });

    // Edge case - Generates ETag correctly
    it('should generate and set ETag correctly for fresh data', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockQualifications = [
        { id: 'q1', playerId: 'p1', group: 'A', score: 6, points: 10, mp: 3, wins: 2, ties: 1, losses: 0, player: { name: 'Player 1', nickname: 'P1' } },
      ];

      (get as jest.Mock).mockResolvedValue(null);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (set as jest.Mock).mockResolvedValue(undefined);
      (generateETag as jest.Mock).mockReturnValue('generated-etag-456');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/standings');
      const params = Promise.resolve({ id: 't1' });
      await GET(request, { params });

      expect(generateETag).toHaveBeenCalledWith(mockQualifications);
      expect(set).toHaveBeenCalledWith('t1', 'qualification', mockQualifications, 'generated-etag-456');
    });

    // Edge case - Includes timestamp in lastUpdated field
    it('should include ISO timestamp in lastUpdated field', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockQualifications = [
        { id: 'q1', playerId: 'p1', group: 'A', score: 6, points: 10, mp: 3, wins: 2, ties: 1, losses: 0, player: { name: 'Player 1', nickname: 'P1' } },
      ];

      (get as jest.Mock).mockResolvedValue(null);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toHaveProperty('lastUpdated');
      expect(typeof result.data.lastUpdated).toBe('string');
      expect(new Date(result.data.lastUpdated).toISOString()).toBe(result.data.lastUpdated);
    });

    // Edge case - Orders standings by score desc, points desc
    it('should order standings by score descending, then points descending', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockQualifications = [
        { id: 'q1', playerId: 'p1', group: 'A', score: 6, points: 10, mp: 3, wins: 2, ties: 1, losses: 0, player: { name: 'Player 1', nickname: 'P1' } },
        { id: 'q2', playerId: 'p2', group: 'A', score: 6, points: 8, mp: 3, wins: 1, ties: 3, losses: 0, player: { name: 'Player 2', nickname: 'P2' } },
        { id: 'q3', playerId: 'p3', group: 'A', score: 4, points: 8, mp: 3, wins: 1, ties: 2, losses: 1, player: { name: 'Player 3', nickname: 'P3' } },
      ];

      (get as jest.Mock).mockResolvedValue(null);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/standings');
      const params = Promise.resolve({ id: 't1' });
      await GET(request, { params });

      expect(prisma.mRQualification.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player: true },
        orderBy: [{ score: 'desc' }, { points: 'desc' }],
      });
    });
  });
});

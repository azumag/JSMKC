/**
 * @module GP Standings API Route Tests - /api/tournaments/[id]/gp/standings
 *
 * Test suite for the GP standings endpoint that provides ranked qualification
 * data with server-side caching and ETag-based conditional responses.
 *
 * Covers:
 * - GET: Fetching standings with cache hit/miss/expiry logic, ETag generation,
 *   cache bypass via if-none-match wildcard header, admin-only access control
 *   (403 for non-admin users), proper sorting by score then driver points,
 *   and empty standings handling.
 *
 * The standings cache reduces database load during live tournaments where
 * many clients poll for updated rankings simultaneously.
 */
// @ts-nocheck


jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/standings-cache', () => ({
  get: jest.fn(),
  set: jest.fn(),
  isExpired: jest.fn(),
  generateETag: jest.fn(() => 'etag-123'),
}));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { GET } from '@/app/api/tournaments/[id]/gp/standings/route';
import { get, set, isExpired, generateETag } from '@/lib/standings-cache';

const NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };
const jsonMock = NextResponseMock.NextResponse.json;

class MockNextRequest {
  private _headers: Map<string, string>;

  constructor(
    private url: string,
    private body?: any,
    headers?: Map<string, string>
  ) {
    this._headers = headers || new Map();
  }
  async json() { return this.body; }
  get header() { return { get: (key: string) => this._headers.get(key) }; }
  headers = {
    get: (key: string) => this._headers.get(key)
  };
}

describe('GP Standings API Route - /api/tournaments/[id]/gp/standings', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    jsonMock.mockImplementation((data: any, options?: any) => ({
      data,
      status: options?.status || 200,
      headers: options?.headers || {},
    }));
    (generateETag as jest.Mock).mockReturnValue('etag-123');
  });

  describe('GET - Fetch grand prix standings', () => {
    // Success case - Returns standings from cache
    it('should return cached standings when cache exists and is valid', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      const mockCachedData = {
        etag: 'etag-123',
        data: {
          tournamentId: 't1',
          stage: 'qualification',
          qualifications: [
            {
              rank: 1,
              playerId: 'p1',
              playerName: 'Player 1',
              playerNickname: 'nick1',
              matchesPlayed: 4,
              wins: 3,
              ties: 0,
              losses: 1,
              points: 36,
              score: 6,
            },
          ],
        },
        expiresAt: new Date(Date.now() + 3600000),
      };

      (auth as jest.Mock).mockResolvedValue(mockAuth);
      (get as jest.Mock).mockResolvedValue(mockCachedData);
      (isExpired as jest.Mock).mockReturnValue(false);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ ...mockCachedData.data, _cached: true });
      expect(result.status).toBe(200);
      expect(get).toHaveBeenCalledWith('t1', 'qualification');
      expect(isExpired).toHaveBeenCalledWith(mockCachedData);
    });

    // Success case - Returns fresh standings when cache is not hit
    it('should return fresh standings when cache does not exist', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      const mockQualifications = [
        {
          id: 'q1',
          tournamentId: 't1',
          playerId: 'p1',
          group: 'A',
          mp: 4,
          wins: 3,
          ties: 0,
          losses: 1,
          points: 36,
          score: 6,
          player: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'nick1',
          },
        },
        {
          id: 'q2',
          tournamentId: 't1',
          playerId: 'p2',
          group: 'A',
          mp: 4,
          wins: 2,
          ties: 1,
          losses: 1,
          points: 30,
          score: 5,
          player: {
            id: 'p2',
            name: 'Player 2',
            nickname: 'nick2',
          },
        },
      ];

      (auth as jest.Mock).mockResolvedValue(mockAuth);
      (get as jest.Mock).mockResolvedValue(null);
      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({
        tournamentId: 't1',
        stage: 'qualification',
        lastUpdated: expect.any(String),
        qualifications: [
          {
            rank: 1,
            playerId: 'p1',
            playerName: 'Player 1',
            playerNickname: 'nick1',
            matchesPlayed: 4,
            wins: 3,
            ties: 0,
            losses: 1,
            points: 36,
            score: 6,
          },
          {
            rank: 2,
            playerId: 'p2',
            playerName: 'Player 2',
            playerNickname: 'nick2',
            matchesPlayed: 4,
            wins: 2,
            ties: 1,
            losses: 1,
            points: 30,
            score: 5,
          },
        ],
      });
      expect(result.status).toBe(200);
      expect(prisma.gPQualification.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player: true },
        orderBy: [
          { score: 'desc' },
          { points: 'desc' },
        ],
      });
      expect(set).toHaveBeenCalledWith('t1', 'qualification', mockQualifications, 'etag-123');
    });

    // Success case - Returns fresh standings when cache is expired
    it('should return fresh standings when cache is expired', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      const mockCachedData = {
        etag: 'etag-123',
        data: { tournamentId: 't1' },
        expiresAt: new Date(Date.now() - 3600000),
      };
      const mockQualifications = [
        {
          id: 'q1',
          tournamentId: 't1',
          playerId: 'p1',
          group: 'A',
          mp: 4,
          wins: 3,
          ties: 0,
          losses: 1,
          points: 36,
          score: 6,
          player: { id: 'p1', name: 'Player 1', nickname: 'nick1' },
        },
      ];

      (auth as jest.Mock).mockResolvedValue(mockAuth);
      (get as jest.Mock).mockResolvedValue(mockCachedData);
      (isExpired as jest.Mock).mockReturnValue(true);
      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data.tournamentId).toBe('t1');
      expect(result.status).toBe(200);
      expect(prisma.gPQualification.findMany).toHaveBeenCalled();
    });

    // Success case - Bypasses cache when if-none-match is wildcard
    it('should bypass cache when if-none-match header is wildcard', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      const mockCachedData = {
        etag: 'etag-123',
        data: { tournamentId: 't1' },
        expiresAt: new Date(Date.now() + 3600000),
      };
      const mockQualifications = [
        {
          id: 'q1',
          tournamentId: 't1',
          playerId: 'p1',
          group: 'A',
          mp: 4,
          wins: 3,
          ties: 0,
          losses: 1,
          points: 36,
          score: 6,
          player: { id: 'p1', name: 'Player 1', nickname: 'nick1' },
        },
      ];

      (auth as jest.Mock).mockResolvedValue(mockAuth);
      (get as jest.Mock).mockResolvedValue(mockCachedData);
      (isExpired as jest.Mock).mockReturnValue(false);
      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest(
        'http://localhost:3000/api/tournaments/t1/gp/standings',
        undefined,
        new Map([['if-none-match', '*']])
      );
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data.tournamentId).toBe('t1');
      expect(result.status).toBe(200);
      expect(prisma.gPQualification.findMany).toHaveBeenCalled();
    });

    // Success case - Returns empty standings when no qualifications exist
    it('should return empty standings when no qualifications exist', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };

      (auth as jest.Mock).mockResolvedValue(mockAuth);
      (get as jest.Mock).mockResolvedValue(null);
      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue([]);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({
        tournamentId: 't1',
        stage: 'qualification',
        lastUpdated: expect.any(String),
        qualifications: [],
      });
      expect(result.status).toBe(200);
    });

    // Authentication failure case - Returns 403 when user is not authenticated
    it('should return 403 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(403);
      expect(prisma.gPQualification.findMany).not.toHaveBeenCalled();
    });

    // Authentication failure case - Returns 403 when user is authenticated but not admin
    it('should return 403 when user is authenticated but not admin', async () => {
      const mockAuth = { user: { id: 'user1', role: 'user' } };

      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(403);
      expect(prisma.gPQualification.findMany).not.toHaveBeenCalled();
    });

    // Authentication failure case - Returns 403 when session exists but user is missing
    it('should return 403 when session exists but user is missing', async () => {
      (auth as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(403);
    });

    // Authentication failure case - Returns 403 when user exists but role is missing
    it('should return 403 when user exists but role is missing', async () => {
      const mockAuth = { user: { id: 'admin1' } };

      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/standings');
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
      (prisma.gPQualification.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Failed to fetch GP standings' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch GP standings', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Handles invalid tournament ID gracefully
    it('should handle invalid tournament ID gracefully', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };

      (auth as jest.Mock).mockResolvedValue(mockAuth);
      (get as jest.Mock).mockResolvedValue(null);
      (prisma.gPQualification.findMany as jest.Mock).mockRejectedValue(new Error('Invalid UUID'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/invalid-id/gp/standings');
      const params = Promise.resolve({ id: 'invalid-id' });
      const result = await GET(request, { params });

      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalled();
    });

    // Edge case - Generates correct ETag
    it('should generate correct ETag for qualifications', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      const mockQualifications = [
        {
          id: 'q1',
          tournamentId: 't1',
          playerId: 'p1',
          group: 'A',
          mp: 4,
          wins: 3,
          ties: 0,
          losses: 1,
          points: 36,
          score: 6,
          player: { id: 'p1', name: 'Player 1', nickname: 'nick1' },
        },
      ];

      (auth as jest.Mock).mockResolvedValue(mockAuth);
      (get as jest.Mock).mockResolvedValue(null);
      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (generateETag as jest.Mock).mockReturnValue('generated-etag');
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.status).toBe(200);
      expect(generateETag).toHaveBeenCalledWith(mockQualifications);
      expect(set).toHaveBeenCalledWith('t1', 'qualification', mockQualifications, 'generated-etag');
    });

    // Edge case - Correctly sorts qualifications by score then points
    it('should correctly sort qualifications by score then points', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      const mockQualifications = [
        {
          id: 'q1',
          tournamentId: 't1',
          playerId: 'p1',
          group: 'A',
          mp: 4,
          wins: 3,
          ties: 0,
          losses: 1,
          points: 36,
          score: 6,
          player: { id: 'p1', name: 'Player 1', nickname: 'nick1' },
        },
        {
          id: 'q2',
          tournamentId: 't1',
          playerId: 'p2',
          group: 'B',
          mp: 4,
          wins: 3,
          ties: 0,
          losses: 1,
          points: 30,
          score: 6,
          player: { id: 'p2', name: 'Player 2', nickname: 'nick2' },
        },
        {
          id: 'q3',
          tournamentId: 't1',
          playerId: 'p3',
          group: 'A',
          mp: 4,
          wins: 2,
          ties: 1,
          losses: 1,
          points: 30,
          score: 5,
          player: { id: 'p3', name: 'Player 3', nickname: 'nick3' },
        },
      ];

      (auth as jest.Mock).mockResolvedValue(mockAuth);
      (get as jest.Mock).mockResolvedValue(null);
      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.status).toBe(200);
      expect(result.data.qualifications[0].playerId).toBe('p1');
      expect(result.data.qualifications[1].playerId).toBe('p2');
      expect(result.data.qualifications[2].playerId).toBe('p3');
    });
  });
});

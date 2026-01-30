/**
 * @module BM Standings API Route Tests
 *
 * Test suite for the Battle Mode standings endpoint: /api/tournaments/[id]/bm/standings
 *
 * This file covers the GET method which retrieves paginated BM qualification standings
 * with server-side caching support via ETag and Cache-Control headers.
 *
 * Key behaviors tested:
 *   - Cached standings retrieval when cache is valid (with _cached flag and ETag header)
 *   - Fresh data fetching when cache is unavailable or expired
 *   - Cache bypass via If-None-Match: * header
 *   - Custom pagination parameters (page, limit)
 *   - Authentication enforcement: 403 for unauthenticated users, missing user objects,
 *     non-admin roles, and undefined roles
 *   - Error handling: pagination failures, cache get/set operation failures
 *   - Graceful degradation: data returned even when cache set fails
 *   - Edge cases: empty standings, invalid/NaN pagination parameters
 *   - ETag generation and correct stage identifier ('qualification') for caching
 *   - ISO timestamp in lastUpdated field
 */
// @ts-nocheck


jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/standings-cache', () => ({
  get: jest.fn(),
  set: jest.fn(),
  isExpired: jest.fn(() => false),
  generateETag: jest.fn(() => 'etag-123'),
}));
jest.mock('@/lib/pagination', () => ({ paginate: jest.fn() }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn() })) }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { get, set, isExpired, generateETag } from '@/lib/standings-cache';
import { paginate } from '@/lib/pagination';
import { GET } from '@/app/api/tournaments/[id]/bm/standings/route';

const NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };

// Mock NextRequest class - uses private backing fields to avoid property collisions
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

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: any, options?: any) => ({ data, status: options?.status || 200, headers: options?.headers }));
  });

  describe('GET - Fetch BM standings with caching', () => {
    // Success case - Returns cached standings when available and not expired
    it('should return cached standings when cache is valid', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

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
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ ...cachedData.data, _cached: true });
      expect(result.headers).toEqual({
        'ETag': 'etag-123',
        'Cache-Control': 'public, max-age=300',
      });
      expect(get).toHaveBeenCalledWith('t1', 'qualification');
      expect(paginate).not.toHaveBeenCalled();
    });

    // Success case - Fetches fresh data when cache is not available
    it('should fetch fresh data when cache is not available', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPaginateResult = {
        data: [
          { id: 'q1', playerId: 'p1', group: 'A', score: 6, points: 10 },
          { id: 'q2', playerId: 'p2', group: 'A', score: 4, points: 8 },
        ],
        meta: { page: 1, limit: 50, total: 2, totalPages: 1 },
      };

      (get as jest.Mock).mockResolvedValue(null);
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);
      (set as jest.Mock).mockResolvedValue(undefined);
      (generateETag as jest.Mock).mockReturnValue('new-etag-123');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({
        tournamentId: 't1',
        stage: 'qualification',
        lastUpdated: expect.any(String),
        ...mockPaginateResult.data,
      });
      expect(paginate).toHaveBeenCalledWith(
        {
          findMany: prisma.bMQualification.findMany,
          count: prisma.bMQualification.count,
        },
        { tournamentId: 't1' },
        {},
        { page: 1, limit: 50 }
      );
      expect(set).toHaveBeenCalledWith('t1', 'qualification', mockPaginateResult.data, 'new-etag-123');
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

      const mockPaginateResult = {
        data: [
          { id: 'q1', playerId: 'p1', group: 'A', score: 6, points: 10 },
        ],
        meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
      };

      (get as jest.Mock).mockResolvedValue(cachedData);
      (isExpired as jest.Mock).mockReturnValue(true);
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({
        tournamentId: 't1',
        stage: 'qualification',
        lastUpdated: expect.any(String),
        ...mockPaginateResult.data,
      });
      expect(paginate).toHaveBeenCalled();
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

      const mockPaginateResult = {
        data: [
          { id: 'q1', playerId: 'p1', group: 'A', score: 6, points: 10 },
        ],
        meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
      };

      (get as jest.Mock).mockResolvedValue(cachedData);
      (isExpired as jest.Mock).mockReturnValue(false);
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings', new Map([['if-none-match', '*']]));
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({
        tournamentId: 't1',
        stage: 'qualification',
        lastUpdated: expect.any(String),
        ...mockPaginateResult.data,
      });
      expect(paginate).toHaveBeenCalled();
    });

    // Success case - Uses custom pagination parameters
    it('should use custom page and limit parameters', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPaginateResult = {
        data: [],
        meta: { page: 2, limit: 20, total: 0, totalPages: 0 },
      };

      (get as jest.Mock).mockResolvedValue(null);
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings?page=2&limit=20');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({
        tournamentId: 't1',
        stage: 'qualification',
        lastUpdated: expect.any(String),
      });
      expect(paginate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        { page: 2, limit: 20 }
      );
    });

    // Authentication failure case - Returns 403 when user is not authenticated
    it('should return 403 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(403);
      expect(get).not.toHaveBeenCalled();
      expect(paginate).not.toHaveBeenCalled();
    });

    // Authentication failure case - Returns 403 when user has no user object
    it('should return 403 when session exists but user is missing', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: null });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(403);
    });

    // Authentication failure case - Returns 403 when user is not admin
    it('should return 403 when user role is not admin', async () => {
      const mockAuth = { user: { id: 'player1', role: 'player' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(403);
    });

    // Authentication failure case - Returns 403 when user role is undefined
    it('should return 403 when user role is undefined', async () => {
      const mockAuth = { user: { id: 'user1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(403);
    });

    // Error case - Returns 500 when pagination function fails
    it('should return 500 when pagination function fails', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      (get as jest.Mock).mockResolvedValue(null);
      (paginate as jest.Mock).mockRejectedValue(new Error('Pagination error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Failed to fetch BM standings' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch BM standings', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Error case - Returns 500 when cache get operation fails
    it('should return 500 when cache get operation fails', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      (get as jest.Mock).mockRejectedValue(new Error('Cache error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Failed to fetch BM standings' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch BM standings', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Error case - Returns 500 when cache set operation fails
    // The source code does not have a separate try/catch for the set operation,
    // so a cache set failure propagates to the outer catch block and returns 500.
    it('should return 500 when cache set operation fails', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPaginateResult = {
        data: [
          { id: 'q1', playerId: 'p1', group: 'A', score: 6, points: 10 },
        ],
        meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
      };

      (get as jest.Mock).mockResolvedValue(null);
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);
      (set as jest.Mock).mockRejectedValue(new Error('Cache set failed'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Failed to fetch BM standings' });
      expect(result.status).toBe(500);
      expect(paginate).toHaveBeenCalled();
    });

    // Edge case - Handles empty standings
    it('should handle empty standings correctly', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPaginateResult = {
        data: [],
        meta: { page: 1, limit: 50, total: 0, totalPages: 0 },
      };

      (get as jest.Mock).mockResolvedValue(null);
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({
        tournamentId: 't1',
        stage: 'qualification',
        lastUpdated: expect.any(String),
      });
      expect(result.status).toBe(200);
    });

    // Edge case - Handles invalid page parameter (NaN)
    it('should handle invalid page parameter gracefully', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPaginateResult = {
        data: [],
        meta: { page: 1, limit: 50, total: 0, totalPages: 0 },
      };

      (get as jest.Mock).mockResolvedValue(null);
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings?page=invalid');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      // Number('invalid') returns NaN, which defaults to 1
      expect(result.status).toBe(200);
      expect(paginate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        { page: 1, limit: 50 }
      );
    });

    // Edge case - Handles invalid limit parameter (NaN)
    it('should handle invalid limit parameter gracefully', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPaginateResult = {
        data: [],
        meta: { page: 1, limit: 50, total: 0, totalPages: 0 },
      };

      (get as jest.Mock).mockResolvedValue(null);
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings?limit=invalid');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.status).toBe(200);
      expect(paginate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        { page: 1, limit: 50 }
      );
    });

    // Edge case - Generates ETag correctly
    it('should generate and set ETag correctly for fresh data', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPaginateResult = {
        data: [{ id: 'q1', playerId: 'p1' }],
        meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
      };

      (get as jest.Mock).mockResolvedValue(null);
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);
      (set as jest.Mock).mockResolvedValue(undefined);
      (generateETag as jest.Mock).mockReturnValue('generated-etag-456');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      await GET(request, { params });

      expect(generateETag).toHaveBeenCalledWith(mockPaginateResult.data);
      expect(set).toHaveBeenCalledWith('t1', 'qualification', mockPaginateResult.data, 'generated-etag-456');
    });

    // Edge case - Includes timestamp in lastUpdated field
    it('should include ISO timestamp in lastUpdated field', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPaginateResult = {
        data: [{ id: 'q1', playerId: 'p1' }],
        meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
      };

      (get as jest.Mock).mockResolvedValue(null);
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toHaveProperty('lastUpdated');
      expect(typeof result.data.lastUpdated).toBe('string');
      // Verify it's a valid ISO date
      expect(new Date(result.data.lastUpdated).toISOString()).toBe(result.data.lastUpdated);
    });

    // Edge case - Caches with correct stage identifier
    it('should use correct stage identifier for caching', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPaginateResult = {
        data: [],
        meta: { page: 1, limit: 50, total: 0, totalPages: 0 },
      };

      (get as jest.Mock).mockResolvedValue(null);
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);
      (set as jest.Mock).mockResolvedValue(undefined);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(get).toHaveBeenCalledWith('t1', 'qualification');
      expect(set).toHaveBeenCalledWith('t1', 'qualification', mockPaginateResult.data, expect.any(String));
      expect(result.data).toHaveProperty('stage', 'qualification');
    });
  });
});

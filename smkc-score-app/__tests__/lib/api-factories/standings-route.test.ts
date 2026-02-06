/**
 * @module __tests__/lib/api-factories/standings-route.test.ts
 *
 * Tests for the standings route factory (standings-route.ts).
 *
 * Covers:
 * - Admin authentication requirement (403 for non-admin)
 * - In-memory cache with ETag: cache hit, cache expired, cache bypass
 * - Two fetch modes: paginated (BM) and direct findMany (MR/GP)
 * - Optional transformQualification mapping function
 * - Query parameter parsing (page, limit)
 * - Database error handling (500)
 */

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/standings-cache', () => ({
  get: jest.fn(),
  set: jest.fn(),
  isExpired: jest.fn(),
  generateETag: jest.fn(),
}));
jest.mock('@/lib/pagination', () => ({ paginate: jest.fn() }));
jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() })),
}));

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { get, set, isExpired, generateETag } from '@/lib/standings-cache';
import { paginate } from '@/lib/pagination';
import { createStandingsHandlers } from '@/lib/api-factories/standings-route';

/** Factory for pagination-mode config (BM pattern) */
const createPaginatedConfig = (overrides = {}) => ({
  loggerName: 'test-standings-api',
  errorMessage: 'Failed to fetch standings',
  qualificationModel: 'bMQualification',
  usePagination: true,
  ...overrides,
});

/** Factory for direct-mode config (MR/GP pattern) */
const createDirectConfig = (overrides = {}) => ({
  loggerName: 'test-standings-api',
  errorMessage: 'Failed to fetch standings',
  qualificationModel: 'mRQualification',
  usePagination: false,
  orderBy: [{ score: 'desc' }, { points: 'desc' }] as Record<string, 'asc' | 'desc'>[],
  ...overrides,
});

/** Admin session mock */
const adminSession = { user: { id: 'u1', role: 'admin' } };

/** Mock qualification records */
const mockQualifications = [
  { id: 'q1', playerId: 'p1', score: 100, player: { name: 'Player 1' } },
  { id: 'q2', playerId: 'p2', score: 80, player: { name: 'Player 2' } },
];

/** Mock cache entry */
const createCacheEntry = (overrides = {}) => ({
  data: { qualifications: mockQualifications },
  lastUpdated: new Date().toISOString(),
  etag: 'etag-abc123',
  ...overrides,
});

describe('Standings Route Factory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no cache, fresh ETag for each request
    (get as jest.Mock).mockResolvedValue(null);
    (set as jest.Mock).mockResolvedValue(undefined);
    (isExpired as jest.Mock).mockReturnValue(false);
    (generateETag as jest.Mock).mockReturnValue('etag-new');
  });

  // === AUTH TESTS ===

  describe('Authentication', () => {
    const config = createPaginatedConfig();
    const { GET } = createStandingsHandlers(config);

    // Auth: Returns 403 when not authenticated
    it('should return 403 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      const response = await GET(request, { params });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toBe('Unauthorized: Admin access required');
    });

    // Auth: Returns 403 when user is not admin
    it('should return 403 when user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role: 'member' } });

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      const response = await GET(request, { params });

      expect(response.status).toBe(403);
    });
  });

  // === CACHE TESTS ===

  describe('Caching', () => {
    const config = createPaginatedConfig();
    const { GET } = createStandingsHandlers(config);

    // Cache hit: Returns cached data with _cached flag
    it('should return cached data with _cached: true on cache hit', async () => {
      (auth as jest.Mock).mockResolvedValue(adminSession);
      const cached = createCacheEntry();
      (get as jest.Mock).mockResolvedValue(cached);
      (isExpired as jest.Mock).mockReturnValue(false);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      const response = await GET(request, { params });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json._cached).toBe(true);
      // Should not call paginate since cache was used
      expect(paginate).not.toHaveBeenCalled();
    });

    // Cache headers: ETag and Cache-Control are set on cache hit
    it('should include ETag and Cache-Control headers on cache hit', async () => {
      (auth as jest.Mock).mockResolvedValue(adminSession);
      const cached = createCacheEntry({ etag: 'etag-test-123' });
      (get as jest.Mock).mockResolvedValue(cached);
      (isExpired as jest.Mock).mockReturnValue(false);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      const response = await GET(request, { params });

      expect(response.headers.get('ETag')).toBe('etag-test-123');
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');
    });

    // Cache bypass: If-None-Match: * forces fresh fetch
    it('should bypass cache when If-None-Match: * is sent', async () => {
      (auth as jest.Mock).mockResolvedValue(adminSession);
      const cached = createCacheEntry();
      (get as jest.Mock).mockResolvedValue(cached);
      (isExpired as jest.Mock).mockReturnValue(false);
      const paginateResult = { data: mockQualifications };
      (paginate as jest.Mock).mockResolvedValue(paginateResult);

      // Send If-None-Match: * header to force cache bypass
      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/standings', {
        headers: { 'if-none-match': '*' },
      });
      const params = Promise.resolve({ id: 't1' });
      const response = await GET(request, { params });

      expect(response.status).toBe(200);
      const json = await response.json();
      // Should NOT have _cached flag since cache was bypassed
      expect(json._cached).toBeUndefined();
      // Should call paginate for fresh data
      expect(paginate).toHaveBeenCalled();
    });

    // Cache expired: Fetches fresh data when cache TTL exceeded
    it('should fetch fresh data when cache is expired', async () => {
      (auth as jest.Mock).mockResolvedValue(adminSession);
      const cached = createCacheEntry();
      (get as jest.Mock).mockResolvedValue(cached);
      (isExpired as jest.Mock).mockReturnValue(true); // Expired!
      const paginateResult = { data: mockQualifications };
      (paginate as jest.Mock).mockResolvedValue(paginateResult);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      const response = await GET(request, { params });

      expect(response.status).toBe(200);
      // Should call paginate for fresh data since cache expired
      expect(paginate).toHaveBeenCalled();
      // Should update cache with new data
      expect(set).toHaveBeenCalled();
    });
  });

  // === PAGINATION MODE (BM) ===

  describe('Pagination mode (usePagination=true)', () => {
    const config = createPaginatedConfig();
    const { GET } = createStandingsHandlers(config);

    // Paginate: Uses paginate() utility for BM mode
    it('should use paginate() when usePagination=true', async () => {
      (auth as jest.Mock).mockResolvedValue(adminSession);
      const paginateResult = { data: mockQualifications };
      (paginate as jest.Mock).mockResolvedValue(paginateResult);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      const response = await GET(request, { params });

      expect(response.status).toBe(200);
      expect(paginate).toHaveBeenCalledWith(
        expect.objectContaining({ findMany: expect.any(Function), count: expect.any(Function) }),
        { tournamentId: 't1' },
        {},
        { page: 1, limit: 50 },
      );
    });

    // Query params: Parses page and limit in pagination mode
    it('should parse page and limit from query params', async () => {
      (auth as jest.Mock).mockResolvedValue(adminSession);
      (paginate as jest.Mock).mockResolvedValue({ data: [] });

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/standings?page=2&limit=25');
      const params = Promise.resolve({ id: 't1' });
      await GET(request, { params });

      expect(paginate).toHaveBeenCalledWith(
        expect.any(Object),
        { tournamentId: 't1' },
        {},
        { page: 2, limit: 25 },
      );
    });
  });

  // === DIRECT MODE (MR/GP) ===

  describe('Direct mode (usePagination=false)', () => {
    // Direct: Uses findMany with player include
    it('should use findMany when usePagination=false', async () => {
      const config = createDirectConfig();
      const { GET } = createStandingsHandlers(config);
      (auth as jest.Mock).mockResolvedValue(adminSession);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/mr/standings');
      const params = Promise.resolve({ id: 't1' });
      const response = await GET(request, { params });

      expect(response.status).toBe(200);
      expect(prisma.mRQualification.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player: true },
        orderBy: [{ score: 'desc' }, { points: 'desc' }],
      });
      // paginate should NOT be called in direct mode
      expect(paginate).not.toHaveBeenCalled();
    });

    // Transform: Applies transformQualification when provided
    it('should apply transformQualification when provided', async () => {
      const transform = jest.fn((q: { id: string }) => ({ ...q, transformed: true }));
      const config = createDirectConfig({ transformQualification: transform });
      const { GET } = createStandingsHandlers(config);
      (auth as jest.Mock).mockResolvedValue(adminSession);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/mr/standings');
      const params = Promise.resolve({ id: 't1' });
      const response = await GET(request, { params });

      const json = await response.json();
      // transform is called via Array.map, so receives (element, index, array)
      expect(transform).toHaveBeenCalledTimes(2);
      expect(json.qualifications).toEqual([
        { ...mockQualifications[0], transformed: true },
        { ...mockQualifications[1], transformed: true },
      ]);
    });

    // No transform: Returns raw qualifications when transform not provided
    it('should return raw qualifications when no transform function', async () => {
      const config = createDirectConfig({ transformQualification: undefined });
      const { GET } = createStandingsHandlers(config);
      (auth as jest.Mock).mockResolvedValue(adminSession);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/mr/standings');
      const params = Promise.resolve({ id: 't1' });
      const response = await GET(request, { params });

      const json = await response.json();
      expect(json.qualifications).toEqual(mockQualifications);
    });
  });

  // === ERROR HANDLING ===

  describe('Error handling', () => {
    const config = createPaginatedConfig();
    const { GET } = createStandingsHandlers(config);

    // Error: Returns 500 on database failure
    it('should return 500 on database failure', async () => {
      (auth as jest.Mock).mockResolvedValue(adminSession);
      (paginate as jest.Mock).mockRejectedValue(new Error('DB connection failed'));

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/standings');
      const params = Promise.resolve({ id: 't1' });
      const response = await GET(request, { params });

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('Failed to fetch standings');
    });
  });
});

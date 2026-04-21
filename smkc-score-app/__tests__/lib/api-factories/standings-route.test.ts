/**
 * @module __tests__/lib/api-factories/standings-route.test.ts
 *
 * Tests for the standings route factory (standings-route.ts).
 *
 * Covers:
 * - Admin authentication requirement (403 for non-admin)
 * - In-memory cache with ETag: cache hit, cache expired, cache bypass
 * - Two fetch modes: paginated and direct findMany (BM/MR/GP)
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

/** Factory for pagination-mode config */
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
  orderBy: [{ score: 'desc' as const }, { points: 'desc' as const }],
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
      expect(json.error).toBe('Forbidden');
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
      expect(json.data._cached).toBe(true);
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
      // Factory injects _rank before calling transform; both records have distinct scores
      expect(transform).toHaveBeenCalledTimes(2);
      expect(json.data.qualifications).toEqual([
        { ...mockQualifications[0], _rank: 1, transformed: true },
        { ...mockQualifications[1], _rank: 2, transformed: true },
      ]);
    });

    // Tie-aware ranking: Tied players share the same rank (1224 style)
    it('should assign the same rank to players with identical sort field values', async () => {
      const tiedQualifications = [
        { id: 'q1', playerId: 'p1', score: 100, points: 50, player: { name: 'Player 1' } },
        { id: 'q2', playerId: 'p2', score: 100, points: 50, player: { name: 'Player 2' } },  // Tied with p1
        { id: 'q3', playerId: 'p3', score: 80, points: 40, player: { name: 'Player 3' } },
      ];
      const config = createDirectConfig({ transformQualification: undefined });
      const { GET } = createStandingsHandlers(config);
      (auth as jest.Mock).mockResolvedValue(adminSession);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(tiedQualifications);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/mr/standings');
      const params = Promise.resolve({ id: 't1' });
      const response = await GET(request, { params });

      const json = await response.json();
      // p1 and p2 are tied → both rank 1; p3 is at position 3 (standard 1224 ranking)
      expect(json.data.qualifications[0]._rank).toBe(1);
      expect(json.data.qualifications[1]._rank).toBe(1);
      expect(json.data.qualifications[2]._rank).toBe(3);
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
      // Without transform, factory returns ranked objects (with injected _rank field)
      expect(json.data.qualifications).toEqual([
        { ...mockQualifications[0], _rank: 1 },
        { ...mockQualifications[1], _rank: 2 },
      ]);
    });
  });

  // === H2H TIEBREAKER ===

  describe('H2H tiebreaker (matchModel)', () => {
    /*
     * Tests for requirements §4.1 step 3: direct match results resolve ties
     * after points and wins/losses are equal.
     */

    it('should re-sort tied players by H2H win count (2-way tie)', async () => {
      /*
       * p1 and p2 are tied (same score/points). p1 beat p2 in their direct match.
       * After H2H: p1 → rank 1, p2 → rank 2 (tie is broken).
       */
      const tiedQuals = [
        { id: 'q1', playerId: 'p1', score: 6, points: 6, player: { name: 'P1' } },
        { id: 'q2', playerId: 'p2', score: 6, points: 6, player: { name: 'P2' } },
      ];
      const config = createDirectConfig({
        qualificationModel: 'mRQualification',
        matchModel: 'mRMatch',
        transformQualification: undefined,
      });
      const { GET } = createStandingsHandlers(config);
      (auth as jest.Mock).mockResolvedValue(adminSession);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(tiedQuals);
      // H2H: p1 beat p2 (score1=4, score2=0)
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([
        { player1Id: 'p1', player2Id: 'p2', score1: 4, score2: 0 },
      ]);

      const response = await GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/mr/standings'),
        { params: Promise.resolve({ id: 't1' }) },
      );

      const json = await response.json();
      // p1 has 1 H2H win → rank 1; p2 has 0 → rank 2 (tie broken)
      expect(json.data.qualifications[0]._rank).toBe(1);
      expect(json.data.qualifications[0].playerId).toBe('p1');
      expect(json.data.qualifications[1]._rank).toBe(2);
      expect(json.data.qualifications[1].playerId).toBe('p2');
    });

    it('should keep players tied when H2H result is also tied (no mutual wins)', async () => {
      const tiedQuals = [
        { id: 'q1', playerId: 'p1', score: 6, points: 6, player: { name: 'P1' } },
        { id: 'q2', playerId: 'p2', score: 6, points: 6, player: { name: 'P2' } },
      ];
      const config = createDirectConfig({
        qualificationModel: 'mRQualification',
        matchModel: 'mRMatch',
        transformQualification: undefined,
      });
      const { GET } = createStandingsHandlers(config);
      (auth as jest.Mock).mockResolvedValue(adminSession);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(tiedQuals);
      // No H2H match exists between them (e.g. cross-group tie)
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);

      const response = await GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/mr/standings'),
        { params: Promise.resolve({ id: 't1' }) },
      );

      const json = await response.json();
      // Both remain at rank 1 (still tied, requires sudden death)
      expect(json.data.qualifications[0]._rank).toBe(1);
      expect(json.data.qualifications[1]._rank).toBe(1);
    });

    it('should use custom matchScoreFields for GP (points1/points2)', async () => {
      const tiedQuals = [
        { id: 'q1', playerId: 'p1', points: 30, score: 4, player: { name: 'P1' } },
        { id: 'q2', playerId: 'p2', points: 30, score: 4, player: { name: 'P2' } },
      ];
      const config = createDirectConfig({
        qualificationModel: 'gPQualification',
        matchModel: 'gPMatch',
        matchScoreFields: { p1: 'points1', p2: 'points2' },
        orderBy: [{ points: 'desc' as const }, { score: 'desc' as const }],
        transformQualification: undefined,
      });
      const { GET } = createStandingsHandlers(config);
      (auth as jest.Mock).mockResolvedValue(adminSession);
      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue(tiedQuals);
      // GP H2H: p2 had more driver points (45 vs 9)
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([
        { player1Id: 'p1', player2Id: 'p2', points1: 9, points2: 45 },
      ]);

      const response = await GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/gp/standings'),
        { params: Promise.resolve({ id: 't1' }) },
      );

      const json = await response.json();
      // p2 won H2H → p2 rank 1, p1 rank 2
      expect(json.data.qualifications[0].playerId).toBe('p2');
      expect(json.data.qualifications[0]._rank).toBe(1);
      expect(json.data.qualifications[1].playerId).toBe('p1');
      expect(json.data.qualifications[1]._rank).toBe(2);
    });

    it('should not affect non-tied entries', async () => {
      const quals = [
        { id: 'q1', playerId: 'p1', score: 8, points: 8, player: { name: 'P1' } }, // rank 1, unique
        { id: 'q2', playerId: 'p2', score: 6, points: 6, player: { name: 'P2' } }, // rank 2
        { id: 'q3', playerId: 'p3', score: 6, points: 6, player: { name: 'P3' } }, // rank 2 (tied)
      ];
      const config = createDirectConfig({
        qualificationModel: 'mRQualification',
        matchModel: 'mRMatch',
        transformQualification: undefined,
      });
      const { GET } = createStandingsHandlers(config);
      (auth as jest.Mock).mockResolvedValue(adminSession);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(quals);
      // H2H: p2 beat p3
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([
        { player1Id: 'p2', player2Id: 'p3', score1: 4, score2: 0 },
      ]);

      const response = await GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/mr/standings'),
        { params: Promise.resolve({ id: 't1' }) },
      );

      const json = await response.json();
      // p1 stays at rank 1; p2 → rank 2; p3 → rank 3
      expect(json.data.qualifications[0]).toMatchObject({ playerId: 'p1', _rank: 1 });
      expect(json.data.qualifications[1]).toMatchObject({ playerId: 'p2', _rank: 2 });
      expect(json.data.qualifications[2]).toMatchObject({ playerId: 'p3', _rank: 3 });
    });
  });

  // === RANK OVERRIDE ===

  describe('rankOverride (admin manual rank)', () => {
    /*
     * Tests for rankOverride feature: admin-set ranks take precedence over
     * H2H tiebreaker and automatic computation (requirements issue #295).
     */

    it('should use rankOverride instead of auto-computed rank when set', async () => {
      /*
       * p1 is auto-rank 1 but has rankOverride=2;
       * p2 is auto-rank 2 but has rankOverride=1.
       * After override: p2 comes first in the response.
       */
      const quals = [
        { id: 'q1', playerId: 'p1', score: 8, points: 8, rankOverride: 2, player: { name: 'P1' } },
        { id: 'q2', playerId: 'p2', score: 6, points: 6, rankOverride: 1, player: { name: 'P2' } },
      ];
      const config = createDirectConfig({ transformQualification: undefined });
      const { GET } = createStandingsHandlers(config);
      (auth as jest.Mock).mockResolvedValue(adminSession);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(quals);

      const response = await GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/mr/standings'),
        { params: Promise.resolve({ id: 't1' }) },
      );

      const json = await response.json();
      // p2's rankOverride=1 wins over p1's rankOverride=2
      expect(json.data.qualifications[0].playerId).toBe('p2');
      expect(json.data.qualifications[0]._rank).toBe(1);
      expect(json.data.qualifications[0]._rankOverridden).toBe(true);
      expect(json.data.qualifications[1].playerId).toBe('p1');
      expect(json.data.qualifications[1]._rank).toBe(2);
      expect(json.data.qualifications[1]._rankOverridden).toBe(true);
    });

    it('should not set _rankOverridden when rankOverride is null', async () => {
      const quals = [
        { id: 'q1', playerId: 'p1', score: 8, points: 8, rankOverride: null, player: { name: 'P1' } },
      ];
      const config = createDirectConfig({ transformQualification: undefined });
      const { GET } = createStandingsHandlers(config);
      (auth as jest.Mock).mockResolvedValue(adminSession);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(quals);

      const response = await GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/mr/standings'),
        { params: Promise.resolve({ id: 't1' }) },
      );

      const json = await response.json();
      expect(json.data.qualifications[0]._rankOverridden).toBeUndefined();
      // Auto-computed rank is used
      expect(json.data.qualifications[0]._rank).toBe(1);
    });

    it('should prioritize rankOverride over H2H result', async () => {
      /*
       * p1 and p2 are tied; H2H says p1 wins, but p2 has rankOverride=1.
       * Override must win → p2 comes first.
       */
      const tiedQuals = [
        { id: 'q1', playerId: 'p1', score: 6, points: 6, rankOverride: null, player: { name: 'P1' } },
        { id: 'q2', playerId: 'p2', score: 6, points: 6, rankOverride: 1, player: { name: 'P2' } },
      ];
      const config = createDirectConfig({
        qualificationModel: 'mRQualification',
        matchModel: 'mRMatch',
        transformQualification: undefined,
      });
      const { GET } = createStandingsHandlers(config);
      (auth as jest.Mock).mockResolvedValue(adminSession);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(tiedQuals);
      // H2H: p1 beat p2 — but p2's override should still win
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([
        { player1Id: 'p1', player2Id: 'p2', score1: 4, score2: 0 },
      ]);

      const response = await GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/mr/standings'),
        { params: Promise.resolve({ id: 't1' }) },
      );

      const json = await response.json();
      // p2's rankOverride=1 beats H2H result for p1
      expect(json.data.qualifications[0].playerId).toBe('p2');
      expect(json.data.qualifications[0]._rank).toBe(1);
      expect(json.data.qualifications[0]._rankOverridden).toBe(true);
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

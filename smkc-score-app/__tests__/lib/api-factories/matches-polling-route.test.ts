/**
 * @module __tests__/lib/api-factories/matches-polling-route.test.ts
 *
 * Tests for the matches polling route factory (matches-polling-route.ts).
 *
 * Covers:
 * - Session-based authentication (401 for unauthenticated)
 * - Tournament existence check (404 when not found)
 * - Successful paginated match retrieval
 * - Query parameter parsing (page, limit) with orderBy verification
 * - Default pagination values
 * - Database error handling (500)
 * - TC-2577: MR config routes to mRMatch model (not bMMatch)
 * - TC-2578: GP config routes to gPMatch model (not bMMatch)
 * - TC-2579: Player session (non-admin) is accepted and returns 200
 */

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/pagination', () => ({ paginate: jest.fn() }));
jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() })),
}));

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { paginate } from '@/lib/pagination';
import { createMatchesPollingHandlers } from '@/lib/api-factories/matches-polling-route';

/** Factory for creating test config with optional overrides */
const createMockConfig = (overrides = {}) => ({
  matchModel: 'bMMatch',
  loggerName: 'test-matches-polling-api',
  errorMessage: 'Failed to fetch matches',
  ...overrides,
});

/** Helper to create a mock paginate result */
const createPaginateResult = (matches: unknown[] = []) => ({
  data: matches,
  meta: { page: 1, limit: 50, total: matches.length, totalPages: 1 },
});

describe('Matches Polling Route Factory', () => {
  const config = createMockConfig();
  const { GET } = createMatchesPollingHandlers(config);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Auth: GET requires any session (admin or player)
  it('should return 401 when no session exists', async () => {
    jest.mocked(auth).mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/matches');
    const params = Promise.resolve({ id: 't1' });
    const response = await GET(request, { params });

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe('Authentication required');
  });

  // Not found: Returns 404 when tournament does not exist
  it('should return 404 when tournament does not exist', async () => {
    jest.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/tournaments/nonexistent/bm/matches');
    const params = Promise.resolve({ id: 'nonexistent' });
    const response = await GET(request, { params });

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe('Tournament not found');
  });

  // Success: Returns paginated matches
  it('should return paginated matches on success', async () => {
    jest.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'player' } });
    (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });

    const mockResult = createPaginateResult([{ id: 'm1', matchNumber: 1 }]);
    (paginate as jest.Mock).mockResolvedValue(mockResult);

    const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/matches');
    const params = Promise.resolve({ id: 't1' });
    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    const json = await response.json();
    /* createSuccessResponse wraps the paginate result; match array lives
     * at json.data.data because paginate's own .data nests inside the
     * factory's response body. */
    expect(json.data).toEqual(mockResult);
  });

  // Query params: Parses page and limit from URL search params
  it('should parse page and limit from query params', async () => {
    jest.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
    (paginate as jest.Mock).mockResolvedValue(createPaginateResult());

    const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/matches?page=3&limit=10');
    const params = Promise.resolve({ id: 't1' });
    await GET(request, { params });

    // paginate is called with: (model, where, orderBy, { page, limit })
    expect(paginate).toHaveBeenCalledWith(
      expect.any(Object),
      { tournamentId: 't1' },
      { matchNumber: 'asc' },
      { page: 3, limit: 10 },
    );
  });

  // Defaults: Uses page=1, limit=50 when query params not provided
  it('should use default page=1 and limit=50 when not specified', async () => {
    jest.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
    (paginate as jest.Mock).mockResolvedValue(createPaginateResult());

    const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/matches');
    const params = Promise.resolve({ id: 't1' });
    await GET(request, { params });

    expect(paginate).toHaveBeenCalledWith(
      expect.any(Object),
      { tournamentId: 't1' },
      { matchNumber: 'asc' },
      { page: 1, limit: 50 },
    );
  });

  // Error: Returns 500 when database throws
  it('should return 500 on database failure', async () => {
    jest.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    (prisma.tournament.findFirst as jest.Mock).mockRejectedValue(new Error('DB connection failed'));

    const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/matches');
    const params = Promise.resolve({ id: 't1' });
    const response = await GET(request, { params });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Failed to fetch matches');
  });
});

describe('Matches Polling Route Factory — model routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
    (paginate as jest.Mock).mockResolvedValue({ data: [], meta: { page: 1, limit: 50, total: 0, totalPages: 0 } });
  });

  // TC-2577: MR config routes to mRMatch (not bMMatch)
  it('TC-2577: MR config routes to mRMatch model', async () => {
    const { GET: mrGET } = createMatchesPollingHandlers(
      createMockConfig({ matchModel: 'mRMatch', loggerName: 'test-mr-matches' }),
    );

    const request = new NextRequest('http://localhost:3000/api/tournaments/t1/mr/matches');
    await mrGET(request, { params: Promise.resolve({ id: 't1' }) });

    // paginate adapter must expose both findMany and count — restores invariant lost in #2585 (#2587)
    expect(paginate).toHaveBeenCalledWith(
      expect.objectContaining({ findMany: expect.any(Function), count: expect.any(Function) }),
      { tournamentId: 't1' },
      { matchNumber: 'asc' },
      expect.any(Object),
    );
    // Positive assertion: calling the bound findMany delegates to prisma.mRMatch.findMany.
    // .bind() preserves the jest mock identity, so calling the wrapper triggers the mock.
    // lastCall over calls[0] because both TCs run in the same describe; explicit index is fragile (#2588)
    const modelArg = (paginate as jest.Mock).mock.lastCall?.[0];
    expect(modelArg).toBeDefined();
    await modelArg.findMany({});
    expect(prisma.mRMatch.findMany).toHaveBeenCalled();
    expect(prisma.bMMatch.findMany).not.toHaveBeenCalled();
    expect(prisma.gPMatch.findMany).not.toHaveBeenCalled();
    // count must delegate to mRMatch too — count-only callers broke when only findMany was verified (#2587)
    await modelArg.count({});
    expect(prisma.mRMatch.count).toHaveBeenCalled();
    expect(prisma.bMMatch.count).not.toHaveBeenCalled();
    expect(prisma.gPMatch.count).not.toHaveBeenCalled();
  });

  // TC-2578: GP config routes to gPMatch (not bMMatch or mRMatch)
  it('TC-2578: GP config routes to gPMatch model', async () => {
    const { GET: gpGET } = createMatchesPollingHandlers(
      createMockConfig({ matchModel: 'gPMatch', loggerName: 'test-gp-matches' }),
    );

    const request = new NextRequest('http://localhost:3000/api/tournaments/t1/gp/matches');
    await gpGET(request, { params: Promise.resolve({ id: 't1' }) });

    // Same shape requirement as TC-2577 — both findMany and count must be present (#2587)
    expect(paginate).toHaveBeenCalledWith(
      expect.objectContaining({ findMany: expect.any(Function), count: expect.any(Function) }),
      { tournamentId: 't1' },
      { matchNumber: 'asc' },
      expect.any(Object),
    );
    // Positive assertion: gPMatch.findMany must be the delegate, not bMMatch or mRMatch.
    // lastCall over calls[0] because both TCs run in the same describe; explicit index is fragile (#2588)
    const modelArg = (paginate as jest.Mock).mock.lastCall?.[0];
    expect(modelArg).toBeDefined();
    await modelArg.findMany({});
    expect(prisma.gPMatch.findMany).toHaveBeenCalled();
    expect(prisma.bMMatch.findMany).not.toHaveBeenCalled();
    expect(prisma.mRMatch.findMany).not.toHaveBeenCalled();
    // count must delegate to gPMatch too, not mRMatch or bMMatch (#2587)
    await modelArg.count({});
    expect(prisma.gPMatch.count).toHaveBeenCalled();
    expect(prisma.bMMatch.count).not.toHaveBeenCalled();
    expect(prisma.mRMatch.count).not.toHaveBeenCalled();
  });

  // TC-2579: Player session (non-admin) is accepted — returns 200
  it('TC-2579: player session (non-admin) is accepted and returns 200', async () => {
    jest.mocked(auth).mockResolvedValue({ user: { id: 'p1', role: 'player', userType: 'player' } });
    const { GET: bmGET } = createMatchesPollingHandlers(createMockConfig());

    const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/matches');
    const response = await bmGET(request, { params: Promise.resolve({ id: 't1' }) });

    expect(response.status).toBe(200);
    expect(paginate).toHaveBeenCalled();
  });
});

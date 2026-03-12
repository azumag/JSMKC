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
    (auth as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/matches');
    const params = Promise.resolve({ id: 't1' });
    const response = await GET(request, { params });

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe('Authentication required');
  });

  // Not found: Returns 404 when tournament does not exist
  it('should return 404 when tournament does not exist', async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
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
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role: 'player' } });
    (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });

    const mockResult = createPaginateResult([{ id: 'm1', matchNumber: 1 }]);
    (paginate as jest.Mock).mockResolvedValue(mockResult);

    const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/matches');
    const params = Promise.resolve({ id: 't1' });
    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual(mockResult);
  });

  // Query params: Parses page and limit from URL search params
  it('should parse page and limit from query params', async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
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
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
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
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    (prisma.tournament.findFirst as jest.Mock).mockRejectedValue(new Error('DB connection failed'));

    const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/matches');
    const params = Promise.resolve({ id: 't1' });
    const response = await GET(request, { params });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Failed to fetch matches');
  });
});

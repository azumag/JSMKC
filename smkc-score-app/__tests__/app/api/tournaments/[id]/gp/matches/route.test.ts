/**
 * @module GP Matches API Route Tests - /api/tournaments/[id]/gp/matches
 *
 * Test suite for the Grand Prix matches listing endpoint used for polling.
 * This endpoint provides paginated GP match data and is secured via
 * NextAuth session-based authentication, requiring an authenticated
 * user (admin or player) to access the endpoint.
 *
 * Covers:
 * - GET: Fetching paginated GP matches with session authentication,
 *   custom pagination parameters, unauthenticated access handling,
 *   tournament existence checks, and database error scenarios.
 */
// @ts-nocheck


jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/pagination', () => ({
  paginate: jest.fn(),
}));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { GET } from '@/app/api/tournaments/[id]/gp/matches/route';
import { paginate } from '@/lib/pagination';

const _NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };

// Mock NextRequest class - uses _url to avoid conflict with url getter
class MockNextRequest {
  private _url: string;
  constructor(url: string) {
    this._url = url;
  }
  get url() { return this._url; }
}

describe('GP Matches API Route - /api/tournaments/[id]/gp/matches', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    // Default: authenticated admin session for most tests
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: any, options?: any) => ({ data, status: options?.status || 200 }));
  });

  describe('GET - Fetch grand prix matches with session authentication', () => {
    // Success case - Returns paginated matches with valid session
    it('should return paginated matches with valid session', async () => {
      const mockMatches = [
        { id: 'm1', tournamentId: 't1', matchNumber: 1, stage: 'qualification', player1: { id: 'p1' }, player2: { id: 'p2' } },
        { id: 'm2', tournamentId: 't1', matchNumber: 2, stage: 'qualification', player1: { id: 'p3' }, player2: { id: 'p4' } },
      ];
      const mockPaginatedResult = {
        data: mockMatches,
        pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
      };

      // Session auth mock is set in beforeEach (admin session)
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
      (paginate as jest.Mock).mockResolvedValue(mockPaginatedResult);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/matches');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual(mockPaginatedResult);
      expect(result.status).toBe(200);
      // Tournament existence check uses only the ID (no token fields)
      expect(prisma.tournament.findFirst).toHaveBeenCalledWith({
        where: { id: 't1' },
      });
      expect(paginate).toHaveBeenCalledWith(
        { findMany: expect.any(Function), count: expect.any(Function) },
        { tournamentId: 't1' },
        { matchNumber: 'asc' },
        { page: 1, limit: 50 }
      );
    });

    // Success case - Uses custom pagination parameters
    it('should use custom page and limit parameters when provided', async () => {
      const mockPaginatedResult = {
        data: [],
        pagination: { page: 2, limit: 20, total: 0, totalPages: 0 },
      };

      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
      (paginate as jest.Mock).mockResolvedValue(mockPaginatedResult);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/matches?page=2&limit=20');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.status).toBe(200);
      expect(paginate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        { page: 2, limit: 20 }
      );
    });

    // Authentication failure case - Returns 401 when not authenticated
    it('should return 401 when not authenticated', async () => {
      // Override default session mock: no session means unauthenticated
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/matches');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Authentication required' });
      expect(result.status).toBe(401);
      // Tournament lookup should not be called when session is missing
      expect(prisma.tournament.findFirst).not.toHaveBeenCalled();
    });

    // Not found case - Returns 404 when tournament does not exist
    it('should return 404 when tournament not found', async () => {
      // Session is valid (from beforeEach), but tournament does not exist
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/matches');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Tournament not found' });
      expect(result.status).toBe(404);
      expect(prisma.tournament.findFirst).toHaveBeenCalledWith({
        where: { id: 't1' },
      });
      expect(paginate).not.toHaveBeenCalled();
    });

    // Error case - Returns 500 when database query fails during pagination
    it('should return 500 when database query fails', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
      (paginate as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/matches');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Failed to fetch grand prix matches' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch grand prix matches', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Error case - Returns 500 when database error occurs during tournament check
    it('should return 500 when database error during tournament check', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockRejectedValue(new Error('Invalid UUID'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/invalid-id/gp/matches');
      const params = Promise.resolve({ id: 'invalid-id' });
      const result = await GET(request, { params });

      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalled();
    });

    // Edge case - Handles non-numeric page and limit parameters
    // Source uses `Number(searchParams.get('page')) || 1` which converts NaN to defaults (1, 50)
    it('should use default values when page and limit are non-numeric', async () => {
      const mockPaginatedResult = {
        data: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      };

      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
      (paginate as jest.Mock).mockResolvedValue(mockPaginatedResult);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/matches?page=abc&limit=xyz');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.status).toBe(200);
      /* Number('abc') is NaN, and NaN || 1 evaluates to 1; NaN || 50 evaluates to 50 */
      expect(paginate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        { page: 1, limit: 50 }
      );
    });

    // Edge case - Returns empty result when no matches exist
    it('should return empty result when no matches exist', async () => {
      const mockPaginatedResult = {
        data: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      };

      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
      (paginate as jest.Mock).mockResolvedValue(mockPaginatedResult);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/matches');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual(mockPaginatedResult);
      expect(result.data.data).toEqual([]);
      expect(result.status).toBe(200);
    });
  });
});

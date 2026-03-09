/**
 * @module MR Matches API Route Tests
 *
 * Test suite for the Match Race (MR) matches listing endpoint: /api/tournaments/[id]/mr/matches
 *
 * Covers the GET method with session-based authentication and paginated response:
 * - Success cases: Returns paginated matches with valid session, uses default pagination
 *   values (page=1, limit=50), handles custom page/limit parameters, and orders matches
 *   by matchNumber ascending.
 * - Authentication failure cases: Returns 401 when not authenticated.
 * - Not found cases: Returns 404 when tournament does not exist.
 * - Error cases: Returns 500 when pagination function fails or when the database query
 *   fails during tournament lookup.
 * - Edge cases: Handles invalid (NaN) page and limit parameters gracefully by falling
 *   back to default values.
 *
 * Dependencies mocked: @/lib/auth, @/lib/pagination, @/lib/logger, next/server, @/lib/prisma
 */
// @ts-nocheck


jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/pagination', () => ({ paginate: jest.fn() }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn() })) }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { paginate } from '@/lib/pagination';
import { GET } from '@/app/api/tournaments/[id]/mr/matches/route';

const _NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };

// Mock NextRequest class
// Use _url private field to avoid conflict with url getter
class MockNextRequest {
  private _url: string;
  constructor(url: string) {
    this._url = url;
  }
  get url() { return this._url; }
}

describe('MR Matches API Route - /api/tournaments/[id]/mr/matches', () => {
  const loggerMock = { error: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    // Default: authenticated admin session for most tests
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: unknown, options?: { status?: number }) => ({ data, status: options?.status || 200 }));
  });

  describe('GET - Fetch match race matches with session authentication', () => {
    // Success case - Returns paginated matches with valid session
    it('should return paginated matches with valid session', async () => {
      const mockMatches = [
        { id: 'm1', matchNumber: 1, player1Id: 'p1', player2Id: 'p2' },
        { id: 'm2', matchNumber: 2, player1Id: 'p3', player2Id: 'p4' },
      ];

      const mockPaginateResult = {
        data: mockMatches,
        meta: {
          page: 1,
          limit: 50,
          total: 2,
          totalPages: 1,
        },
      };

      // Session auth mock is set in beforeEach (admin session)
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches?page=1&limit=50');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual(mockPaginateResult);
      expect(result.status).toBe(200);
      // Tournament existence check uses only the ID (no token fields)
      expect(prisma.tournament.findFirst).toHaveBeenCalledWith({
        where: { id: 't1' }
      });
      expect(paginate).toHaveBeenCalledWith(
        { findMany: expect.any(Function), count: expect.any(Function) },
        { tournamentId: 't1' },
        { matchNumber: 'asc' },
        { page: 1, limit: 50 }
      );
    });

    // Success case - Uses default pagination values when not provided
    it('should use default pagination values (page=1, limit=50) when not provided', async () => {
      const mockPaginateResult = {
        data: [],
        meta: { page: 1, limit: 50, total: 0, totalPages: 0 },
      };

      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual(mockPaginateResult);
      expect(paginate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        { page: 1, limit: 50 }
      );
    });

    // Success case - Handles custom pagination parameters
    it('should handle custom page and limit parameters', async () => {
      const mockPaginateResult = {
        data: [],
        meta: { page: 2, limit: 20, total: 0, totalPages: 0 },
      };

      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches?page=2&limit=20');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual(mockPaginateResult);
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

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Authentication required' });
      expect(result.status).toBe(401);
      // Tournament lookup should not be called when session is missing
      expect(prisma.tournament.findFirst).not.toHaveBeenCalled();
      expect(paginate).not.toHaveBeenCalled();
    });

    // Not found case - Returns 404 when tournament does not exist
    it('should return 404 when tournament not found', async () => {
      // Session is valid (from beforeEach), but tournament does not exist
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Tournament not found' });
      expect(result.status).toBe(404);
      expect(paginate).not.toHaveBeenCalled();
    });

    // Error case - Returns 500 when pagination function fails
    it('should return 500 when pagination function fails', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
      (paginate as jest.Mock).mockRejectedValue(new Error('Pagination error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Failed to fetch match race matches' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch match race matches', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Error case - Returns 500 when database error occurs during tournament check
    it('should return 500 when database error during tournament check', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Failed to fetch match race matches' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch match race matches', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Handles invalid page parameter (NaN)
    it('should handle invalid page parameter gracefully', async () => {
      const mockPaginateResult = {
        data: [],
        meta: { page: 1, limit: 50, total: 0, totalPages: 0 },
      };

      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches?page=invalid&limit=50');
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

    // Edge case - Handles invalid limit parameter (NaN)
    it('should handle invalid limit parameter gracefully', async () => {
      const mockPaginateResult = {
        data: [],
        meta: { page: 1, limit: 50, total: 0, totalPages: 0 },
      };

      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches?page=1&limit=invalid');
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

    // Success case - Returns matches ordered by matchNumber ascending
    it('should ensure matches are ordered by matchNumber in ascending order', async () => {
      const mockPaginateResult = {
        data: [
          { id: 'm1', matchNumber: 1 },
          { id: 'm2', matchNumber: 2 },
          { id: 'm3', matchNumber: 3 },
        ],
        meta: { page: 1, limit: 50, total: 3, totalPages: 1 },
      };

      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.status).toBe(200);
      expect(paginate).toHaveBeenCalledWith(
        expect.any(Object),
        { tournamentId: 't1' },
        { matchNumber: 'asc' },
        { page: 1, limit: 50 }
      );
    });
  });
});

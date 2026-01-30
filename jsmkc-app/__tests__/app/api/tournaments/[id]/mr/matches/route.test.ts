/**
 * @module MR Matches API Route Tests
 *
 * Test suite for the Match Race (MR) matches listing endpoint: /api/tournaments/[id]/mr/matches
 *
 * Covers the GET method with token-based authentication and paginated response:
 * - Success cases: Returns paginated matches with valid token, uses default pagination
 *   values (page=1, limit=50), handles custom page/limit parameters, and orders matches
 *   by matchNumber ascending.
 * - Authentication failure cases: Returns 401 when token is missing, empty, invalid,
 *   expired, or when the tournament does not exist.
 * - Error cases: Returns 500 when pagination function fails or when the database query
 *   fails during token validation.
 * - Edge cases: Handles invalid (NaN) page and limit parameters gracefully by falling
 *   back to default values.
 *
 * Dependencies mocked: @/lib/pagination, @/lib/logger, next/server, @/lib/prisma
 */
// @ts-nocheck


jest.mock('@/lib/pagination', () => ({ paginate: jest.fn() }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn() })) }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { paginate } from '@/lib/pagination';
import { GET } from '@/app/api/tournaments/[id]/mr/matches/route';

const NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };

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
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: unknown, options?: { status?: number }) => ({ data, status: options?.status || 200 }));
  });

  describe('GET - Fetch match race matches with token validation', () => {
    // Success case - Returns paginated matches with valid token
    it('should return paginated matches with valid token', async () => {
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

      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1', token: 'valid-token', tokenExpiresAt: new Date(Date.now() + 3600000) });
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches?token=valid-token&page=1&limit=50');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual(mockPaginateResult);
      expect(result.status).toBe(200);
      expect(prisma.tournament.findFirst).toHaveBeenCalledWith({
        where: {
          id: 't1',
          token: 'valid-token',
          tokenExpiresAt: { gt: expect.any(Date) }
        }
      });
      expect(paginate).toHaveBeenCalledWith(
        { findMany: prisma.mRMatch.findMany, count: prisma.mRMatch.count },
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

      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1', token: 'valid-token', tokenExpiresAt: new Date(Date.now() + 3600000) });
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches?token=valid-token');
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

      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1', token: 'valid-token', tokenExpiresAt: new Date(Date.now() + 3600000) });
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches?token=valid-token&page=2&limit=20');
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

    // Authentication failure case - Returns 401 when token is missing
    it('should return 401 when token is missing from query params', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Token required' });
      expect(result.status).toBe(401);
      expect(prisma.tournament.findFirst).not.toHaveBeenCalled();
      expect(paginate).not.toHaveBeenCalled();
    });

    // Authentication failure case - Returns 401 when token is empty string
    it('should return 401 when token is empty string', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches?token=');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Token required' });
      expect(result.status).toBe(401);
    });

    // Authentication failure case - Returns 401 when token is invalid
    it('should return 401 when token is invalid (does not match tournament)', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches?token=invalid-token');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Invalid or expired token' });
      expect(result.status).toBe(401);
      expect(paginate).not.toHaveBeenCalled();
    });

    // Authentication failure case - Returns 401 when token is expired
    // The source filters by tokenExpiresAt: { gt: new Date() }, so an expired token
    // results in findFirst returning null (the DB query excludes expired tokens)
    it('should return 401 when token is expired', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches?token=expired-token');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Invalid or expired token' });
      expect(result.status).toBe(401);
      expect(paginate).not.toHaveBeenCalled();
    });

    // Authentication failure case - Returns 401 when tournament does not exist
    it('should return 401 when tournament with given ID does not exist', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches?token=valid-token');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Invalid or expired token' });
      expect(result.status).toBe(401);
    });

    // Error case - Returns 500 when pagination function fails
    it('should return 500 when pagination function fails', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1', token: 'valid-token', tokenExpiresAt: new Date(Date.now() + 3600000) });
      (paginate as jest.Mock).mockRejectedValue(new Error('Pagination error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches?token=valid-token');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Failed to fetch match race matches' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch MR matches', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Error case - Returns 500 when database query fails during token validation
    it('should return 500 when database query fails during token validation', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches?token=valid-token');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Failed to fetch match race matches' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch MR matches', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Handles invalid page parameter (NaN)
    it('should handle invalid page parameter gracefully', async () => {
      const mockPaginateResult = {
        data: [],
        meta: { page: 1, limit: 50, total: 0, totalPages: 0 },
      };

      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1', token: 'valid-token', tokenExpiresAt: new Date(Date.now() + 3600000) });
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches?token=valid-token&page=invalid&limit=50');
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

      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1', token: 'valid-token', tokenExpiresAt: new Date(Date.now() + 3600000) });
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches?token=valid-token&page=1&limit=invalid');
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

      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1', token: 'valid-token', tokenExpiresAt: new Date(Date.now() + 3600000) });
      (paginate as jest.Mock).mockResolvedValue(mockPaginateResult);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/matches?token=valid-token');
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

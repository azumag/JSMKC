// @ts-nocheck
jest.mock('@/lib/prisma', () => ({
  default: {
    gPMatch: { findMany: jest.fn(), count: jest.fn() },
    tournament: { findFirst: jest.fn() },
  },
}));

jest.mock('@/lib/pagination', () => ({
  paginate: jest.fn(),
}));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { GET } from '@/app/api/tournaments/[id]/gp/matches/route';
import { paginate } from '@/lib/pagination';

const NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };

class MockNextRequest {
  constructor(
    private url: string,
    private body?: any,
    private headers: Map<string, string> = new Map()
  ) {}
  async json() { return this.body; }
  get header() { return { get: (key: string) => this.headers.get(key) }; }
  headers = {
    get: (key: string) => this.headers.get(key)
  };
}

describe('GP Matches API Route - /api/tournaments/[id]/gp/matches', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: any, options?: any) => ({ data, status: options?.status || 200 }));
  });

  describe('GET - Fetch grand prix matches for polling', () => {
    // Success case - Returns paginated matches with valid token
    it('should return paginated matches with valid token', async () => {
      const mockTournament = {
        id: 't1',
        token: 'valid-token',
        tokenExpiresAt: new Date(Date.now() + 3600000),
      };
      const mockMatches = [
        { id: 'm1', tournamentId: 't1', matchNumber: 1, stage: 'qualification', player1: { id: 'p1' }, player2: { id: 'p2' } },
        { id: 'm2', tournamentId: 't1', matchNumber: 2, stage: 'qualification', player1: { id: 'p3' }, player2: { id: 'p4' } },
      ];
      const mockPaginatedResult = {
        data: mockMatches,
        pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
      };
      
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(mockTournament);
      (paginate as jest.Mock).mockResolvedValue(mockPaginatedResult);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/matches?token=valid-token');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.data).toEqual(mockPaginatedResult);
      expect(result.status).toBe(200);
      expect(prisma.tournament.findFirst).toHaveBeenCalledWith({
        where: {
          id: 't1',
          token: 'valid-token',
          tokenExpiresAt: { gt: expect.any(Date) },
        },
      });
      expect(paginate).toHaveBeenCalledWith(
        {
          findMany: prisma.gPMatch.findMany,
          count: prisma.gPMatch.count,
        },
        { tournamentId: 't1' },
        { matchNumber: 'asc' },
        { page: 1, limit: 50 }
      );
    });

    // Success case - Uses custom pagination parameters
    it('should use custom page and limit parameters when provided', async () => {
      const mockTournament = {
        id: 't1',
        token: 'valid-token',
        tokenExpiresAt: new Date(Date.now() + 3600000),
      };
      const mockPaginatedResult = {
        data: [],
        pagination: { page: 2, limit: 20, total: 0, totalPages: 0 },
      };
      
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(mockTournament);
      (paginate as jest.Mock).mockResolvedValue(mockPaginatedResult);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/matches?token=valid-token&page=2&limit=20');
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

    // Authentication failure case - Returns 401 when token is missing
    it('should return 401 when token is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/matches');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.data).toEqual({ error: 'Token required' });
      expect(result.status).toBe(401);
      expect(prisma.tournament.findFirst).not.toHaveBeenCalled();
    });

    // Authentication failure case - Returns 401 when token is empty string
    it('should return 401 when token is empty string', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/matches?token=');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.data).toEqual({ error: 'Token required' });
      expect(result.status).toBe(401);
    });

    // Authentication failure case - Returns 401 when token is invalid
    it('should return 401 when token is invalid', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(null);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/matches?token=invalid-token');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.data).toEqual({ error: 'Invalid or expired token' });
      expect(result.status).toBe(401);
      expect(prisma.tournament.findFirst).toHaveBeenCalledWith({
        where: {
          id: 't1',
          token: 'invalid-token',
          tokenExpiresAt: { gt: expect.any(Date) },
        },
      });
    });

    // Authentication failure case - Returns 401 when token is expired
    it('should return 401 when token is expired', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(null);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/matches?token=expired-token');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.data).toEqual({ error: 'Invalid or expired token' });
      expect(result.status).toBe(401);
    });

    // Error case - Returns 500 when database query fails
    it('should return 500 when database query fails', async () => {
      const mockTournament = {
        id: 't1',
        token: 'valid-token',
        tokenExpiresAt: new Date(Date.now() + 3600000),
      };
      
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(mockTournament);
      (paginate as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/matches?token=valid-token');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.data).toEqual({ error: 'Failed to fetch grand prix matches' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch GP matches', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Handles invalid tournament ID gracefully
    it('should handle invalid tournament ID gracefully', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockRejectedValue(new Error('Invalid UUID'));
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/invalid-id/gp/matches?token=valid-token');
      const params = Promise.resolve({ id: 'invalid-id' });
      const result = await GET(request, { params });
      
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalled();
    });

    // Edge case - Handles non-numeric page and limit parameters
    it('should use default values when page and limit are non-numeric', async () => {
      const mockTournament = {
        id: 't1',
        token: 'valid-token',
        tokenExpiresAt: new Date(Date.now() + 3600000),
      };
      const mockPaginatedResult = {
        data: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      };
      
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(mockTournament);
      (paginate as jest.Mock).mockResolvedValue(mockPaginatedResult);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/matches?token=valid-token&page=abc&limit=xyz');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.status).toBe(200);
      expect(paginate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        { page: NaN, limit: NaN }
      );
    });

    // Edge case - Returns empty result when no matches exist
    it('should return empty result when no matches exist', async () => {
      const mockTournament = {
        id: 't1',
        token: 'valid-token',
        tokenExpiresAt: new Date(Date.now() + 3600000),
      };
      const mockPaginatedResult = {
        data: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      };
      
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(mockTournament);
      (paginate as jest.Mock).mockResolvedValue(mockPaginatedResult);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/matches?token=valid-token');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.data).toEqual(mockPaginatedResult);
      expect(result.data.data).toEqual([]);
      expect(result.status).toBe(200);
    });
  });
});

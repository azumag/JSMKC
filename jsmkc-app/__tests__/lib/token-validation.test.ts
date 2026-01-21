import { validateToken, getAccessTokenExpiry, validateTournamentToken, requireTournamentToken, TournamentContext } from '@/lib/token-validation';

import { NextRequest } from 'next/server';

// Mock NextResponse.json for middleware tests
jest.mock('next/server', () => ({
  NextRequest: jest.requireActual('next/server').NextRequest,
  NextResponse: {
    ...jest.requireActual('next/server').NextResponse,
    json: jest.fn((data, init) => {
      return {
        ...new Response(JSON.stringify(data), init),
        json: async () => data,
        status: init?.status || 200,
      };
    }),
  },
}));

describe('Token Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateToken', () => {
    it('should accept valid token format (shorter)', () => {
      const result = validateToken('short-token');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid token format (longer)', () => {
      const result = validateToken('longer-token');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty token', () => {
      const result = validateToken('');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject null token', () => {
      const result = validateToken(null as unknown as string);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toBe('Token is required');
    });

    it('should reject malformed token (invalid characters)', () => {
      const result = validateToken('invalid-token!@#$');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });

    it('should reject token with only dots', () => {
      const result = validateToken('....');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should accept valid token with characters', () => {
      const result = validateToken('abc.123');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('validateTournamentToken', () => {
    it('should validate tournament token and return tournament data', async () => {
      const mockPrisma = (await import('@/lib/prisma')).default;
      (mockPrisma.tournament.findUnique as jest.Mock).mockResolvedValue({
        id: 'tournament-1',
        name: 'Test Tournament',
        token: '0123456789abcdef0123456789abcdef',
        tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        date: new Date(),
      });

      const request = new NextRequest('http://localhost:3000/api/tournaments/tournament-1/token', {
        headers: new Headers({
          'x-tournament-token': '0123456789abcdef0123456789abcdef',
        }),
      });

      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.tournament?.id).toBe('tournament-1');
      expect(result.tournament?.name).toBeDefined();
    });

    it('should return error for missing token', async () => {
      const request = new NextRequest('http://localhost:3000/api/tournaments/tournament-1/token', {
        headers: new Headers(),
      });

      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token required');
    });

    it('should return error for invalid token format', async () => {
      const request = new NextRequest('http://localhost:3000/api/tournaments/tournament-1/token', {
        headers: new Headers({
          'x-tournament-token': 'invalid-token!@#$',
        }),
      });

      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });
  });

  describe('getAccessTokenExpiry', () => {
    it('should calculate expiry correctly for access token', () => {
      const expiry = getAccessTokenExpiry();
      expect(expiry).toBeGreaterThan(0);
    });

    it('should calculate expiry correctly for refresh token', () => {
      const expiry = getAccessTokenExpiry(true);
      expect(expiry).toBeGreaterThan(0);
    });

    it('should return correct format for access token (24 hours)', () => {
      const now = Date.now();
      const expiry = getAccessTokenExpiry(false);
      expect(expiry).toBeGreaterThanOrEqual(now + 24 * 60 * 60 * 1000);
      expect(expiry).toBeLessThan(now + 25 * 60 * 60 * 1000);
    });

    it('should return correct format for refresh token (168 hours)', () => {
      const now = Date.now();
      const expiry = getAccessTokenExpiry(true);
      expect(expiry).toBeGreaterThanOrEqual(now + 168 * 60 * 60 * 1000);
      expect(expiry).toBeLessThan(now + 169 * 60 * 60 * 1000);
    });

    it('should use 24 hours for access token', () => {
      const now = Date.now();
      const expiry = getAccessTokenExpiry(false);
      const expected = now + 24 * 60 * 60 * 1000;
      expect(expiry).toBeGreaterThanOrEqual(expected - 100);
      expect(expiry).toBeLessThan(expected + 100);
    });

    it('should use 168 hours for refresh token', () => {
      const now = Date.now();
      const expiry = getAccessTokenExpiry(true);
      const expected = now + 168 * 60 * 60 * 1000;
      expect(expiry).toBeGreaterThanOrEqual(expected - 100);
      expect(expiry).toBeLessThan(expected + 100);
    });
  });

  describe('validateTournamentToken - Additional Coverage', () => {
    it('should handle expired tournament token', async () => {
      const mockPrisma = (await import('@/lib/prisma')).default;
      (mockPrisma.tournament.findUnique as jest.Mock).mockResolvedValue({
        id: 'tournament-1',
        name: 'Test Tournament',
        token: '0123456789abcdef0123456789abcdef',
        tokenExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        date: new Date(),
      });

      const request = new NextRequest('http://localhost:3000/api/tournaments/tournament-1/token', {
        headers: new Headers({
          'x-tournament-token': '0123456789abcdef0123456789abcdef',
        }),
      });

      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token invalid or expired');
    });

    it('should handle tournament with no token', async () => {
      const mockPrisma = (await import('@/lib/prisma')).default;
      (mockPrisma.tournament.findUnique as jest.Mock).mockResolvedValue({
        id: 'tournament-1',
        name: 'Test Tournament',
        token: null,
        tokenExpiresAt: null,
        status: 'ACTIVE',
        date: new Date(),
      });

      const request = new NextRequest('http://localhost:3000/api/tournaments/tournament-1/token', {
        headers: new Headers({
          'x-tournament-token': '0123456789abcdef0123456789abcdef',
        }),
      });

      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token invalid or expired');
    });

    it('should handle server errors gracefully', async () => {
      const mockPrisma = (await import('@/lib/prisma')).default;
      (mockPrisma.tournament.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/tournaments/tournament-1/token', {
        headers: new Headers({
          'x-tournament-token': '0123456789abcdef0123456789abcdef',
        }),
      });

      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Validation failed');
    });

    it('should accept token from query parameter', async () => {
      const mockPrisma = (await import('@/lib/prisma')).default;
      (mockPrisma.tournament.findUnique as jest.Mock).mockResolvedValue({
        id: 'tournament-1',
        name: 'Test Tournament',
        token: '0123456789abcdef0123456789abcdef',
        tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        date: new Date(),
      });

      const request = new NextRequest('http://localhost:3000/api/tournaments/tournament-1/token?token=0123456789abcdef0123456789abcdef', {
        headers: new Headers(),
      });

      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(true);
      expect(result.tournament?.id).toBe('tournament-1');
    });

    it('should accept token from query parameter', async () => {
      const mockPrisma = (await import('@/lib/prisma')).default;
      const queryToken = '0123456789abcdef0123456789abcdef';
      (mockPrisma.tournament.findUnique as jest.Mock).mockResolvedValue({
        id: 'tournament-1',
        name: 'Test Tournament',
        token: queryToken,
        tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        date: new Date(),
      });

      const request = new NextRequest(`http://localhost:3000/api/tournaments/tournament-1/token?token=${queryToken}`, {
        headers: new Headers(),
      });

      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(true);
      expect(result.tournament?.id).toBe('tournament-1');
    });
  });

  describe('validateToken - Edge Cases', () => {
    it('should accept token with underscores', () => {
      const result = validateToken('test_token_123');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept token with dashes', () => {
      const result = validateToken('test-token-123');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept token with dots', () => {
      const result = validateToken('test.token.123');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept mixed valid characters', () => {
      const result = validateToken('aB1_-.2cD3_eF4');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject token with spaces', () => {
      const result = validateToken('test token');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });

    it('should reject undefined token', () => {
      const result = validateToken(undefined as unknown as string);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toBe('Token is required');
    });
  });

  describe('requireTournamentToken middleware', () => {
    it('should return 401 when validation fails', async () => {
      const mockPrisma = (await import('@/lib/prisma')).default;
      (mockPrisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

      const handler = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

      const middleware = requireTournamentToken(handler);
      const request = new NextRequest('http://localhost:3000/api/tournaments/tournament-1/token', {
        headers: new Headers(),
      });

      const context = {
        params: Promise.resolve({ id: 'tournament-1' }),
      } as TournamentContext;

      const response = await middleware(request, context);

      expect(handler).not.toHaveBeenCalled();
      expect(response.status).toBe(401);
      const responseData = await response.json();
      expect(responseData.success).toBe(false);
      expect(responseData.error).toBeDefined();
    });

    it('should call handler when validation succeeds', async () => {
      const mockPrisma = (await import('@/lib/prisma')).default;
      (mockPrisma.tournament.findUnique as jest.Mock).mockResolvedValue({
        id: 'tournament-1',
        name: 'Test Tournament',
        token: '0123456789abcdef0123456789abcdef',
        tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        date: new Date(),
      });

      const handler = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

      const middleware = requireTournamentToken(handler);
      const request = new NextRequest('http://localhost:3000/api/tournaments/tournament-1/token', {
        headers: new Headers({
          'x-tournament-token': '0123456789abcdef0123456789abcdef',
        }),
      });

      const context = {
        params: Promise.resolve({ id: 'tournament-1' }),
      } as TournamentContext;

      await middleware(request, context);

      expect(handler).toHaveBeenCalled();
      expect(context.tournament).toEqual({
        id: 'tournament-1',
        name: 'Test Tournament',
      });
    });
  });

  describe('validateTournamentToken - Tournament Context', () => {
    it('should return valid result for ACTIVE tournament', async () => {
      const mockPrisma = (await import('@/lib/prisma')).default;
      (mockPrisma.tournament.findUnique as jest.Mock).mockResolvedValue({
        id: 'tournament-1',
        name: 'Test Tournament',
        token: '0123456789abcdef0123456789abcdef',
        tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        date: new Date(),
      });

      const request = new NextRequest('http://localhost:3000/api/tournaments/tournament-1/token', {
        headers: new Headers({
          'x-tournament-token': '0123456789abcdef0123456789abcdef',
        }),
      });

      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(true);
      expect(result.tournament).toEqual({
        id: 'tournament-1',
        name: 'Test Tournament',
      });
    });
  });
});

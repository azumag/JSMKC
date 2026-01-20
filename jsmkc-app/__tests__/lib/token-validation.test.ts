import { validateToken, getAccessTokenExpiry, validateTournamentToken } from '@/lib/token-validation';

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    tournament: {
      findUnique: jest.fn(),
    },
    accessToken: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { NextRequest } from 'next/server';

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

    it('should return correct format', () => {
      const now = Date.now();
      const expiry = getAccessTokenExpiry();
      expect(expiry).toBeGreaterThanOrEqual(now + 24 * 60 * 60 * 1000);
      expect(expiry).toBeLessThan(now + 25 * 60 * 60 * 1000);
    });
  });
});

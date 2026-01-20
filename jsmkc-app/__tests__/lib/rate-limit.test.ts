import { rateLimit, checkRateLimit, getClientIdentifier, getUserAgent, clearRateLimitStore } from '@/lib/rate-limit';
import { NextRequest } from 'next/server';

describe('Rate Limiting', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clearRateLimitStore();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('rateLimit', () => {
    it('should allow first request within limit', async () => {
      const identifier = 'test-identifier';
      const limit = 10;

      const result = await rateLimit(identifier, limit, 60000);

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(limit - 1);
      expect(result.limit).toBe(limit);
      expect(result.retryAfter).toBeUndefined();
    });

    it('should allow multiple requests up to limit', async () => {
      const identifier = 'test-identifier';
      const limit = 10;

      // Test sequential requests
      const result1 = await rateLimit(identifier, limit, 60000);
      const result2 = await rateLimit(identifier, limit, 60000);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.remaining).toBe(limit - 1);
      expect(result2.remaining).toBe(limit - 2);
    });

    it('should block request exceeding limit', async () => {
      const identifier = 'test-identifier';
      const limit = 3;

      for (let i = 0; i < limit; i++) {
        await rateLimit(identifier, limit, 60000);
      }

      const result = await rateLimit(identifier, limit, 60000);

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.limit).toBe(limit);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should allow requests after time window expires', async () => {
      const identifier = 'test-identifier';
      const limit = 3;
      const windowMs = 100;

      // Mock Date.now() to control time for rate limiting
      const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(0);

      for (let i = 0; i < limit; i++) {
        await rateLimit(identifier, limit, windowMs);
      }

      // Advance time beyond the window
      dateNowSpy.mockReturnValue(windowMs + 50);

      const result = await rateLimit(identifier, limit, windowMs);

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(limit - 1);

      // Restore the original Date.now()
      dateNowSpy.mockRestore();
    });

    it('should count down remaining requests correctly', async () => {
      const identifier = 'test-identifier';
      const limit = 10;

      for (let i = 0; i < limit; i++) {
        const result = await rateLimit(identifier, limit, 60000);
        expect(result.success).toBe(true);
        expect(result.remaining).toBe(limit - i - 1);
      }
    });

    it('should handle multiple different identifiers independently', async () => {
      const limit = 10;

      const result1 = await rateLimit('identifier-1', limit, 60000);
      const result2 = await rateLimit('identifier-2', limit, 60000);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.remaining).toBe(limit - 1);
      expect(result2.remaining).toBe(limit - 1);
    });
  });

  describe('checkRateLimit', () => {
    it('should use correct config for scoreInput type', async () => {
      const result = await checkRateLimit('scoreInput', 'test-identifier');

      expect(result.success).toBe(true);
      expect(result.limit).toBe(20);
    });

    it('should use correct config for polling type', async () => {
      const result = await checkRateLimit('polling', 'test-identifier');

      expect(result.success).toBe(true);
      expect(result.limit).toBe(12);
    });

    it('should use correct config for tokenValidation type', async () => {
      const result = await checkRateLimit('tokenValidation', 'test-identifier');

      expect(result.success).toBe(true);
      expect(result.limit).toBe(10);
    });

    it('should use correct config for general type', async () => {
      const result = await checkRateLimit('general', 'test-identifier');

      expect(result.success).toBe(true);
      expect(result.limit).toBe(10);
    });
  });

  describe('getClientIdentifier', () => {
    it('should return x-forwarded-for header when present', () => {
      const request = new NextRequest('http://localhost:3000', {
        headers: new Headers({
          'x-forwarded-for': '192.168.1.100',
        }),
      });

      const identifier = getClientIdentifier(request);
      expect(identifier).toBe('192.168.1.100');
    });

    it('should return x-real-ip header when present', () => {
      const request = new NextRequest('http://localhost:3000', {
        headers: new Headers({
          'x-real-ip': '10.0.0.1',
        }),
      });

      const identifier = getClientIdentifier(request);
      expect(identifier).toBe('10.0.0.1');
    });

    it('should return cf-connecting-ip header when present', () => {
      const request = new NextRequest('http://localhost:3000', {
        headers: new Headers({
          'cf-connecting-ip': '203.0.113.1',
        }),
      });

      const identifier = getClientIdentifier(request);
      expect(identifier).toBe('203.0.113.1');
    });

    it('should return unknown when no IP headers present', () => {
      const request = new NextRequest('http://localhost:3000', {
        headers: new Headers({}),
      });

      const identifier = getClientIdentifier(request);
      expect(identifier).toBe('unknown');
    });

    it('should prioritize x-forwarded-for over other headers', () => {
      const request = new NextRequest('http://localhost:3000', {
        headers: new Headers({
          'x-forwarded-for': '192.168.1.100',
          'x-real-ip': '10.0.0.1',
          'cf-connecting-ip': '203.0.113.1',
        }),
      });

      const identifier = getClientIdentifier(request);
      expect(identifier).toBe('192.168.1.100');
    });
  });

  describe('getUserAgent', () => {
    it('should return user-agent header when present', () => {
      const request = new NextRequest('http://localhost:3000', {
        headers: new Headers({
          'user-agent': 'Mozilla/5.0 (compatible; TestBot/1.0)',
        }),
      });

      const userAgent = getUserAgent(request);
      expect(userAgent).toBe('Mozilla/5.0 (compatible; TestBot/1.0)');
    });

    it('should return unknown when user-agent header missing', () => {
      const request = new NextRequest('http://localhost:3000', {
        headers: new Headers({}),
      });

      const userAgent = getUserAgent(request);
      expect(userAgent).toBe('unknown');
    });
  });
});

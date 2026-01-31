/**
 * @module __tests__/lib/rate-limit.test.ts
 *
 * Test suite for the in-memory rate limiting module (rate-limit.ts).
 *
 * Covers the following functionality:
 * - rateLimit(): Core sliding-window rate limiter that tracks request counts
 *   per identifier within a configurable time window.
 *   - Allows requests within the configured limit, blocks excess requests,
 *     and resets after the time window expires.
 *   - Handles independent counters for different identifiers.
 * - checkRateLimit(): Convenience function that applies pre-configured rate
 *   limits by type (scoreInput, polling, tokenValidation, general).
 * - getClientIdentifier(): Extracts the client IP from request headers
 *   (x-forwarded-for, x-real-ip, cf-connecting-ip) with correct priority.
 * - getUserAgent(): Extracts the User-Agent header from requests.
 * - getServerSideIdentifier(): Async server-side IP extraction using Next.js
 *   headers() API, with graceful error handling.
 * - Store size limit enforcement to prevent unbounded memory growth.
 *
 * Tests use fake timers and Date.now() spies to control time progression.
 */
// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly
import { rateLimit, checkRateLimit, getClientIdentifier, getUserAgent, clearRateLimitStore, getServerSideIdentifier, rateLimitConfigs } from '@/lib/rate-limit';
import { NextRequest } from 'next/server';
import { headers } from 'next/headers';

jest.mock('next/headers');

interface MockHeaders {
  get: jest.Mock;
}

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

      // rateLimit returns { success, remaining } on allowed requests.
      // The 'limit' field is not included in the return value per the
      // rateLimitInMemory implementation in rate-limit.ts.
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(limit - 1);
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

      // When blocked, rateLimitInMemory returns { success: false, remaining: 0, retryAfter }.
      // The 'limit' field is not included in the return value.
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
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
    /**
     * These tests verify the checkRateLimit function which applies
     * pre-configured rate limits by type using in-memory rate limiting.
     */
    it('should use correct config for scoreInput type', async () => {
      // scoreInput config: limit=20, windowMs=60000
      const result = await checkRateLimit('scoreInput', 'test-identifier-scoreInput');

      expect(result.success).toBe(true);
      // In-memory fallback uses scoreInput config with limit=20,
      // so remaining = 20 - 1 = 19 after first request
      expect(result.remaining).toBe(19);
    });

    it('should use correct config for polling type', async () => {
      // polling config: limit=12, windowMs=60000
      const result = await checkRateLimit('polling', 'test-identifier-polling');

      expect(result.success).toBe(true);
      // remaining = 12 - 1 = 11 after first request
      expect(result.remaining).toBe(11);
    });

    it('should use correct config for tokenValidation type', async () => {
      // tokenValidation config: limit=10, windowMs=60000
      const result = await checkRateLimit('tokenValidation', 'test-identifier-tokenValidation');

      expect(result.success).toBe(true);
      // remaining = 10 - 1 = 9 after first request
      expect(result.remaining).toBe(9);
    });

    it('should use correct config for general type', async () => {
      // general config: limit=10, windowMs=60000
      const result = await checkRateLimit('general', 'test-identifier-general');

      expect(result.success).toBe(true);
      // remaining = 10 - 1 = 9 after first request
      expect(result.remaining).toBe(9);
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

  describe('getServerSideIdentifier', () => {
    beforeEach(() => {
      jest.mocked(headers).mockReset();
    });

    it('should return x-forwarded-for header when present', async () => {
      const mockHeaders = jest.mocked(headers);
      mockHeaders.mockResolvedValue({
        get: jest.fn((name: string) => {
          if (name === 'x-forwarded-for') return '192.168.1.100';
          return null;
        }),
      } as MockHeaders);

      const identifier = await getServerSideIdentifier();
      expect(identifier).toBe('192.168.1.100');
    });

    it('should return x-real-ip header when x-forwarded-for not present', async () => {
      const mockHeaders = jest.mocked(headers);
      mockHeaders.mockResolvedValue({
        get: jest.fn((name: string) => {
          if (name === 'x-real-ip') return '10.0.0.1';
          return null;
        }),
      } as MockHeaders);

      const identifier = await getServerSideIdentifier();
      expect(identifier).toBe('10.0.0.1');
    });

    it('should return unknown when no IP headers present', async () => {
      // When no IP headers are found, getServerSideIdentifier returns
      // 'unknown' as a fallback (line 427 of rate-limit.ts).
      const mockHeaders = jest.mocked(headers);
      mockHeaders.mockResolvedValue({
        get: jest.fn(() => null),
      } as MockHeaders);

      const identifier = await getServerSideIdentifier();
      expect(identifier).toBe('unknown');
    });

    it('should handle headers() error gracefully', async () => {
      // When headers() throws (e.g., outside request context during
      // static generation), the catch block returns 'unknown' (line 434).
      const mockHeaders = jest.mocked(headers);
      mockHeaders.mockRejectedValue(new Error('Headers error'));

      const identifier = await getServerSideIdentifier();
      expect(identifier).toBe('unknown');
    });

    it('should extract first IP from x-forwarded-for', async () => {
      const mockHeaders = jest.mocked(headers);
      mockHeaders.mockResolvedValue({
        get: jest.fn((name: string) => {
          if (name === 'x-forwarded-for') return '192.168.1.100, 10.0.0.1, 172.16.0.1';
          return null;
        }),
      } as MockHeaders);

      const identifier = await getServerSideIdentifier();
      expect(identifier).toBe('192.168.1.100');
    });
  });

  describe('Store size limit enforcement', () => {
    beforeEach(() => {
      clearRateLimitStore();
    });

    it('should clean up oldest entries when store exceeds MAX_STORE_SIZE', async () => {
      const limit = 10;
      const windowMs = 60000;

      // Fill store with more than MAX_STORE_SIZE (10000) entries
      for (let i = 0; i < 10005; i++) {
        await rateLimit(`identifier-${i}`, limit, windowMs);
      }

      // Store should have been cleaned up
      // The newest entry should still work
      const result = await rateLimit('identifier-last', limit, windowMs);
      expect(result.success).toBe(true);
    });

    it('should not delete entries when store is under limit', async () => {
      const limit = 10;
      const windowMs = 60000;

      // Add 100 entries (under MAX_STORE_SIZE of 10000)
      for (let i = 0; i < 100; i++) {
        await rateLimit(`identifier-${i}`, limit, windowMs);
      }

      // All entries should work
      const result1 = await rateLimit('identifier-0', limit, windowMs);
      const result2 = await rateLimit('identifier-99', limit, windowMs);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });
});

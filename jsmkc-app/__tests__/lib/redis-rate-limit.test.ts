/**
 * @module __tests__/lib/redis-rate-limit.test.ts
 *
 * Test suite for the Redis-backed rate limiting module (redis-rate-limit.ts).
 *
 * This module implements a sliding-window rate limiter using Redis sorted sets.
 * Covers the following functionality:
 * - checkRateLimit(): Core rate-limiting logic that uses Redis ZREMRANGEBYSCORE,
 *   ZADD, ZCARD, and EXPIRE commands to enforce request limits within time windows.
 *   - Allows requests within limits, blocks excess requests, and calculates
 *     retryAfter values from the oldest request timestamp.
 *   - Gracefully falls back to allowing requests when Redis is unavailable.
 * - rateLimitConfigs: Pre-defined configurations for scoreInput (20/min),
 *   polling (12/min), tokenValidation (10/min), and general (10/min).
 * - checkRateLimitByType(): Convenience wrapper that selects config by type name.
 * - clearRateLimitData(): Clears rate limit data for a specific identifier or all.
 * - Edge cases: zero limits, very small/large windows, and Redis error handling.
 *
 * All Redis operations are mocked to test the rate limiting logic without
 * requiring a running Redis instance.
 *
 * Key implementation details from the source:
 * - Redis key format: "ratelimit:{identifier}" (no underscore)
 * - Operation order: zRemRangeByScore -> zAdd -> zCard -> expire
 * - Denial check: requestCount > config.limit (strictly greater than)
 * - RateLimitResult has: success, remaining, retryAfter (NO limit property)
 * - remaining = config.limit - requestCount (on success)
 * - On Redis error fallback: remaining = config.limit
 * - Member format for sorted set: "{timestamp}:{randomString}"
 * - checkRateLimitByType compositeIdentifier: "{identifier}:{type}"
 */
// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  checkRateLimit,
  rateLimitConfigs,
  checkRateLimitByType,
  clearRateLimitData,
  resetRedisClientForTest,
  setMockRedisClientForTesting,
} from '@/lib/redis-rate-limit';

// Mock Redis module
jest.mock('redis', () => ({
  createClient: jest.fn(),
}));

// Mock logger to avoid console output in tests
jest.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  }),
}));

describe('Redis Rate Limit', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRedisClient: any;
  let mockZRemRangeByScore: jest.Mock;
  let mockZCard: jest.Mock;
  let mockZRange: jest.Mock;
  let mockZAdd: jest.Mock;
  let mockExpire: jest.Mock;
  let mockDel: jest.Mock;
  let mockKeys: jest.Mock;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Reset the cached Redis client so tests can provide their own mocks
    resetRedisClientForTest();

    // Create mock Redis client with proper implementations.
    // The source performs operations in order: zRemRangeByScore, zAdd, zCard, expire.
    // zCard returns the count AFTER zAdd has already added the current request.
    mockZRemRangeByScore = jest.fn().mockResolvedValue(0);
    mockZCard = jest.fn().mockResolvedValue(1);
    mockZRange = jest.fn().mockResolvedValue([]);
    mockZAdd = jest.fn().mockResolvedValue(1);
    mockExpire = jest.fn().mockResolvedValue(1);
    mockDel = jest.fn().mockResolvedValue(1);
    mockKeys = jest.fn().mockResolvedValue([]);

    mockRedisClient = {
      zRemRangeByScore: mockZRemRangeByScore,
      zCard: mockZCard,
      zRange: mockZRange,
      zAdd: mockZAdd,
      expire: mockExpire,
      del: mockDel,
      keys: mockKeys,
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
    };

    // Set the mock before any rate limit function is called
    setMockRedisClientForTesting(mockRedisClient);
  });

  afterEach(() => {
    // Clear any cached modules
    jest.resetModules();
  });

  describe('checkRateLimit', () => {
    it('should allow requests within limit', async () => {
      // zCard returns 1 because we just added the current request via zAdd
      mockZCard.mockResolvedValue(1);

      const config = { limit: 5, windowMs: 60000 };
      const result = await checkRateLimit('user123', config);

      // remaining = config.limit - requestCount = 5 - 1 = 4
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.retryAfter).toBeUndefined();

      // Verify all Redis operations were called in order
      expect(mockZRemRangeByScore).toHaveBeenCalled();
      expect(mockZAdd).toHaveBeenCalled();
      expect(mockZCard).toHaveBeenCalled();
      expect(mockExpire).toHaveBeenCalled();
    });

    it('should deny requests exceeding limit', async () => {
      // requestCount > limit triggers denial (strictly greater than)
      // With limit=5, zCard must return 6 or more to exceed
      mockZCard.mockResolvedValue(6);

      const result = await checkRateLimit('user123', { limit: 5, windowMs: 60000 });

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should calculate retryAfter correctly', async () => {
      const now = Date.now();
      const windowMs = 60000;
      const oldestTimestamp = now - 30000; // 30 seconds ago

      // requestCount > limit to trigger rate limit denial
      mockZCard.mockResolvedValue(6);
      // Source parses oldest entry as entry.split(':')[0], so member format is "timestamp:random"
      mockZRange.mockResolvedValue([`${oldestTimestamp}:abc123`]);

      const result = await checkRateLimit('user123', { limit: 5, windowMs });

      expect(result.success).toBe(false);
      // retryAfter = Math.max(1, Math.ceil((oldestTimestamp + windowMs - now) / 1000))
      // = Math.max(1, Math.ceil((now - 30000 + 60000 - now) / 1000))
      // = Math.max(1, Math.ceil(30000 / 1000))
      // = 30
      expect(result.retryAfter).toBe(Math.max(1, Math.ceil((oldestTimestamp + windowMs - now) / 1000)));
    });

    it('should handle multiple requests within window', async () => {
      const config = { limit: 3, windowMs: 60000 };

      // First request - zCard returns 1 (one request in window after adding)
      mockZCard.mockResolvedValue(1);
      const result1 = await checkRateLimit('user123', config);
      expect(result1.success).toBe(true);
      expect(result1.remaining).toBe(2); // 3 - 1 = 2

      // Second request - zCard returns 2 (two requests in window after adding)
      mockZCard.mockResolvedValue(2);
      const result2 = await checkRateLimit('user123', config);
      expect(result2.success).toBe(true);
      expect(result2.remaining).toBe(1); // 3 - 2 = 1

      // Third request - zCard returns 3 (three requests = limit, but not exceeding)
      // Since the check is requestCount > limit, 3 > 3 is false, so it passes
      mockZCard.mockResolvedValue(3);
      const result3 = await checkRateLimit('user123', config);
      expect(result3.success).toBe(true);
      expect(result3.remaining).toBe(0); // 3 - 3 = 0

      // Fourth request (exceeds limit) - zCard returns 4 (4 > 3 is true)
      mockZCard.mockResolvedValue(4);
      const result4 = await checkRateLimit('user123', config);
      expect(result4.success).toBe(false);
      expect(result4.remaining).toBe(0);
    });

    it('should expire entries outside window', async () => {
      const now = Date.now();
      const windowMs = 60000;
      const windowStart = now - windowMs;

      await checkRateLimit('user123', { limit: 5, windowMs });

      // Source uses key format "ratelimit:{identifier}" and passes (key, 0, windowStart)
      expect(mockZRemRangeByScore).toHaveBeenCalledWith(
        'ratelimit:user123',
        0,
        expect.any(Number)
      );

      // Verify the windowStart argument is approximately correct (within a few ms)
      const actualWindowStart = mockZRemRangeByScore.mock.calls[0][2];
      expect(actualWindowStart).toBeGreaterThanOrEqual(windowStart - 10);
      expect(actualWindowStart).toBeLessThanOrEqual(windowStart + 10);
    });

    it('should handle Redis errors gracefully', async () => {
      // Make zRemRangeByScore fail to simulate Redis connection failure
      mockZRemRangeByScore.mockRejectedValue(new Error('Redis connection failed'));

      const result = await checkRateLimit('user123', { limit: 5, windowMs: 60000 });

      // Fallback: allow request when Redis fails, remaining = config.limit
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(5);
    });

    it('should handle empty range result', async () => {
      // requestCount > limit to trigger denial
      mockZCard.mockResolvedValue(6);
      mockZRange.mockResolvedValue([]);

      const result = await checkRateLimit('user123', { limit: 5, windowMs: 60000 });

      expect(result.success).toBe(false);
      // When zRange returns empty, retryAfter defaults to windowSeconds = Math.ceil(60000/1000) = 60
      // Then Math.max(1, retryAfter) = 60 (retryAfter is set as windowSeconds, but not passed through Math.max for default)
      // Actually: let retryAfter = windowSeconds; ... return Math.max(1, retryAfter)
      expect(result.retryAfter).toBeGreaterThanOrEqual(1);
    });

    it('should use correct Redis key format', async () => {
      await checkRateLimit('user123', { limit: 5, windowMs: 60000 });

      // Source uses "ratelimit:{identifier}" format (no underscore)
      expect(mockZRemRangeByScore).toHaveBeenCalledWith(
        'ratelimit:user123',
        expect.any(Number),
        expect.any(Number)
      );
      expect(mockZAdd).toHaveBeenCalledWith('ratelimit:user123', expect.any(Object));
      expect(mockZCard).toHaveBeenCalledWith('ratelimit:user123');
      expect(mockExpire).toHaveBeenCalledWith('ratelimit:user123', expect.any(Number));
    });

    it('should handle different identifiers', async () => {
      await checkRateLimit('user456', { limit: 5, windowMs: 60000 });

      expect(mockZRemRangeByScore).toHaveBeenCalledWith(
        'ratelimit:user456',
        expect.any(Number),
        expect.any(Number)
      );
    });
  });

  describe('rateLimitConfigs', () => {
    it('should have predefined configuration for score input', () => {
      expect(rateLimitConfigs.scoreInput).toBeDefined();
      expect(rateLimitConfigs.scoreInput.limit).toBe(20);
      expect(rateLimitConfigs.scoreInput.windowMs).toBe(60000);
    });

    it('should have predefined configuration for polling', () => {
      expect(rateLimitConfigs.polling).toBeDefined();
      expect(rateLimitConfigs.polling.limit).toBe(12);
      expect(rateLimitConfigs.polling.windowMs).toBe(60000);
    });

    it('should have predefined configuration for token validation', () => {
      expect(rateLimitConfigs.tokenValidation).toBeDefined();
      expect(rateLimitConfigs.tokenValidation.limit).toBe(10);
      expect(rateLimitConfigs.tokenValidation.windowMs).toBe(60000);
    });

    it('should have predefined configuration for general', () => {
      expect(rateLimitConfigs.general).toBeDefined();
      expect(rateLimitConfigs.general.limit).toBe(10);
      expect(rateLimitConfigs.general.windowMs).toBe(60000);
    });
  });

  describe('checkRateLimitByType', () => {
    it('should use score input configuration', async () => {
      // zCard returns 1 (one request in window), remaining = 20 - 1 = 19
      mockZCard.mockResolvedValue(1);

      const result = await checkRateLimitByType('scoreInput', 'user123');

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(19);
    });

    it('should use polling configuration', async () => {
      // zCard returns 1, remaining = 12 - 1 = 11
      mockZCard.mockResolvedValue(1);

      const result = await checkRateLimitByType('polling', 'user123');

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(11);
    });

    it('should use token validation configuration', async () => {
      // zCard returns 1, remaining = 10 - 1 = 9
      mockZCard.mockResolvedValue(1);

      const result = await checkRateLimitByType('tokenValidation', 'user123');

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('should use general configuration for unknown type', async () => {
      // zCard returns 1, remaining = 10 - 1 = 9
      mockZCard.mockResolvedValue(1);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await checkRateLimitByType('unknown' as any, 'user123');

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('should call checkRateLimit with correct composite key', async () => {
      // checkRateLimitByType creates compositeIdentifier = "{identifier}:{type}"
      // So the Redis key becomes "ratelimit:user123:scoreInput"
      await checkRateLimitByType('scoreInput', 'user123');

      expect(mockZCard).toHaveBeenCalledWith('ratelimit:user123:scoreInput');
    });
  });

  describe('clearRateLimitData', () => {
    it('should clear rate limit data for specific identifier', async () => {
      mockDel.mockResolvedValue(1);

      await clearRateLimitData('user123');

      // Source uses "ratelimit:{identifier}" format
      expect(mockDel).toHaveBeenCalledWith('ratelimit:user123');
    });

    it('should clear all rate limit data when no identifier provided', async () => {
      mockKeys.mockResolvedValue(['ratelimit:user1', 'ratelimit:user2', 'ratelimit:user3']);
      mockDel.mockResolvedValue(3);

      await clearRateLimitData();

      // Source uses "ratelimit:*" pattern for keys lookup
      expect(mockKeys).toHaveBeenCalledWith('ratelimit:*');
      expect(mockDel).toHaveBeenCalledWith(['ratelimit:user1', 'ratelimit:user2', 'ratelimit:user3']);
    });

    it('should handle empty rate limit data', async () => {
      mockKeys.mockResolvedValue([]);

      await clearRateLimitData();

      expect(mockKeys).toHaveBeenCalledWith('ratelimit:*');
      // Source checks: if (keys.length > 0) before calling del
      expect(mockDel).not.toHaveBeenCalled();
    });

    it('should handle clear errors gracefully', async () => {
      mockDel.mockRejectedValue(new Error('Clear failed'));

      // Source wraps everything in try/catch and logs error, does not throw
      await expect(clearRateLimitData('user123')).resolves.not.toThrow();
    });

    it('should handle keys errors gracefully', async () => {
      mockKeys.mockRejectedValue(new Error('Keys failed'));

      // Source wraps everything in try/catch and logs error, does not throw
      await expect(clearRateLimitData()).resolves.not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero limit by returning limit exceeded', async () => {
      // With limit=0, after adding a request zCard returns 1.
      // 1 > 0 is true, so the request is denied.
      mockZCard.mockResolvedValue(1);

      const result = await checkRateLimit('user123', { limit: 0, windowMs: 60000 });

      // With limit of 0, any request exceeds limit
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should handle very small window', async () => {
      mockZCard.mockResolvedValue(1);

      const result = await checkRateLimit('user123', { limit: 5, windowMs: 100 });

      expect(result.success).toBe(true);
      // Source uses "ratelimit:{identifier}" key format
      expect(mockZRemRangeByScore).toHaveBeenCalledWith(
        'ratelimit:user123',
        0,
        expect.any(Number)
      );
    });

    it('should handle very large limit', async () => {
      // zCard returns 1 (one request in window), remaining = 10000 - 1 = 9999
      mockZCard.mockResolvedValue(1);

      const result = await checkRateLimit('user123', { limit: 10000, windowMs: 60000 });

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(9999);
    });

    it('should handle very large window', async () => {
      mockZCard.mockResolvedValue(1);

      const result = await checkRateLimit('user123', { limit: 5, windowMs: 3600000 });

      expect(result.success).toBe(true);
    });
  });
});

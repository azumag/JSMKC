// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  checkRateLimit,
  rateLimitConfigs,
  checkRateLimitByType,
  clearRateLimitData,
} from '@/lib/redis-rate-limit';

// Mock Redis module
jest.mock('redis', () => ({
  createClient: jest.fn(),
}));

// Mock logger to avoid console output in tests
jest.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: jest.fn(),
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

    // Set environment to non-test value so actual mock is used
    // The module creates a mock client when NODE_ENV is 'test'
    // We want to use our mock instead
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    // Create mock Redis client
    mockZRemRangeByScore = jest.fn().mockResolvedValue(0);
    mockZCard = jest.fn().mockResolvedValue(0);
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

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const redis = require('redis');
    redis.createClient.mockReturnValue(mockRedisClient);

    // Restore environment
    if (originalEnv) {
      process.env.NODE_ENV = originalEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  });

  afterEach(() => {
    // Clear any cached modules
    jest.resetModules();
  });

  describe('checkRateLimit', () => {
    it('should allow requests within limit', async () => {
      mockZCard.mockResolvedValue(0);

      const config = { limit: 5, windowMs: 60000 };
      const result = await checkRateLimit('user123', config);

      // Log result for debugging
      // console.log('Result:', result);
      // console.log('Config:', config);
      // console.log('mockZCard calls:', mockZCard.mock.calls);

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.limit).toBe(5);
      expect(result.retryAfter).toBeUndefined();

      expect(mockZRemRangeByScore).toHaveBeenCalled();
      expect(mockZCard).toHaveBeenCalled();
      expect(mockZAdd).toHaveBeenCalled();
      expect(mockExpire).toHaveBeenCalled();
    });

    it('should deny requests exceeding limit', async () => {
      Date.now();
      mockZCard.mockResolvedValue(5);

      const result = await checkRateLimit('user123', { limit: 5, windowMs: 60000 });

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.limit).toBe(5);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should calculate retryAfter correctly', async () => {
      const now = Date.now();
      const windowMs = 60000;
      const oldestTimestamp = now - 30000; // 30 seconds ago

      mockZCard.mockResolvedValue(5);
      mockZRange.mockResolvedValue([oldestTimestamp.toString()]);

      const result = await checkRateLimit('user123', { limit: 5, windowMs });

      expect(result.success).toBe(false);
      expect(result.retryAfter).toBe(Math.ceil((oldestTimestamp + windowMs - now) / 1000));
    });

    it('should handle multiple requests within window', async () => {
      const config = { limit: 3, windowMs: 60000 };

      // First request
      const result1 = await checkRateLimit('user123', config);
      expect(result1.success).toBe(true);
      expect(result1.remaining).toBe(2);

      // Second request
      const result2 = await checkRateLimit('user123', config);
      expect(result2.success).toBe(true);
      expect(result2.remaining).toBe(1);

      // Third request
      const result3 = await checkRateLimit('user123', config);
      expect(result3.success).toBe(true);
      expect(result3.remaining).toBe(0);

      // Fourth request (exceeds limit)
      mockZCard.mockResolvedValue(3);
      const result4 = await checkRateLimit('user123', config);
      expect(result4.success).toBe(false);
      expect(result4.remaining).toBe(0);
    });

    it('should expire entries outside window', async () => {
      const now = Date.now();
      const windowStart = now - 60000;

      await checkRateLimit('user123', { limit: 5, windowMs: 60000 });

      expect(mockZRemRangeByScore).toHaveBeenCalledWith(
        `rate_limit:user123`,
        0,
        windowStart
      );
    });

    it('should handle Redis errors gracefully', async () => {
      mockZCard.mockRejectedValue(new Error('Redis connection failed'));

      const result = await checkRateLimit('user123', { limit: 5, windowMs: 60000 });

      // Fallback to allow request when Redis fails
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.limit).toBe(5);
    });

    it('should handle empty range result', async () => {
      mockZCard.mockResolvedValue(5);
      mockZRange.mockResolvedValue([]);

      const result = await checkRateLimit('user123', { limit: 5, windowMs: 60000 });

      expect(result.success).toBe(false);
      expect(result.retryAfter).toBeGreaterThanOrEqual(0);
    });

    it('should use correct Redis key format', async () => {
      await checkRateLimit('user123', { limit: 5, windowMs: 60000 });

      expect(mockZRemRangeByScore).toHaveBeenCalledWith(
        'rate_limit:user123',
        expect.any(Number),
        expect.any(Number)
      );
      expect(mockZCard).toHaveBeenCalledWith('rate_limit:user123');
      expect(mockZAdd).toHaveBeenCalledWith('rate_limit:user123', expect.any(Object));
      expect(mockExpire).toHaveBeenCalledWith('rate_limit:user123', expect.any(Number));
    });

    it('should handle different identifiers', async () => {
      await checkRateLimit('user456', { limit: 5, windowMs: 60000 });

      expect(mockZRemRangeByScore).toHaveBeenCalledWith(
        'rate_limit:user456',
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
      const result = await checkRateLimitByType('scoreInput', 'user123');

      expect(result.limit).toBe(20);
      expect(result.remaining).toBe(19);
    });

    it('should use polling configuration', async () => {
      const result = await checkRateLimitByType('polling', 'user123');

      expect(result.limit).toBe(12);
      expect(result.remaining).toBe(11);
    });

    it('should use token validation configuration', async () => {
      const result = await checkRateLimitByType('tokenValidation', 'user123');

      expect(result.limit).toBe(10);
      expect(result.remaining).toBe(9);
    });

    it('should use general configuration for unknown type', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await checkRateLimitByType('unknown' as any, 'user123');

      expect(result.limit).toBe(10);
      expect(result.remaining).toBe(9);
    });

    it('should call checkRateLimit with correct parameters', async () => {
      await checkRateLimitByType('scoreInput', 'user123');

      expect(mockZCard).toHaveBeenCalledWith('rate_limit:user123');
    });
  });

  describe('clearRateLimitData', () => {
    it('should clear rate limit data for specific identifier', async () => {
      mockDel.mockResolvedValue(1);

      await clearRateLimitData('user123');

      expect(mockDel).toHaveBeenCalledWith('rate_limit:user123');
    });

    it('should clear all rate limit data when no identifier provided', async () => {
      mockKeys.mockResolvedValue(['rate_limit:user1', 'rate_limit:user2', 'rate_limit:user3']);
      mockDel.mockResolvedValue(3);

      await clearRateLimitData();

      expect(mockKeys).toHaveBeenCalledWith('rate_limit:*');
      expect(mockDel).toHaveBeenCalledWith(['rate_limit:user1', 'rate_limit:user2', 'rate_limit:user3']);
    });

    it('should handle empty rate limit data', async () => {
      mockKeys.mockResolvedValue([]);

      await clearRateLimitData();

      expect(mockKeys).toHaveBeenCalledWith('rate_limit:*');
      expect(mockDel).not.toHaveBeenCalled();
    });

    it('should handle null keys response', async () => {
      mockKeys.mockResolvedValue(null);

      await clearRateLimitData();

      expect(mockKeys).toHaveBeenCalledWith('rate_limit:*');
      expect(mockDel).not.toHaveBeenCalled();
    });

    it('should handle undefined keys response', async () => {
      mockKeys.mockResolvedValue(undefined);

      await clearRateLimitData();

      expect(mockKeys).toHaveBeenCalledWith('rate_limit:*');
      expect(mockDel).not.toHaveBeenCalled();
    });

    it('should handle clear errors gracefully', async () => {
      mockDel.mockRejectedValue(new Error('Clear failed'));

      await expect(clearRateLimitData('user123')).resolves.not.toThrow();
    });

    it('should handle keys errors gracefully', async () => {
      mockKeys.mockRejectedValue(new Error('Keys failed'));

      await expect(clearRateLimitData()).resolves.not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero limit by returning limit exceeded', async () => {
      mockZCard.mockResolvedValue(0);

      const result = await checkRateLimit('user123', { limit: 0, windowMs: 60000 });

      // With limit of 0, any request exceeds limit
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should handle very small window', async () => {
      const result = await checkRateLimit('user123', { limit: 5, windowMs: 100 });

      expect(result.success).toBe(true);
      expect(mockZRemRangeByScore).toHaveBeenCalledWith(
        'rate_limit:user123',
        0,
        expect.any(Number)
      );
    });

    it('should handle very large limit', async () => {
      mockZCard.mockResolvedValue(0);

      const result = await checkRateLimit('user123', { limit: 10000, windowMs: 60000 });

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(9999);
    });

    it('should handle very large window', async () => {
      const result = await checkRateLimit('user123', { limit: 5, windowMs: 3600000 });

      expect(result.success).toBe(true);
    });
  });
});

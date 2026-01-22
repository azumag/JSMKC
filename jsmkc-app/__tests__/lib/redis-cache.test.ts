// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  getCache,
  setCache,
  deleteCache,
  clearAllCache,
  createCacheKey,
  getStandingsCache,
  setStandingsCache,
  invalidateStandingsCache,
  getTournamentCache,
  setTournamentCache,
  invalidateTournamentCache,
} from '@/lib/redis-cache';

// Mock the Redis module
jest.mock('redis', () => ({
  createClient: jest.fn(),
}));

// Mock logger to avoid console output in tests
jest.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }),
}));

describe('Redis Cache', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRedisClient: any;
  let mockGet: jest.Mock;
  let mockSet: jest.Mock;
  let mockDel: jest.Mock;
  let mockKeys: jest.Mock;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Create mock Redis client
    mockGet = jest.fn();
    mockSet = jest.fn();
    mockDel = jest.fn();
    mockKeys = jest.fn();

    mockRedisClient = {
      get: mockGet,
      set: mockSet,
      del: mockDel,
      keys: mockKeys,
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
    };

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const redis = require('redis');
    redis.createClient.mockReturnValue(mockRedisClient);
  });

  afterEach(() => {
    // Clear any cached modules
    jest.resetModules();
  });

  describe('createCacheKey', () => {
    it('should create a cache key with namespace and parts', () => {
      const key = createCacheKey('standings', '123', 'finals');
      expect(key).toBe('cache:standings:123:finals');
    });

    it('should handle single part', () => {
      const key = createCacheKey('tournament', '456');
      expect(key).toBe('cache:tournament:456');
    });

    it('should handle multiple parts', () => {
      const key = createCacheKey('data', 'a', 'b', 'c', 'd');
      expect(key).toBe('cache:data:a:b:c:d');
    });
  });

  describe('getCache', () => {
    it('should return null for non-existent key', async () => {
      mockGet.mockResolvedValue(null);

      const result = await getCache('non-existent-key');
      expect(result).toBeNull();
      expect(mockGet).toHaveBeenCalledWith('non-existent-key');
    });

    it('should return cached data for existing key', async () => {
      const testData = { id: 1, name: 'Test' };
      const entry = {
        data: testData,
        timestamp: Date.now(),
        ttl: 300000,
      };
      mockGet.mockResolvedValue(JSON.stringify(entry));

      const result = await getCache('existing-key');
      expect(result).toEqual(testData);
      expect(mockGet).toHaveBeenCalledWith('existing-key');
    });

    it('should return null for expired cache entry', async () => {
      const testData = { id: 1 };
      const entry = {
        data: testData,
        timestamp: Date.now() - 400000, // Expired (400s ago, TTL is 300s)
        ttl: 300000,
      };
      mockGet.mockResolvedValue(JSON.stringify(entry));

      const result = await getCache('expired-key');
      expect(result).toBeNull();
      expect(mockDel).toHaveBeenCalledWith('expired-key');
    });

    it('should return null when cache get throws error', async () => {
      mockGet.mockRejectedValue(new Error('Redis connection failed'));

      const result = await getCache('error-key');
      expect(result).toBeNull();
    });

    it('should handle null and undefined values', async () => {
      mockGet.mockResolvedValue(JSON.stringify({ data: null, timestamp: Date.now(), ttl: 300000 }));

      const result = await getCache('null-key');
      expect(result).toBeNull();
    });

    it('should handle complex nested objects', async () => {
      const testData = {
        nested: {
          deep: {
            value: 'test',
          },
        },
        array: [1, 2, 3],
      };
      const entry = {
        data: testData,
        timestamp: Date.now(),
        ttl: 300000,
      };
      mockGet.mockResolvedValue(JSON.stringify(entry));

      const result = await getCache('complex-key');
      expect(result).toEqual(testData);
    });
  });

  describe('setCache', () => {
    it('should set cache data with default TTL', async () => {
      const testData = { id: 1, name: 'Test' };
      mockSet.mockResolvedValue('OK');

      await setCache('test-key', testData);

      expect(mockSet).toHaveBeenCalledWith(
        'test-key',
        JSON.stringify({
          data: testData,
          timestamp: expect.any(Number),
          ttl: 300000,
        }),
        { PX: 300000 }
      );
    });

    it('should set cache data with custom TTL', async () => {
      const testData = { id: 2 };
      mockSet.mockResolvedValue('OK');

      await setCache('test-key', testData, 60000);

      expect(mockSet).toHaveBeenCalledWith(
        'test-key',
        JSON.stringify({
          data: testData,
          timestamp: expect.any(Number),
          ttl: 60000,
        }),
        { PX: 60000 }
      );
    });

    it('should handle set errors gracefully', async () => {
      const testData = { id: 1 };
      mockSet.mockRejectedValue(new Error('Redis set failed'));

      await expect(setCache('test-key', testData)).resolves.not.toThrow();
    });

    it('should handle zero as TTL', async () => {
      const testData = { id: 1 };
      mockSet.mockResolvedValue('OK');

      await setCache('test-key', testData, 0);

      expect(mockSet).toHaveBeenCalledWith(
        'test-key',
        expect.any(String),
        { PX: 0 }
      );
    });
  });

  describe('deleteCache', () => {
    it('should delete cached data', async () => {
      mockDel.mockResolvedValue(1);

      await deleteCache('test-key');

      expect(mockDel).toHaveBeenCalledWith('test-key');
    });

    it('should handle delete errors gracefully', async () => {
      mockDel.mockRejectedValue(new Error('Redis delete failed'));

      await expect(deleteCache('test-key')).resolves.not.toThrow();
    });
  });

  describe('clearAllCache', () => {
    it('should clear all cache entries', async () => {
      mockKeys.mockResolvedValue(['cache:1', 'cache:2', 'cache:3']);
      mockDel.mockResolvedValue(3);

      await clearAllCache();

      expect(mockKeys).toHaveBeenCalledWith('cache:*');
      expect(mockDel).toHaveBeenCalledWith(['cache:1', 'cache:2', 'cache:3']);
    });

    it('should handle empty cache', async () => {
      mockKeys.mockResolvedValue([]);

      await clearAllCache();

      expect(mockKeys).toHaveBeenCalledWith('cache:*');
      expect(mockDel).not.toHaveBeenCalled();
    });

    it('should handle clear errors gracefully', async () => {
      mockKeys.mockRejectedValue(new Error('Redis keys failed'));

      await expect(clearAllCache()).resolves.not.toThrow();
    });
  });

  describe('Standings Cache Functions', () => {
    describe('getStandingsCache', () => {
      it('should get standings cache', async () => {
        const testData = [{ rank: 1, name: 'Player 1' }];
        const entry = {
          data: testData,
          timestamp: Date.now(),
          ttl: 300000,
        };
        mockGet.mockResolvedValue(JSON.stringify(entry));

        const result = await getStandingsCache('tournament-1', 'finals');

        expect(result).toEqual(testData);
        expect(mockGet).toHaveBeenCalledWith('cache:standings:tournament-1:finals');
      });

      it('should return null when standings not cached', async () => {
        mockGet.mockResolvedValue(null);

        const result = await getStandingsCache('tournament-1', 'finals');

        expect(result).toBeNull();
      });
    });

    describe('setStandingsCache', () => {
      it('should set standings cache with etag', async () => {
        const testData = [{ rank: 1, name: 'Player 1' }];
        const etag = 'abc123';
        mockSet.mockResolvedValue('OK');

        await setStandingsCache('tournament-1', 'finals', testData, etag);

        expect(mockSet).toHaveBeenCalledWith(
          'cache:standings:tournament-1:finals',
          expect.stringContaining('"data":'),
          expect.any(Object)
        );
      });
    });

    describe('invalidateStandingsCache', () => {
      it('should invalidate standings cache for specific stage', async () => {
        mockKeys.mockResolvedValue(['cache:standings:tournament-1:finals']);
        mockDel.mockResolvedValue(1);

        await invalidateStandingsCache('tournament-1', 'finals');

        expect(mockDel).toHaveBeenCalledWith('cache:standings:tournament-1:finals');
      });

      it('should invalidate all standings cache for tournament', async () => {
        mockKeys.mockResolvedValue([
          'cache:standings:tournament-1:finals',
          'cache:standings:tournament-1:semifinals',
          'cache:standings:tournament-1:prelims',
        ]);
        mockDel.mockResolvedValue(3);

        await invalidateStandingsCache('tournament-1');

        expect(mockKeys).toHaveBeenCalledWith('cache:standings:tournament-1:*');
        expect(mockDel).toHaveBeenCalledWith([
          'cache:standings:tournament-1:finals',
          'cache:standings:tournament-1:semifinals',
          'cache:standings:tournament-1:prelims',
        ]);
      });

      it('should handle invalidation errors gracefully', async () => {
        mockDel.mockRejectedValue(new Error('Invalidation failed'));

        await expect(invalidateStandingsCache('tournament-1', 'finals')).resolves.not.toThrow();
      });
    });
  });

  describe('Tournament Cache Functions', () => {
    describe('getTournamentCache', () => {
      it('should get tournament cache', async () => {
        const testData = { id: 'tournament-1', name: 'Tournament 1' };
        const entry = {
          data: testData,
          timestamp: Date.now(),
          ttl: 300000,
        };
        mockGet.mockResolvedValue(JSON.stringify(entry));

        const result = await getTournamentCache('tournament-1');

        expect(result).toEqual(testData);
        expect(mockGet).toHaveBeenCalledWith('cache:tournament:tournament-1');
      });

      it('should return null when tournament not cached', async () => {
        mockGet.mockResolvedValue(null);

        const result = await getTournamentCache('tournament-1');

        expect(result).toBeNull();
      });
    });

    describe('setTournamentCache', () => {
      it('should set tournament cache', async () => {
        const testData = { id: 'tournament-1', name: 'Tournament 1' };
        mockSet.mockResolvedValue('OK');

        await setTournamentCache('tournament-1', testData);

        expect(mockSet).toHaveBeenCalledWith(
          'cache:tournament:tournament-1',
          expect.any(String),
          { PX: 300000 }
        );
      });
    });

    describe('invalidateTournamentCache', () => {
      it('should invalidate tournament cache', async () => {
        mockDel.mockResolvedValue(1);

        await invalidateTournamentCache('tournament-1');

        expect(mockDel).toHaveBeenCalledWith('cache:tournament:tournament-1');
      });
    });
  });
});

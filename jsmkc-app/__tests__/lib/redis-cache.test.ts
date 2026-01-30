/**
 * @module __tests__/lib/redis-cache.test.ts
 *
 * Test suite for the Redis-backed cache layer (redis-cache.ts).
 *
 * Covers the following functionality:
 * - createCacheKey(): Builds namespaced cache keys from variable-length parts.
 *   Keys follow the pattern namespace:part1:part2 (no "cache:" prefix).
 * - getCache() / setCache() / deleteCache() / clearAllCache(): General-purpose
 *   cache CRUD operations with TTL support, JSON serialization, and graceful
 *   error handling when Redis is unavailable.
 * - Standings-specific cache helpers (getStandingsCache, setStandingsCache,
 *   invalidateStandingsCache): Cache tournament standings by tournament ID
 *   and mode, with per-mode invalidation.
 * - Tournament-specific cache helpers (getTournamentCache, setTournamentCache,
 *   invalidateTournamentCache): Cache tournament data by ID.
 *
 * All Redis operations are mocked using jest.fn() stubs to test the caching
 * logic without requiring a running Redis instance.
 *
 * Important implementation details reflected in these tests:
 * - The source uses a singleton Redis client via getRedisClient().
 *   We use jest.resetModules() + dynamic imports to reset the singleton per test group.
 * - Cache keys have NO "cache:" prefix. createCacheKey('standings', 'id', 'bm') => 'standings:id:bm'
 * - setCache uses Redis EX option (seconds), NOT PX (milliseconds).
 * - DEFAULT_CACHE_TTL = 300 (seconds, i.e. 5 minutes).
 * - getCache does NOT perform application-side TTL checks. Redis handles expiration.
 * - clearAllCache uses client.flushDb(), not keys() + del().
 * - invalidateStandingsCache without stage iterates over ['ta','bm','mr','gp'] modes
 *   and deletes each key individually via deleteCache().
 */
// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly

// Mock the Redis module at the top level so it's in place before any imports
// We create mock functions here and assign them to the mock client in beforeEach
let mockGet: jest.Mock;
let mockSet: jest.Mock;
let mockDel: jest.Mock;
let mockFlushDb: jest.Mock;
let mockOn: jest.Mock;
let mockConnect: jest.Mock;
let mockRedisClient: Record<string, jest.Mock>;

/**
 * Top-level jest.mock for 'redis' module.
 * Returns a createClient function that produces our mock Redis client.
 * The mock client is re-created in beforeEach to ensure test isolation.
 */
jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

/**
 * Top-level jest.mock for the logger module.
 * Provides all log-level methods used by redis-cache.ts:
 * error, warn, info, debug.
 */
jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })),
}));

describe('Redis Cache', () => {
  /**
   * Dynamic import references. We re-import the module in beforeEach
   * after jest.resetModules() to reset the singleton Redis client.
   */
  let getCache: typeof import('@/lib/redis-cache').getCache;
  let setCache: typeof import('@/lib/redis-cache').setCache;
  let deleteCache: typeof import('@/lib/redis-cache').deleteCache;
  let clearAllCache: typeof import('@/lib/redis-cache').clearAllCache;
  let createCacheKey: typeof import('@/lib/redis-cache').createCacheKey;
  let getStandingsCache: typeof import('@/lib/redis-cache').getStandingsCache;
  let setStandingsCache: typeof import('@/lib/redis-cache').setStandingsCache;
  let invalidateStandingsCache: typeof import('@/lib/redis-cache').invalidateStandingsCache;
  let getTournamentCache: typeof import('@/lib/redis-cache').getTournamentCache;
  let setTournamentCache: typeof import('@/lib/redis-cache').setTournamentCache;
  let invalidateTournamentCache: typeof import('@/lib/redis-cache').invalidateTournamentCache;

  beforeEach(async () => {
    // Reset all mocks and modules before each test.
    // This is critical because redis-cache.ts uses a singleton pattern
    // (redisClient variable). Resetting modules clears the singleton.
    jest.clearAllMocks();
    jest.resetModules();

    // Create fresh mock functions for each test
    mockGet = jest.fn();
    mockSet = jest.fn();
    mockDel = jest.fn();
    mockFlushDb = jest.fn();
    mockOn = jest.fn();
    mockConnect = jest.fn().mockResolvedValue(undefined);

    // Build the mock Redis client object that createClient returns.
    // This matches the RedisClientType interface methods used in the source.
    mockRedisClient = {
      get: mockGet,
      set: mockSet,
      del: mockDel,
      flushDb: mockFlushDb,
      on: mockOn,
      connect: mockConnect,
    };

    // Dynamically import the module after resetting, so each test
    // gets a fresh singleton state (redisClient = null).
    const mod = await import('@/lib/redis-cache');
    getCache = mod.getCache;
    setCache = mod.setCache;
    deleteCache = mod.deleteCache;
    clearAllCache = mod.clearAllCache;
    createCacheKey = mod.createCacheKey;
    getStandingsCache = mod.getStandingsCache;
    setStandingsCache = mod.setStandingsCache;
    invalidateStandingsCache = mod.invalidateStandingsCache;
    getTournamentCache = mod.getTournamentCache;
    setTournamentCache = mod.setTournamentCache;
    invalidateTournamentCache = mod.invalidateTournamentCache;
  });

  // ============================================================
  // createCacheKey tests
  // ============================================================

  describe('createCacheKey', () => {
    /**
     * createCacheKey joins namespace and parts with ':' separator.
     * No 'cache:' prefix is added.
     */
    it('should create a cache key with namespace and parts', () => {
      const key = createCacheKey('standings', '123', 'finals');
      // Source: [namespace, ...parts].join(':') => 'standings:123:finals'
      expect(key).toBe('standings:123:finals');
    });

    it('should handle single part', () => {
      const key = createCacheKey('tournament', '456');
      expect(key).toBe('tournament:456');
    });

    it('should handle multiple parts', () => {
      const key = createCacheKey('data', 'a', 'b', 'c', 'd');
      expect(key).toBe('data:a:b:c:d');
    });
  });

  // ============================================================
  // getCache tests
  // ============================================================

  describe('getCache', () => {
    it('should return null for non-existent key', async () => {
      // When Redis returns null, getCache should return null
      mockGet.mockResolvedValue(null);

      const result = await getCache('non-existent-key');
      expect(result).toBeNull();
      expect(mockGet).toHaveBeenCalledWith('non-existent-key');
    });

    it('should return cached data for existing key', async () => {
      // Source parses the JSON and returns entry.data
      const testData = { id: 1, name: 'Test' };
      const entry = {
        data: testData,
        timestamp: Date.now(),
        ttl: 300,
      };
      mockGet.mockResolvedValue(JSON.stringify(entry));

      const result = await getCache('existing-key');
      expect(result).toEqual(testData);
      expect(mockGet).toHaveBeenCalledWith('existing-key');
    });

    it('should return data even for old timestamp entries since Redis handles TTL', async () => {
      // The source does NOT check timestamps/TTL application-side.
      // Redis handles expiration via the EX option set in setCache.
      // If client.get() returns a value, it's still valid.
      const testData = { id: 1 };
      const entry = {
        data: testData,
        timestamp: Date.now() - 400000, // Old timestamp, but Redis still returns it
        ttl: 300,
      };
      mockGet.mockResolvedValue(JSON.stringify(entry));

      // Source returns entry.data regardless of timestamp
      const result = await getCache('old-entry-key');
      expect(result).toEqual(testData);
    });

    it('should return null when cache get throws error', async () => {
      // Source catches errors and returns null for graceful fallback
      mockGet.mockRejectedValue(new Error('Redis connection failed'));

      const result = await getCache('error-key');
      expect(result).toBeNull();
    });

    it('should handle null data value in cache entry', async () => {
      // When the cached data itself is null, getCache returns null
      mockGet.mockResolvedValue(JSON.stringify({ data: null, timestamp: Date.now(), ttl: 300 }));

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
        ttl: 300,
      };
      mockGet.mockResolvedValue(JSON.stringify(entry));

      const result = await getCache('complex-key');
      expect(result).toEqual(testData);
    });
  });

  // ============================================================
  // setCache tests
  // ============================================================

  describe('setCache', () => {
    it('should set cache data with default TTL (300 seconds)', async () => {
      // Source default: DEFAULT_CACHE_TTL = 300 (seconds)
      // Stored via client.set(key, JSON.stringify(entry), { EX: ttl })
      const testData = { id: 1, name: 'Test' };
      mockSet.mockResolvedValue('OK');

      await setCache('test-key', testData);

      // Verify the key and options
      expect(mockSet).toHaveBeenCalledWith(
        'test-key',
        expect.any(String),
        { EX: 300 } // Redis EX option = seconds
      );
      // Verify the serialized CacheEntry structure
      const storedValue = JSON.parse(mockSet.mock.calls[0][1]);
      expect(storedValue.data).toEqual(testData);
      expect(typeof storedValue.timestamp).toBe('number');
      expect(storedValue.ttl).toBe(300); // DEFAULT_CACHE_TTL = 300 seconds
    });

    it('should set cache data with custom TTL in seconds', async () => {
      // TTL parameter is passed through as seconds to both entry.ttl and { EX: ttl }
      const testData = { id: 2 };
      mockSet.mockResolvedValue('OK');

      await setCache('test-key', testData, 60);

      // Verify the key and options
      expect(mockSet).toHaveBeenCalledWith(
        'test-key',
        expect.any(String),
        { EX: 60 }
      );
      // Verify the serialized CacheEntry structure
      const storedValue = JSON.parse(mockSet.mock.calls[0][1]);
      expect(storedValue.data).toEqual(testData);
      expect(typeof storedValue.timestamp).toBe('number');
      expect(storedValue.ttl).toBe(60);
    });

    it('should handle set errors gracefully', async () => {
      // Source catches errors and does not re-throw
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
        { EX: 0 }
      );
    });
  });

  // ============================================================
  // deleteCache tests
  // ============================================================

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

  // ============================================================
  // clearAllCache tests
  // ============================================================

  describe('clearAllCache', () => {
    it('should clear all cache entries using flushDb', async () => {
      // Source uses client.flushDb() to clear all Redis data
      mockFlushDb.mockResolvedValue('OK');

      await clearAllCache();

      expect(mockFlushDb).toHaveBeenCalled();
    });

    it('should handle clear errors gracefully', async () => {
      // Source catches errors from flushDb and does not re-throw
      mockFlushDb.mockRejectedValue(new Error('Redis flush failed'));

      await expect(clearAllCache()).resolves.not.toThrow();
    });
  });

  // ============================================================
  // Standings Cache Functions tests
  // ============================================================

  describe('Standings Cache Functions', () => {
    describe('getStandingsCache', () => {
      it('should get standings cache using correct key format', async () => {
        // Key: createCacheKey('standings', tournamentId, mode) => 'standings:tournament-1:finals'
        const testData = [{ rank: 1, name: 'Player 1' }];
        const entry = {
          data: testData,
          timestamp: Date.now(),
          ttl: 300,
        };
        mockGet.mockResolvedValue(JSON.stringify(entry));

        const result = await getStandingsCache('tournament-1', 'finals');

        expect(result).toEqual(testData);
        expect(mockGet).toHaveBeenCalledWith('standings:tournament-1:finals');
      });

      it('should return null when standings not cached', async () => {
        mockGet.mockResolvedValue(null);

        const result = await getStandingsCache('tournament-1', 'finals');

        expect(result).toBeNull();
      });
    });

    describe('setStandingsCache', () => {
      it('should set standings cache with etag', async () => {
        // setStandingsCache wraps data with { data, etag, lastUpdated }
        // then calls setCache which wraps again in CacheEntry
        const testData = [{ rank: 1, name: 'Player 1' }];
        const etag = 'abc123';
        mockSet.mockResolvedValue('OK');

        await setStandingsCache('tournament-1', 'finals', testData, etag);

        // Key should be 'standings:tournament-1:finals' (no cache: prefix)
        expect(mockSet).toHaveBeenCalledWith(
          'standings:tournament-1:finals',
          expect.stringContaining('"data":'),
          expect.any(Object)
        );
      });
    });

    describe('invalidateStandingsCache', () => {
      it('should invalidate standings cache for specific stage', async () => {
        // With stage parameter: deletes a single key via deleteCache()
        // Key: createCacheKey('standings', 'tournament-1', 'finals') => 'standings:tournament-1:finals'
        mockDel.mockResolvedValue(1);

        await invalidateStandingsCache('tournament-1', 'finals');

        expect(mockDel).toHaveBeenCalledWith('standings:tournament-1:finals');
      });

      it('should invalidate all four mode caches for tournament when no stage given', async () => {
        // Without stage parameter: iterates over ['ta', 'bm', 'mr', 'gp']
        // and calls deleteCache for each mode individually.
        // Does NOT use pattern matching with keys().
        mockDel.mockResolvedValue(1);

        await invalidateStandingsCache('tournament-1');

        // Should call del for each of the 4 modes
        expect(mockDel).toHaveBeenCalledTimes(4);
        expect(mockDel).toHaveBeenCalledWith('standings:tournament-1:ta');
        expect(mockDel).toHaveBeenCalledWith('standings:tournament-1:bm');
        expect(mockDel).toHaveBeenCalledWith('standings:tournament-1:mr');
        expect(mockDel).toHaveBeenCalledWith('standings:tournament-1:gp');
      });

      it('should handle invalidation errors gracefully', async () => {
        // deleteCache catches errors internally, so invalidateStandingsCache
        // should not throw even if Redis operations fail
        mockDel.mockRejectedValue(new Error('Invalidation failed'));

        await expect(invalidateStandingsCache('tournament-1', 'finals')).resolves.not.toThrow();
      });
    });
  });

  // ============================================================
  // Tournament Cache Functions tests
  // ============================================================

  describe('Tournament Cache Functions', () => {
    describe('getTournamentCache', () => {
      it('should get tournament cache using correct key format', async () => {
        // Key: createCacheKey('tournament', tournamentId) => 'tournament:tournament-1'
        const testData = { id: 'tournament-1', name: 'Tournament 1' };
        const entry = {
          data: testData,
          timestamp: Date.now(),
          ttl: 300,
        };
        mockGet.mockResolvedValue(JSON.stringify(entry));

        const result = await getTournamentCache('tournament-1');

        expect(result).toEqual(testData);
        expect(mockGet).toHaveBeenCalledWith('tournament:tournament-1');
      });

      it('should return null when tournament not cached', async () => {
        mockGet.mockResolvedValue(null);

        const result = await getTournamentCache('tournament-1');

        expect(result).toBeNull();
      });
    });

    describe('setTournamentCache', () => {
      it('should set tournament cache with default TTL', async () => {
        const testData = { id: 'tournament-1', name: 'Tournament 1' };
        mockSet.mockResolvedValue('OK');

        await setTournamentCache('tournament-1', testData);

        // Key: 'tournament:tournament-1', TTL uses EX (seconds)
        expect(mockSet).toHaveBeenCalledWith(
          'tournament:tournament-1',
          expect.any(String),
          { EX: 300 }
        );
      });
    });

    describe('invalidateTournamentCache', () => {
      it('should invalidate tournament cache', async () => {
        // Calls deleteCache with key 'tournament:tournament-1'
        mockDel.mockResolvedValue(1);

        await invalidateTournamentCache('tournament-1');

        expect(mockDel).toHaveBeenCalledWith('tournament:tournament-1');
      });
    });
  });
});

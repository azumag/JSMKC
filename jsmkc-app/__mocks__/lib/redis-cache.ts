import { createLogger } from '@/lib/logger';

const log = createLogger('redis-cache');

// Mock Redis client for testing
let mockCache = new Map<string, { data: unknown; timestamp: number; ttl: number }>();

export async function getRedisClient() {
  return {
    get: jest.fn().mockImplementation(async (key: string) => {
      const cached = mockCache.get(key);
      if (!cached) return null;
      if (Date.now() - cached.timestamp > cached.ttl) {
        mockCache.delete(key);
        return null;
      }
      return JSON.stringify(cached.data);
    }),
    set: jest.fn().mockImplementation(async (key: string, value: string, options?: { PX?: number }) => {
      mockCache.set(key, {
        data: JSON.parse(value),
        timestamp: Date.now(),
        ttl: options?.PX || 300000, // Default 5 minutes
      });
    }),
    del: jest.fn().mockImplementation(async (key: string) => {
      mockCache.delete(key);
    }),
    keys: jest.fn().mockImplementation(async (pattern: string) => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return Array.from(mockCache.keys()).filter(k => regex.test(k));
    }),
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    zAdd: jest.fn(),
    zCard: jest.fn(),
    zRemRangeByScore: jest.fn(),
    expire: jest.fn(),
    zRange: jest.fn(),
  } as unknown;
}

// Cache entry interface
export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number;
}

// Default cache TTL (5 minutes)
const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

// Get cached data
export async function getCache<T = unknown>(key: string): Promise<T | null> {
  try {
    const cached = mockCache.get(key);
    if (!cached) return null;
    
    // Check if cache entry is expired
    if (Date.now() - cached.timestamp > cached.ttl) {
      mockCache.delete(key);
      return null;
    }

    log.debug(`Cache hit for key: ${key}`);
    return cached.data as T;
  } catch (error) {
    log.error(`Cache get failed for key ${key}:`, error);
    return null;
  }
}

// Set cached data
export async function setCache<T = unknown>(
  key: string,
  data: T,
  ttl: number = DEFAULT_CACHE_TTL
): Promise<void> {
  try {
    mockCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });

    log.debug(`Cache set for key: ${key} with TTL: ${ttl}ms`);
  } catch (error) {
    log.error(`Cache set failed for key ${key}:`, error);
  }
}

// Delete cached data
export async function deleteCache(key: string): Promise<void> {
  try {
    mockCache.delete(key);
    log.debug(`Cache deleted for key: ${key}`);
  } catch (error) {
    log.error(`Cache delete failed for key ${key}:`, error);
  }
}

// Clear all cache (use with caution)
export async function clearAllCache(): Promise<void> {
  try {
    mockCache.clear();
    log.debug('All cache cleared');
  } catch (error) {
    log.error('Clear all cache failed:', error);
  }
}

// Generate cache key with namespace
export function createCacheKey(namespace: string, ...parts: string[]): string {
  return `cache:${namespace}:${parts.join(':')}`;
}

// Standings cache specific functions
export async function getStandingsCache(
  tournamentId: string,
  stage: string
): Promise<unknown[] | null> {
  const key = createCacheKey('standings', tournamentId, stage);
  return await getCache(key);
}

export async function setStandingsCache(
  tournamentId: string,
  stage: string,
  data: unknown[],
  etag: string
): Promise<void> {
  const key = createCacheKey('standings', tournamentId, stage);
  const cacheData = {
    data,
    etag,
    lastUpdated: new Date().toISOString(),
  };
  await setCache(key, cacheData, DEFAULT_CACHE_TTL);
}

export async function invalidateStandingsCache(
  tournamentId: string,
  stage?: string
): Promise<void> {
  try {
    if (stage) {
      const key = createCacheKey('standings', tournamentId, stage);
      mockCache.delete(key);
      log.debug(`Invalidated standings cache for tournament ${tournamentId}, stage ${stage}`);
    } else {
      const pattern = createCacheKey('standings', tournamentId, '*');
      const keys = Array.from(mockCache.keys()).filter(k => k.match(new RegExp(pattern.replace('*', '.*'))));
      keys.forEach(k => mockCache.delete(k));
      log.debug(`Invalidated all standings cache for tournament ${tournamentId}`);
    }
  } catch (error) {
    log.error('Failed to invalidate standings cache:', error);
  }
}

// Tournament data cache functions
export async function getTournamentCache(tournamentId: string): Promise<unknown | null> {
  const key = createCacheKey('tournament', tournamentId);
  return await getCache(key);
}

export async function setTournamentCache(
  tournamentId: string,
  data: unknown
): Promise<void> {
  const key = createCacheKey('tournament', tournamentId);
  await setCache(key, data, DEFAULT_CACHE_TTL);
}

export async function invalidateTournamentCache(tournamentId: string): Promise<void> {
  const key = createCacheKey('tournament', tournamentId);
  await deleteCache(key);
  log.debug(`Invalidated tournament cache for tournament ${tournamentId}`);
}

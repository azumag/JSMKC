import { createClient } from 'redis';
import { createLogger } from './logger';

const log = createLogger('redis-cache');

// Redis client instance (shared with rate limiting)
let redisClient: ReturnType<typeof createClient> | null = null;

export async function getRedisClient() {
  if (!redisClient) {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    redisClient.on('error', (err) => {
      log.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      log.info('Redis cache connected successfully');
    });

    await redisClient.connect();
  }
  return redisClient;
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
    const client = await getRedisClient();
    const cachedData = await client.get(key);

    if (!cachedData) {
      return null;
    }

    const entry: CacheEntry<T> = JSON.parse(cachedData);
    
    // Check if cache entry is expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      await client.del(key);
      return null;
    }

    log.debug(`Cache hit for key: ${key}`);
    return entry.data;
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
    const client = await getRedisClient();
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
    };

    await client.set(key, JSON.stringify(entry), {
      PX: ttl,
    });

    log.debug(`Cache set for key: ${key} with TTL: ${ttl}ms`);
  } catch (error) {
    log.error(`Cache set failed for key ${key}:`, error);
  }
}

// Delete cached data
export async function deleteCache(key: string): Promise<void> {
  try {
    const client = await getRedisClient();
    await client.del(key);
    log.debug(`Cache deleted for key: ${key}`);
  } catch (error) {
    log.error(`Cache delete failed for key ${key}:`, error);
  }
}

// Clear all cache (use with caution)
export async function clearAllCache(): Promise<void> {
  try {
    const client = await getRedisClient();
    const keys = await client.keys('cache:*');
    if (keys.length > 0) {
      await client.del(keys);
    }
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
    const client = await getRedisClient();
    
    if (stage) {
      const key = createCacheKey('standings', tournamentId, stage);
      await client.del(key);
      log.debug(`Invalidated standings cache for tournament ${tournamentId}, stage ${stage}`);
    } else {
      const pattern = createCacheKey('standings', tournamentId, '*');
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(keys);
      }
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
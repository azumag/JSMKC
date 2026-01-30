/**
 * Redis Cache Utilities
 *
 * Provides a typed caching layer backed by Redis for frequently accessed
 * data that is expensive to compute or query from the database.
 *
 * Key use cases in JSMKC:
 * - Tournament standings: Computed from multiple match results, cached
 *   to avoid recalculating on every poll request (5-second intervals)
 * - Tournament metadata: Name, status, date cached to reduce DB reads
 *   during high-traffic tournament events
 *
 * Cache invalidation strategy:
 * - TTL-based expiration (default 5 minutes)
 * - Explicit invalidation when data changes (score updates, match completions)
 * - Namespace-based key structure for targeted invalidation
 *
 * The cache is optional - if Redis is unavailable, the application
 * falls back to direct database queries (slower but functional).
 *
 * Usage:
 *   import { getStandingsCache, setStandingsCache } from '@/lib/redis-cache';
 *   const cached = await getStandingsCache(tournamentId, 'bm');
 *   if (!cached) {
 *     const standings = await computeStandings();
 *     await setStandingsCache(tournamentId, 'bm', standings);
 *   }
 */

import { createClient, RedisClientType } from 'redis';
import { createLogger } from '@/lib/logger';

/** Logger scoped to Redis cache operations */
const logger = createLogger('redis-cache');

// ============================================================
// Redis Client Singleton
// ============================================================

/**
 * Singleton Redis client instance.
 * Null until first access via getRedisClient().
 */
let redisClient: RedisClientType | null = null;

/**
 * Returns the singleton Redis client, creating and connecting it on first call.
 *
 * Uses the REDIS_URL environment variable for connection configuration.
 * If REDIS_URL is not set, defaults to localhost:6379.
 *
 * The singleton pattern ensures we reuse a single connection pool across
 * all cache operations, avoiding connection exhaustion under high load.
 *
 * @returns The connected Redis client instance
 * @throws If Redis connection fails (caller should handle gracefully)
 */
export async function getRedisClient(): Promise<RedisClientType> {
  // Return existing connected client if available (singleton pattern)
  if (redisClient) {
    return redisClient;
  }

  // Create a new Redis client using the REDIS_URL environment variable.
  // Falls back to default localhost:6379 if not configured.
  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  }) as RedisClientType;

  // Register error handler to log Redis connection issues
  // without crashing the application. Cache failures should
  // degrade gracefully, not bring down the API.
  redisClient.on('error', (err: Error) => {
    logger.error('Redis client error', { error: err.message });
  });

  // Establish the connection
  await redisClient.connect();
  logger.info('Redis client connected');

  return redisClient;
}

// ============================================================
// Cache Types and Constants
// ============================================================

/**
 * Wrapper type for cached data that includes metadata about when
 * the cache entry was created and when it should expire.
 *
 * @template T - The type of the cached data payload
 */
export interface CacheEntry<T> {
  /** The cached data payload */
  data: T;
  /** Unix timestamp (ms) when this entry was created */
  timestamp: number;
  /** Time-to-live in seconds for this entry */
  ttl: number;
}

/**
 * Default cache TTL of 5 minutes (300 seconds).
 *
 * This balances freshness with performance:
 * - Short enough that standings updates appear within minutes
 * - Long enough to absorb repeated polling from multiple clients
 *   during a tournament (many spectators polling every 5 seconds)
 */
export const DEFAULT_CACHE_TTL = 300; // 5 minutes in seconds

// ============================================================
// Generic Cache Operations
// ============================================================

/**
 * Retrieves a cached value by key.
 *
 * Returns null if the key does not exist, has expired, or if
 * Redis is unavailable. Callers should always handle the null
 * case by falling back to the original data source.
 *
 * @template T - The expected type of the cached data
 * @param key - The cache key to look up
 * @returns The cached data or null if not found/expired/error
 *
 * @example
 *   const players = await getCache<Player[]>('standings:tournament-123:bm');
 */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const client = await getRedisClient();
    const raw = await client.get(key);

    // Key does not exist in Redis
    if (!raw) {
      return null;
    }

    // Parse the stored JSON back into a CacheEntry object.
    // The TTL is managed by Redis itself (via EX option in setCache),
    // so if we get a value back, it's still within its TTL.
    const entry: CacheEntry<T> = JSON.parse(raw);
    return entry.data;
  } catch (error) {
    // Log the error but return null to allow graceful fallback.
    // Cache misses should never block the request pipeline.
    logger.warn('Cache get failed', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Stores a value in the cache with the specified TTL.
 *
 * The value is wrapped in a CacheEntry with metadata and serialized
 * to JSON for storage. Redis handles expiration via the EX option,
 * which is more reliable than application-level TTL checking.
 *
 * @template T - The type of the data to cache
 * @param key - The cache key
 * @param data - The data to cache
 * @param ttl - Time-to-live in seconds (default: DEFAULT_CACHE_TTL)
 *
 * @example
 *   await setCache('standings:tournament-123:bm', standingsData, 300);
 */
export async function setCache<T>(
  key: string,
  data: T,
  ttl: number = DEFAULT_CACHE_TTL
): Promise<void> {
  try {
    const client = await getRedisClient();

    // Wrap data in CacheEntry with timestamp metadata.
    // This allows cache consumers to know when data was cached
    // even though Redis manages the actual expiration.
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
    };

    // Store with Redis EX (expire) option for automatic cleanup.
    // Redis handles TTL expiration at the server level, which is
    // more reliable than checking timestamps on read.
    await client.set(key, JSON.stringify(entry), { EX: ttl });
  } catch (error) {
    // Cache write failures are non-critical - the application
    // continues to function, just without caching benefit.
    logger.warn('Cache set failed', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Deletes a specific cache entry by key.
 *
 * Used for explicit cache invalidation when data changes
 * (e.g., after a score update that affects standings).
 *
 * @param key - The cache key to delete
 *
 * @example
 *   await deleteCache('standings:tournament-123:bm');
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    const client = await getRedisClient();
    await client.del(key);
    logger.debug('Cache entry deleted', { key });
  } catch (error) {
    logger.warn('Cache delete failed', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Clears all cache entries from Redis.
 *
 * WARNING: This removes ALL keys from the Redis database, not just
 * JSMKC cache keys. Should only be used in development/testing or
 * during deployment cache reset procedures.
 *
 * In production, prefer targeted invalidation via deleteCache() or
 * the namespace-specific invalidation functions.
 */
export async function clearAllCache(): Promise<void> {
  try {
    const client = await getRedisClient();
    await client.flushDb();
    logger.info('All cache entries cleared');
  } catch (error) {
    logger.warn('Cache clear failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================
// Cache Key Generation
// ============================================================

/**
 * Generates a namespaced cache key from component parts.
 *
 * Keys follow the pattern: namespace:part1:part2:...
 * This naming convention enables:
 * - Pattern-based invalidation (e.g., all keys for a tournament)
 * - Easy debugging by inspecting key names in Redis
 * - Avoiding key collisions between different data types
 *
 * @param namespace - The top-level namespace (e.g., 'standings', 'tournament')
 * @param parts - Additional key components joined with ':'
 * @returns The formatted cache key string
 *
 * @example
 *   createCacheKey('standings', 'tournament-123', 'bm')
 *   // Returns: 'standings:tournament-123:bm'
 */
export function createCacheKey(namespace: string, ...parts: string[]): string {
  // Join all parts with colon separator, which is the Redis convention
  // for hierarchical key naming
  return [namespace, ...parts].join(':');
}

// ============================================================
// Standings-Specific Cache Functions
// ============================================================

/**
 * Retrieves cached standings data for a specific tournament and mode.
 *
 * Standings are the most frequently cached data type because they
 * require aggregating match results across many records and are
 * polled by multiple clients every 5 seconds during live events.
 *
 * @template T - The standings data type
 * @param tournamentId - The tournament ID
 * @param mode - The competition mode ('ta', 'bm', 'mr', 'gp')
 * @returns Cached standings data or null if not cached
 */
export async function getStandingsCache(
  tournamentId: string,
  mode: string
): Promise<unknown[] | null> {
  const key = createCacheKey('standings', tournamentId, mode);
  return await getCache<unknown[]>(key);
}

/**
 * Caches standings data for a specific tournament and mode.
 * Stores the data along with an ETag for HTTP conditional response support.
 *
 * @param tournamentId - The tournament ID
 * @param mode - The competition stage/mode (e.g., 'qualification', 'finals')
 * @param data - The standings data array to cache
 * @param etag - Hash-based ETag for If-None-Match support
 */
export async function setStandingsCache(
  tournamentId: string,
  mode: string,
  data: unknown[],
  etag: string
): Promise<void> {
  const key = createCacheKey('standings', tournamentId, mode);
  // Wrap data with etag and timestamp metadata for cache validation
  const cacheData = {
    data,
    etag,
    lastUpdated: new Date().toISOString(),
  };
  await setCache(key, cacheData, DEFAULT_CACHE_TTL);
}

/**
 * Invalidates all standings cache entries for a specific tournament.
 *
 * Called when any score or match result changes in the tournament,
 * ensuring that subsequent polling requests get fresh data.
 *
 * Invalidates all four mode caches for the tournament since changes
 * in one mode can affect overall ranking calculations.
 *
 * @param tournamentId - The tournament ID whose standings to invalidate
 */
export async function invalidateStandingsCache(
  tournamentId: string,
  stage?: string
): Promise<void> {
  if (stage) {
    // Invalidate a specific stage/mode cache entry
    const key = createCacheKey('standings', tournamentId, stage);
    await deleteCache(key);
    logger.info('Standings cache invalidated for specific stage', { tournamentId, stage });
  } else {
    // Invalidate all four competition modes for this tournament.
    // Even though only one mode's data changed, overall rankings
    // depend on all modes, so we invalidate all to be safe.
    const modes = ['ta', 'bm', 'mr', 'gp'];
    const deletePromises = modes.map((mode) => {
      const key = createCacheKey('standings', tournamentId, mode);
      return deleteCache(key);
    });
    await Promise.all(deletePromises);
    logger.info('Standings cache invalidated for tournament', { tournamentId });
  }
}

// ============================================================
// Tournament-Specific Cache Functions
// ============================================================

/**
 * Retrieves cached tournament metadata (name, date, status, etc.).
 *
 * Tournament metadata changes infrequently but is read on every
 * page load and API call that requires tournament context.
 *
 * @template T - The tournament data type
 * @param tournamentId - The tournament ID
 * @returns Cached tournament data or null if not cached
 */
export async function getTournamentCache<T>(
  tournamentId: string
): Promise<T | null> {
  const key = createCacheKey('tournament', tournamentId);
  return getCache<T>(key);
}

/**
 * Caches tournament metadata.
 *
 * @template T - The tournament data type
 * @param tournamentId - The tournament ID
 * @param data - The tournament data to cache
 * @param ttl - Optional TTL override (default: DEFAULT_CACHE_TTL)
 */
export async function setTournamentCache<T>(
  tournamentId: string,
  data: T,
  ttl: number = DEFAULT_CACHE_TTL
): Promise<void> {
  const key = createCacheKey('tournament', tournamentId);
  await setCache<T>(key, data, ttl);
}

/**
 * Invalidates the tournament metadata cache for a specific tournament.
 *
 * Called when tournament details are updated (name change, status
 * transition, token regeneration, etc.).
 *
 * @param tournamentId - The tournament ID whose cache to invalidate
 */
export async function invalidateTournamentCache(
  tournamentId: string
): Promise<void> {
  const key = createCacheKey('tournament', tournamentId);
  await deleteCache(key);
  logger.info('Tournament cache invalidated', { tournamentId });
}

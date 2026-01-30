/**
 * Standings Cache Module
 *
 * Provides a two-tier caching strategy for tournament standings data:
 *
 * 1. Primary: Redis cache (via redis-cache module) for distributed,
 *    persistent caching across server instances.
 * 2. Fallback: In-memory Map for environments without Redis or
 *    when Redis is temporarily unavailable.
 *
 * Cache entries include:
 * - `data`: The standings array (generic unknown[] to support all modes)
 * - `lastUpdated`: ISO timestamp of when the entry was created
 * - `etag`: Hash-based ETag for HTTP conditional responses (If-None-Match)
 *
 * TTL: 5 minutes (CACHE_TTL_MS). After expiration, the cache entry is
 * considered stale and should be refreshed from the database.
 *
 * Cache keys are formatted as "tournamentId:stage" (e.g., "abc123:qualification").
 * Invalidation can target a specific stage or all stages for a tournament.
 *
 * The ETag is generated using a simple DJB2-like hash of the JSON-serialized
 * data. This is not cryptographically secure but is sufficient for detecting
 * data changes in HTTP caching scenarios.
 */

import { createLogger } from './logger';
import {
  getStandingsCache,
  setStandingsCache,
  invalidateStandingsCache
} from './redis-cache';

/**
 * Public interface for cached standings data.
 * Consumers use this to understand the shape of cached values.
 */
export interface CachedStandings {
  data: unknown[];
  lastUpdated: string;
  etag: string;
}

/** Logger scoped to the standings-cache module for structured debug output */
const log = createLogger('standings-cache');

/**
 * Cache time-to-live in milliseconds (5 minutes).
 * This duration balances freshness (standings update during active tournaments)
 * with database load reduction (avoiding per-request queries).
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Internal cache entry type, identical to CachedStandings but used
 * to distinguish internal implementation from the public API.
 */
type CacheEntry = {
  data: unknown[];
  lastUpdated: string;
  etag: string;
};

/**
 * In-memory cache fallback.
 * Used when Redis is unavailable or as a local hot cache.
 * Keys are formatted as "tournamentId:stage".
 */
const standingsCache = new Map<string, CacheEntry>();

/**
 * Retrieve a cached standings entry, checking Redis first then falling back
 * to the in-memory cache.
 *
 * When Redis returns data, a new CacheEntry is constructed with the current
 * timestamp and an empty ETag (the caller is expected to set the ETag from
 * the actual response context if needed).
 *
 * @param tournamentId - Tournament identifier
 * @param stage        - Competition stage (e.g., "qualification", "finals")
 * @returns Cached entry or null if not found in either tier
 */
async function get(tournamentId: string, stage: string): Promise<CacheEntry | null> {
  // Try Redis first -- this is the primary cache for distributed consistency
  const redisData = await getStandingsCache(tournamentId, stage);
  if (redisData) {
    // Redis returns raw data; wrap it in a CacheEntry structure.
    // The ETag is left empty because Redis stores it separately and
    // the caller typically generates a fresh ETag for HTTP responses.
    return {
      data: redisData,
      lastUpdated: new Date().toISOString(),
      etag: '',
    };
  }

  // Fallback to in-memory cache when Redis misses or is unavailable
  const key = `${tournamentId}:${stage}`;
  return standingsCache.get(key) || null;
}

/**
 * Store standings data in both Redis and in-memory caches.
 *
 * Writing to both caches ensures:
 * - Redis provides distributed cache for multi-instance deployments
 * - In-memory provides immediate availability even if Redis write is slow
 *
 * @param tournamentId - Tournament identifier
 * @param stage        - Competition stage
 * @param data         - Standings data array to cache
 * @param etag         - Pre-computed ETag for the data
 */
async function set(tournamentId: string, stage: string, data: unknown[], etag: string): Promise<void> {
  // Write to Redis first (primary store)
  await setStandingsCache(tournamentId, stage, data, etag);

  // Also populate the in-memory cache as a fast local fallback
  const key = `${tournamentId}:${stage}`;
  const cacheEntry: CacheEntry = {
    data,
    lastUpdated: new Date().toISOString(),
    etag,
  };
  standingsCache.set(key, cacheEntry);
}

/**
 * Generate an ETag string from standings data using a hash function.
 *
 * Uses a DJB2-variant hash algorithm (shift-and-subtract) on the JSON
 * serialization of the data. The result is a hex string. This provides
 * fast, deterministic change detection suitable for HTTP ETag headers.
 *
 * Note: This is NOT cryptographically secure. It is only used for
 * cache validation (detecting whether data has changed), not for
 * security purposes.
 *
 * @param data - Array of standings data to hash
 * @returns Hex string hash suitable for use as an ETag
 */
function generateETag(data: unknown[]): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    // DJB2 hash variant: hash * 31 + char (equivalent to (hash << 5) - hash + char)
    hash = ((hash << 5) - hash) + char;
    // Convert to 32-bit integer to prevent overflow
    hash = hash & hash;
  }
  // Use absolute value and convert to hex for a clean ETag string
  return Math.abs(hash).toString(16);
}

/**
 * Check whether a cache entry has exceeded the TTL and should be refreshed.
 *
 * @param cacheEntry - The cache entry to check
 * @returns True if the entry is older than CACHE_TTL_MS (5 minutes)
 */
function isExpired(cacheEntry: CacheEntry): boolean {
  const age = Date.now() - new Date(cacheEntry.lastUpdated).getTime();
  return age > CACHE_TTL_MS;
}

/**
 * Invalidate cached standings for a tournament.
 *
 * Clears entries in both Redis and in-memory caches. Can target a
 * specific stage or all stages for the given tournament.
 *
 * This should be called whenever standings data changes (e.g., after
 * a score update or match completion) to ensure subsequent reads
 * fetch fresh data from the database.
 *
 * @param tournamentId - Tournament identifier
 * @param stage        - Optional specific stage to invalidate; if omitted, all stages are cleared
 */
async function invalidate(tournamentId: string, stage?: string): Promise<void> {
  // Invalidate in Redis (primary cache)
  await invalidateStandingsCache(tournamentId, stage);

  // Also invalidate in-memory cache to maintain consistency
  if (stage) {
    // Targeted invalidation: remove only the specific tournament+stage entry
    standingsCache.delete(`${tournamentId}:${stage}`);
    log.debug(`Invalidated cache for tournament ${tournamentId}, stage ${stage}`);
  } else {
    // Broad invalidation: remove all entries for this tournament.
    // Iterates all keys to find ones prefixed with the tournament ID.
    const keys = Array.from(standingsCache.keys());
    keys.forEach(key => {
      if (key.startsWith(tournamentId)) {
        standingsCache.delete(key);
      }
    });
    log.debug(`Invalidated all cache for tournament ${tournamentId}`);
  }
}

/**
 * Clear the entire in-memory cache.
 * Useful for testing or full cache reset scenarios.
 * Note: This does NOT clear Redis -- use invalidate() for that.
 */
function clear(): void {
  log.debug('Cleared all standings cache');
  standingsCache.clear();
}

// Export core cache operations
export { get, set, generateETag, invalidate, isExpired, clear };

// Export async-named aliases for Redis usage clarity.
// These are identical to the base functions (which are already async)
// but provide explicit naming for consumers that want to emphasize
// the async/Redis nature of the operations.
export { get as getAsync, set as setAsync, invalidate as invalidateAsync };

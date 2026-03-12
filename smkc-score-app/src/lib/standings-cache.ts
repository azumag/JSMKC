/**
 * Standings Cache Module
 *
 * Provides in-memory caching for tournament standings data.
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
 */

import { createLogger } from './logger';

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
 * In-memory cache store.
 * Keys are formatted as "tournamentId:stage".
 */
const standingsCache = new Map<string, CachedStandings>();

/**
 * Retrieve a cached standings entry from the in-memory cache.
 *
 * @param tournamentId - Tournament identifier
 * @param stage        - Competition stage (e.g., "qualification", "finals")
 * @returns Cached entry or null if not found
 */
async function get(tournamentId: string, stage: string): Promise<CachedStandings | null> {
  const key = `${tournamentId}:${stage}`;
  return standingsCache.get(key) || null;
}

/**
 * Store standings data in the in-memory cache.
 *
 * @param tournamentId - Tournament identifier
 * @param stage        - Competition stage
 * @param data         - Standings data array to cache
 * @param etag         - Pre-computed ETag for the data
 */
async function set(tournamentId: string, stage: string, data: unknown[], etag: string): Promise<void> {
  const key = `${tournamentId}:${stage}`;
  const cacheEntry: CachedStandings = {
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
function isExpired(cacheEntry: CachedStandings): boolean {
  const age = Date.now() - new Date(cacheEntry.lastUpdated).getTime();
  return age > CACHE_TTL_MS;
}

/**
 * Invalidate cached standings for a tournament.
 *
 * Can target a specific stage or all stages for the given tournament.
 *
 * @param tournamentId - Tournament identifier
 * @param stage        - Optional specific stage to invalidate; if omitted, all stages are cleared
 */
async function invalidate(tournamentId: string, stage?: string): Promise<void> {
  if (stage) {
    standingsCache.delete(`${tournamentId}:${stage}`);
    log.debug(`Invalidated cache for tournament ${tournamentId}, stage ${stage}`);
  } else {
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
 */
function clear(): void {
  log.debug('Cleared all standings cache');
  standingsCache.clear();
}

// Export core cache operations
export { get, set, generateETag, invalidate, isExpired, clear };

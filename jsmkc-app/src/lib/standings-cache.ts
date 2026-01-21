import { createLogger } from './logger';
import { 
  getStandingsCache, 
  setStandingsCache, 
  invalidateStandingsCache 
} from './redis-cache';

export interface CachedStandings {
  data: unknown[];
  lastUpdated: string;
  etag: string;
}

const log = createLogger('standings-cache');
const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  data: unknown[];
  lastUpdated: string;
  etag: string;
};

// Legacy in-memory cache fallback
const standingsCache = new Map<string, CacheEntry>();

async function get(tournamentId: string, stage: string): Promise<CacheEntry | null> {
  // Try Redis first
  const redisData = await getStandingsCache(tournamentId, stage);
  if (redisData) {
    // Redis returns the data directly, create a CacheEntry
    return {
      data: redisData,
      lastUpdated: new Date().toISOString(),
      etag: '', // Will be set by the caller
    };
  }
  
  // Fallback to in-memory cache
  const key = `${tournamentId}:${stage}`;
  return standingsCache.get(key) || null;
}

async function set(tournamentId: string, stage: string, data: unknown[], etag: string): Promise<void> {
  // Set in Redis first
  await setStandingsCache(tournamentId, stage, data, etag);
  
  // Also set in in-memory cache as fallback
  const key = `${tournamentId}:${stage}`;
  const cacheEntry: CacheEntry = {
    data,
    lastUpdated: new Date().toISOString(),
    etag,
  };
  standingsCache.set(key, cacheEntry);
}

function generateETag(data: unknown[]): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function isExpired(cacheEntry: CacheEntry): boolean {
  const age = Date.now() - new Date(cacheEntry.lastUpdated).getTime();
  return age > CACHE_TTL_MS;
}

async function invalidate(tournamentId: string, stage?: string): Promise<void> {
  // Invalidate in Redis
  await invalidateStandingsCache(tournamentId, stage);
  
  // Also invalidate in-memory cache
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

function clear(): void {
  log.debug('Cleared all standings cache');
  standingsCache.clear();
}

export { get, set, generateETag, invalidate, isExpired, clear };

// Export async versions for Redis usage
export { get as getAsync, set as setAsync, invalidate as invalidateAsync };

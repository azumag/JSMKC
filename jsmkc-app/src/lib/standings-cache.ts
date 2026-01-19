export interface CachedStandings {
  data: unknown[];
  lastUpdated: string;
  etag: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  data: unknown[];
  lastUpdated: string;
  etag: string;
};

const standingsCache = new Map<string, CacheEntry>();

function get(tournamentId: string, stage: string): CacheEntry | null {
  const key = `${tournamentId}:${stage}`;
  return standingsCache.get(key) || null;
}

function set(tournamentId: string, stage: string, data: unknown[], etag: string): void {
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

function invalidate(tournamentId: string, stage?: string): void {
  if (stage) {
    standingsCache.delete(`${tournamentId}:${stage}`);
  } else {
    const keys = Array.from(standingsCache.keys());
    keys.forEach(key => {
      if (key.startsWith(tournamentId)) {
        standingsCache.delete(key);
      }
    });
  }
}

function clear(): void {
  standingsCache.clear();
}

export { get, set, generateETag, invalidate, isExpired, clear };

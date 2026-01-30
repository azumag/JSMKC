/**
 * Rate Limiting Facade with Redis-to-In-Memory Fallback
 *
 * Provides a unified rate limiting interface that tries Redis-backed
 * rate limiting first and falls back to an in-memory implementation
 * if Redis is unavailable.
 *
 * This dual-layer approach ensures rate limiting is always active:
 * - Redis: Accurate, shared across server instances, persistent across restarts
 * - In-Memory: Process-local, lost on restart, but always available
 *
 * The facade pattern allows API route handlers to use a single import
 * without worrying about which backend is active.
 *
 * Client identification strategy (in priority order):
 * 1. x-forwarded-for header (behind reverse proxy/load balancer)
 * 2. x-real-ip header (Nginx convention)
 * 3. cf-connecting-ip header (Cloudflare)
 * 4. 'unknown' fallback (should not happen in production)
 *
 * Usage:
 *   import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
 *   const clientIp = getClientIdentifier(request);
 *   const result = await checkRateLimit('scoreInput', clientIp);
 *   if (!result.success) return handleRateLimitError(result.retryAfter);
 */

import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { createLogger } from '@/lib/logger';
import {
  checkRateLimitByType,
  clearRateLimitData as redisClearRateLimitData,
  rateLimitConfigs as redisRateLimitConfigs,
} from '@/lib/redis-rate-limit';

/** Logger scoped to rate limit facade operations */
const logger = createLogger('rate-limit');

// ============================================================
// Types
// ============================================================

/**
 * Result of a rate limit check.
 * Matches the interface from redis-rate-limit for consistency.
 */
export interface RateLimitResult {
  /** Whether the request is allowed (under the limit) */
  success: boolean;
  /** Number of requests remaining in the current window */
  remaining?: number;
  /** Window reset timestamp in milliseconds */
  reset?: number;
  /** Maximum requests allowed in the window */
  limit?: number;
  /** Seconds until the client can retry (only set when rate limited) */
  retryAfter?: number;
}

/**
 * Re-export rate limit configurations from redis-rate-limit.
 * This allows consumers to import configs from either module.
 */
export const rateLimitConfigs = redisRateLimitConfigs;

// ============================================================
// Primary Rate Limit Function (Redis with In-Memory Fallback)
// ============================================================

/**
 * Checks rate limit for a given operation type and client identifier.
 *
 * Attempts Redis-backed rate limiting first for accuracy and cross-instance
 * consistency. If Redis is unavailable (connection error, timeout), falls
 * back to process-local in-memory rate limiting.
 *
 * The fallback ensures rate limiting is always active, even during Redis
 * outages. The in-memory fallback is less accurate (per-process, not shared)
 * but provides basic protection against abuse.
 *
 * @param type - The operation type (key from rateLimitConfigs)
 * @param identifier - Client identifier (usually IP address)
 * @returns RateLimitResult indicating if the request is allowed
 *
 * @example
 *   const result = await checkRateLimit('scoreInput', clientIp);
 *   if (!result.success) {
 *     return handleRateLimitError(result.retryAfter);
 *   }
 */
export async function checkRateLimit(
  type: string,
  identifier: string
): Promise<RateLimitResult> {
  try {
    // Try Redis-backed rate limiting first for accuracy
    // and cross-instance consistency
    return await checkRateLimitByType(type, identifier);
  } catch (error) {
    // Redis unavailable - fall back to in-memory rate limiting.
    // This ensures rate limiting is always active even during
    // Redis outages, though it's per-process only.
    logger.warn('Redis rate limit unavailable, falling back to in-memory', {
      type,
      identifier,
      error: error instanceof Error ? error.message : String(error),
    });

    // Look up the configuration for this operation type
    const config = rateLimitConfigs[type] || rateLimitConfigs.general;
    const compositeIdentifier = `${identifier}:${type}`;

    return rateLimitInMemory(compositeIdentifier, config.limit, config.windowMs);
  }
}

// ============================================================
// Direct In-Memory Rate Limiting
// ============================================================

/**
 * Entry in the in-memory rate limit store.
 * Tracks request timestamps for sliding window calculation.
 */
interface RateLimitEntry {
  /** Array of request timestamps (Unix ms) within the current window */
  timestamps: number[];
}

/**
 * In-memory rate limit store using a Map for O(1) lookups.
 *
 * Each key maps to an array of request timestamps. The sliding window
 * algorithm removes expired timestamps on each check.
 *
 * WARNING: This store is process-local and lost on server restart.
 * It does not share state across multiple server instances.
 * Use Redis-backed rate limiting for production deployments.
 */
export const rateLimitStore: Map<string, RateLimitEntry> = new Map();

/**
 * Maximum number of entries in the in-memory store.
 * Prevents unbounded memory growth from many unique client identifiers.
 * When exceeded, the oldest entries are evicted.
 */
const MAX_STORE_SIZE = 10000;

/**
 * Direct in-memory rate limiting function.
 *
 * Can be used directly when Redis fallback is not needed (e.g., testing)
 * or when a simple per-process rate limiter is sufficient.
 *
 * @param identifier - Unique identifier for the rate limit subject
 * @param limit - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns RateLimitResult
 *
 * @example
 *   const result = rateLimit('192.168.1.1', 10, 60000);
 */
export function rateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  return rateLimitInMemory(identifier, limit, windowMs);
}

/**
 * Implements sliding window rate limiting using in-memory timestamps.
 *
 * Algorithm:
 * 1. Get or create the entry for this identifier
 * 2. Remove all timestamps older than (now - windowMs)
 * 3. Check if count exceeds limit
 * 4. If allowed, add current timestamp
 * 5. Return result with remaining count
 *
 * This provides per-process rate limiting as a fallback when Redis
 * is unavailable. It's less accurate than Redis (no cross-process
 * sharing) but always available.
 *
 * @param identifier - Unique identifier for the rate limit subject
 * @param limit - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns RateLimitResult
 */
export function rateLimitInMemory(
  identifier: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Get or create the entry for this identifier
  let entry = rateLimitStore.get(identifier);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(identifier, entry);
  }

  // Remove timestamps outside the sliding window.
  // This keeps only recent requests for accurate counting.
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  // Check if the current request would exceed the limit
  if (entry.timestamps.length >= limit) {
    // Calculate retry-after based on the oldest timestamp in the window.
    // When the oldest request expires from the window, there will be
    // room for a new request.
    const oldestTimestamp = entry.timestamps[0];
    const retryAfterMs = oldestTimestamp + windowMs - now;
    const retryAfter = Math.ceil(retryAfterMs / 1000);

    return {
      success: false,
      remaining: 0,
      retryAfter: Math.max(1, retryAfter),
    };
  }

  // Request is allowed - record the timestamp
  entry.timestamps.push(now);

  // Enforce store size limit to prevent unbounded memory growth.
  // This runs periodically, not on every request, for efficiency.
  if (rateLimitStore.size > MAX_STORE_SIZE) {
    enforceStoreSizeLimit();
  }

  return {
    success: true,
    remaining: limit - entry.timestamps.length,
  };
}

/**
 * Clears all entries from the in-memory rate limit store.
 *
 * Used for testing cleanup and server maintenance.
 * Also attempts to clear Redis rate limit data.
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
  logger.debug('In-memory rate limit store cleared');

  // Also attempt to clear Redis data (non-blocking, failures are acceptable)
  redisClearRateLimitData().catch((error) => {
    logger.warn('Failed to clear Redis rate limit data', {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

/**
 * Removes expired entries from the in-memory rate limit store.
 *
 * Iterates through all entries and removes timestamps that have
 * fallen outside the maximum possible window. Entries with no
 * remaining timestamps are deleted entirely.
 *
 * This function is called periodically by rateLimitInMemory when
 * the store grows large, and can also be called manually for
 * maintenance.
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  // Use the longest possible window (general config) for cleanup.
  // This ensures we don't accidentally remove entries that are still
  // valid for shorter windows.
  const maxWindowMs = Math.max(
    ...Object.values(rateLimitConfigs).map((c) => c.windowMs)
  );
  const cutoff = now - maxWindowMs;

  for (const [key, entry] of rateLimitStore.entries()) {
    // Remove expired timestamps from this entry
    entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);

    // Delete entries with no remaining timestamps to free memory
    if (entry.timestamps.length === 0) {
      rateLimitStore.delete(key);
    }
  }

  logger.debug('Expired rate limit entries cleaned up', {
    remainingEntries: rateLimitStore.size,
  });
}

/**
 * Enforces the maximum store size limit by removing the oldest entries.
 *
 * When the store exceeds MAX_STORE_SIZE, this function removes entries
 * starting from the oldest (Map iterates in insertion order) until the
 * store is back within limits.
 *
 * This prevents unbounded memory growth from many unique client IPs.
 */
export function enforceStoreSizeLimit(): void {
  // First, try cleaning up expired entries to free space naturally
  cleanupExpiredEntries();

  // If still over limit, remove the oldest entries (FIFO order).
  // Map.keys() iterates in insertion order, so the first keys
  // are the oldest entries.
  if (rateLimitStore.size > MAX_STORE_SIZE) {
    const entriesToRemove = rateLimitStore.size - MAX_STORE_SIZE;
    const keys = rateLimitStore.keys();
    for (let i = 0; i < entriesToRemove; i++) {
      const key = keys.next().value;
      if (key) {
        rateLimitStore.delete(key);
      }
    }

    logger.warn('Rate limit store size limit enforced', {
      removed: entriesToRemove,
      remaining: rateLimitStore.size,
    });
  }
}

// ============================================================
// Client Identification
// ============================================================

/**
 * Extracts the client IP address from a NextRequest object.
 *
 * Checks multiple headers in priority order to support various
 * deployment configurations:
 * 1. x-forwarded-for: Standard proxy header (comma-separated, first is client)
 * 2. x-real-ip: Nginx convention for the real client IP
 * 3. cf-connecting-ip: Cloudflare-specific header for client IP
 *
 * Falls back to 'unknown' if no IP can be determined, which should
 * not happen in production behind a properly configured proxy.
 *
 * @param request - The NextRequest object from the API route handler
 * @returns The client IP address string
 *
 * @example
 *   export async function POST(request: NextRequest) {
 *     const clientIp = getClientIdentifier(request);
 *     const rateResult = await checkRateLimit('scoreInput', clientIp);
 *   }
 */
export function getClientIdentifier(request: NextRequest): string {
  // x-forwarded-for contains a comma-separated list of IPs.
  // The first IP is the original client, subsequent IPs are proxies.
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Extract only the first IP (original client) and trim whitespace
    return forwardedFor.split(',')[0].trim();
  }

  // x-real-ip is set by Nginx and some other reverse proxies
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // cf-connecting-ip is set by Cloudflare's CDN/proxy
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) {
    return cfIp;
  }

  // Fallback when no identifying header is present.
  // This should only happen in development or misconfigured deployments.
  return 'unknown';
}

/**
 * Extracts the User-Agent string from a NextRequest object.
 *
 * Used for audit logging to track which browser/client made the request.
 * Returns 'unknown' if the header is not present.
 *
 * @param request - The NextRequest object from the API route handler
 * @returns The User-Agent string
 */
export function getUserAgent(request: NextRequest): string {
  return request.headers.get('user-agent') || 'unknown';
}

/**
 * Extracts the client IP address server-side using Next.js headers() API.
 *
 * This function is used in Server Components and server-side code where
 * a NextRequest object is not available. Uses the same header priority
 * as getClientIdentifier but reads from the Next.js headers() function.
 *
 * @returns The client IP address string
 *
 * @example
 *   // In a Server Component or server action
 *   const ip = await getServerSideIdentifier();
 */
export async function getServerSideIdentifier(): Promise<string> {
  try {
    // headers() returns a ReadonlyHeaders object from Next.js
    // that provides access to incoming request headers
    const headersList = await headers();

    // Same priority order as getClientIdentifier
    const forwardedFor = headersList.get('x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }

    const realIp = headersList.get('x-real-ip');
    if (realIp) {
      return realIp;
    }

    const cfIp = headersList.get('cf-connecting-ip');
    if (cfIp) {
      return cfIp;
    }

    return 'unknown';
  } catch (error) {
    // headers() can throw if called outside a request context
    // (e.g., during static generation). Return 'unknown' to be safe.
    logger.debug('Failed to get server-side identifier', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 'unknown';
  }
}

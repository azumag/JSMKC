/**
 * Rate Limiting Module
 *
 * Provides an in-memory sliding window rate limiter for API endpoints.
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

/** Logger scoped to rate limit facade operations */
const logger = createLogger('rate-limit');

// ============================================================
// Types
// ============================================================

/**
 * Result of a rate limit check.
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
 * Configuration for a rate limit rule.
 */
interface RateLimitConfig {
  /** Maximum number of requests allowed in the time window */
  limit: number;
  /** Time window duration in milliseconds */
  windowMs: number;
}

/**
 * Predefined rate limit configurations for different API operation types.
 */
// Loose limits — this is an internal tournament tool with few concurrent users.
// Only meant to catch runaway loops or obvious abuse, not throttle normal usage.
export const rateLimitConfigs: Record<string, RateLimitConfig> = {
  scoreInput: { limit: 120, windowMs: 60 * 1000 },
  polling: { limit: 120, windowMs: 60 * 1000 },
  sessionStatus: { limit: 60, windowMs: 60 * 1000 },
  general: { limit: 60, windowMs: 60 * 1000 },
};

// ============================================================
// Primary Rate Limit Function
// ============================================================

/**
 * Checks rate limit for a given operation type and client identifier.
 *
 * @param type - The operation type (key from rateLimitConfigs)
 * @param identifier - Client identifier (usually IP address)
 * @returns RateLimitResult indicating if the request is allowed
 */
export async function checkRateLimit(
  type: string,
  identifier: string
): Promise<RateLimitResult> {
  const config = rateLimitConfigs[type] || rateLimitConfigs.general;
  const compositeIdentifier = `${identifier}:${type}`;
  return rateLimitInMemory(compositeIdentifier, config.limit, config.windowMs);
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
 */
export const rateLimitStore: Map<string, RateLimitEntry> = new Map();

/**
 * Maximum number of entries in the in-memory store.
 * Prevents unbounded memory growth from many unique client identifiers.
 * When exceeded, the oldest entries are evicted.
 */
const MAX_STORE_SIZE = 10000;

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

/** Backward-compatible alias for {@link rateLimitInMemory}. */
export { rateLimitInMemory as rateLimit };

/**
 * Clears all entries from the in-memory rate limit store.
 *
 * Used for testing cleanup and server maintenance.
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
  logger.debug('In-memory rate limit store cleared');
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

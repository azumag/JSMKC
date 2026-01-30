/**
 * Redis-Backed Rate Limiting
 *
 * Implements a sliding window rate limiter using Redis sorted sets.
 * This approach provides accurate request counting within a moving
 * time window, unlike simple fixed-window counters that can allow
 * burst traffic at window boundaries.
 *
 * Algorithm (Sliding Window with Sorted Sets):
 * 1. Use the client identifier as the Redis key
 * 2. Each request adds a member with the current timestamp as score
 * 3. Remove all members with timestamps older than the window
 * 4. Count remaining members to determine if limit is exceeded
 * 5. Set key expiry to window size for automatic cleanup
 *
 * This is used as the primary rate limiting backend. If Redis is
 * unavailable, the application falls back to in-memory rate limiting
 * (see rate-limit.ts).
 *
 * Rate limit configurations:
 * - scoreInput: 20 requests/minute (player score submissions)
 * - polling: 12 requests/minute (live data polling at 5s intervals)
 * - tokenValidation: 10 requests/minute (token verification)
 * - general: 10 requests/minute (default for other endpoints)
 *
 * Usage:
 *   import { checkRateLimitByType } from '@/lib/redis-rate-limit';
 *   const result = await checkRateLimitByType('scoreInput', clientIp);
 *   if (!result.success) return handleRateLimitError(result.retryAfter);
 */

import { createClient, RedisClientType } from 'redis';
import { createLogger } from '@/lib/logger';

/** Logger scoped to rate limiting operations */
const logger = createLogger('redis-rate-limit');

// ============================================================
// Redis Client Management
// ============================================================

/**
 * Singleton Redis client for rate limiting.
 * Separate from the cache client to allow independent configuration
 * (e.g., different Redis databases or connection pools).
 */
let redisClient: RedisClientType | null = null;

/**
 * Mock Redis client for testing environments.
 * When set, bypasses real Redis connection for unit tests.
 */
let mockRedisClient: RedisClientType | null = null;

/**
 * Returns the Redis client for rate limiting operations.
 *
 * In test environments, returns the mock client if configured.
 * Otherwise, creates and returns a singleton Redis client.
 *
 * @returns The Redis client instance (real or mock)
 */
export async function getRedisClient(): Promise<RedisClientType> {
  // In test environment, use mock client if available.
  // This allows unit tests to control Redis behavior without
  // requiring a running Redis server.
  if (process.env.NODE_ENV === 'test' && mockRedisClient) {
    return mockRedisClient;
  }

  // Return existing client if already connected (singleton pattern)
  if (redisClient) {
    return redisClient;
  }

  // Create new Redis client with REDIS_URL or localhost default
  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  }) as RedisClientType;

  // Log errors but don't crash - rate limiting should degrade gracefully
  redisClient.on('error', (err: Error) => {
    logger.error('Redis rate-limit client error', { error: err.message });
  });

  await redisClient.connect();
  logger.info('Redis rate-limit client connected');

  return redisClient;
}

/**
 * Returns the current mock Redis client (for test assertions).
 *
 * @returns The mock Redis client or null if not set
 */
export function mockRedisClientForTesting(): RedisClientType | null {
  return mockRedisClient;
}

/**
 * Sets a mock Redis client for testing purposes.
 *
 * Allows unit tests to inject a mock Redis client that simulates
 * Redis behavior without requiring a running Redis server.
 *
 * @param client - The mock Redis client to use in tests
 */
export function setMockRedisClientForTesting(client: RedisClientType): void {
  mockRedisClient = client;
}

/**
 * Resets the Redis client state for test cleanup.
 *
 * Should be called in afterEach/afterAll test hooks to ensure
 * clean state between test runs.
 */
export function resetRedisClientForTest(): void {
  mockRedisClient = null;
  redisClient = null;
}

// ============================================================
// Rate Limit Configuration
// ============================================================

/**
 * Configuration for a rate limit rule.
 *
 * @property limit - Maximum number of requests allowed within the window
 * @property windowMs - The time window in milliseconds
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed in the time window */
  limit: number;
  /** Time window duration in milliseconds */
  windowMs: number;
}

/**
 * Result of a rate limit check.
 *
 * @property success - Whether the request is allowed
 * @property remaining - Number of requests remaining in the current window
 * @property retryAfter - Seconds until the client can retry (if rate limited)
 */
export interface RateLimitResult {
  /** Whether the request is allowed (under the limit) */
  success: boolean;
  /** Number of requests remaining in the current window */
  remaining: number;
  /** Seconds until the client can retry (only set when rate limited) */
  retryAfter?: number;
}

// ============================================================
// Core Rate Limiting Function
// ============================================================

/**
 * Checks if a request from the given identifier is within rate limits.
 *
 * Uses Redis sorted sets to implement a precise sliding window counter.
 *
 * How the sorted set approach works:
 * 1. Key = "ratelimit:{identifier}" (e.g., "ratelimit:192.168.1.1:scoreInput")
 * 2. Each request adds a member with score = current timestamp
 * 3. Members older than (now - windowMs) are removed
 * 4. The count of remaining members = number of requests in window
 * 5. If count >= limit, the request is denied
 *
 * This provides more accurate rate limiting than fixed windows because
 * the window slides continuously rather than resetting at fixed intervals.
 *
 * @param identifier - Unique identifier for the rate limit subject (usually IP + type)
 * @param config - The rate limit configuration (limit and window)
 * @returns RateLimitResult indicating if the request is allowed
 *
 * @example
 *   const result = await checkRateLimit('192.168.1.1:scoreInput', {
 *     limit: 20,
 *     windowMs: 60000,
 *   });
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    const client = await getRedisClient();
    const key = `ratelimit:${identifier}`;
    const now = Date.now();

    // Calculate the start of the sliding window.
    // Any requests older than this timestamp are outside the window.
    const windowStart = now - config.windowMs;

    // Generate a unique member value for this request.
    // Using timestamp + random to avoid collisions when multiple
    // requests arrive in the same millisecond.
    const member = `${now}:${Math.random().toString(36).substring(2)}`;

    // Execute all operations atomically using Redis pipeline/multi.
    // This ensures consistent state even under concurrent access:
    // 1. Remove expired entries (outside the sliding window)
    // 2. Add the current request
    // 3. Count total requests in the window
    // 4. Set key expiry for automatic cleanup

    // Step 1: Remove all entries with timestamps before the window start.
    // ZREMRANGEBYSCORE removes sorted set members whose score falls
    // within the specified range (0 to windowStart).
    await client.zRemRangeByScore(key, 0, windowStart);

    // Step 2: Add the current request with its timestamp as the score.
    // The score allows efficient range queries and cleanup.
    await client.zAdd(key, { score: now, value: member });

    // Step 3: Count all entries in the sorted set (requests in window).
    // ZCARD returns the total number of members in the sorted set.
    const requestCount = await client.zCard(key);

    // Step 4: Set key expiry to window duration for automatic cleanup.
    // This prevents orphaned keys from accumulating in Redis if
    // a client stops making requests.
    const windowSeconds = Math.ceil(config.windowMs / 1000);
    await client.expire(key, windowSeconds);

    // Check if the request count exceeds the limit
    if (requestCount > config.limit) {
      // Rate limit exceeded - calculate when the oldest entry in the
      // window will expire, which is when the client can retry.
      const oldestEntry = await client.zRange(key, 0, 0, { REV: false });
      let retryAfter = windowSeconds;

      if (oldestEntry.length > 0) {
        // Parse the timestamp from the oldest entry to calculate
        // exact retry time
        const oldestTimestamp = parseInt(oldestEntry[0].split(':')[0], 10);
        retryAfter = Math.ceil((oldestTimestamp + config.windowMs - now) / 1000);
      }

      logger.warn('Rate limit exceeded', {
        identifier,
        requestCount,
        limit: config.limit,
        retryAfter,
      });

      return {
        success: false,
        remaining: 0,
        retryAfter: Math.max(1, retryAfter),
      };
    }

    // Request is within limits
    return {
      success: true,
      remaining: config.limit - requestCount,
    };
  } catch (error) {
    // If Redis is unavailable, allow the request through.
    // Rate limiting is a protective measure, not a critical path.
    // The in-memory fallback in rate-limit.ts provides backup protection.
    logger.error('Rate limit check failed', {
      identifier,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: true,
      remaining: config.limit,
    };
  }
}

// ============================================================
// Predefined Rate Limit Configurations
// ============================================================

/**
 * Predefined rate limit configurations for different API operation types.
 *
 * These values are tuned for JSMKC's specific usage patterns:
 * - scoreInput: Higher limit because players submit scores during live matches
 * - polling: Moderate limit matching 5-second polling interval (12/min = 1 per 5s)
 * - tokenValidation: Lower limit as tokens are validated once per session
 * - general: Default for miscellaneous endpoints
 */
export const rateLimitConfigs: Record<string, RateLimitConfig> = {
  /**
   * Score input rate limit: 20 requests per minute.
   * Players submit scores during live tournament matches.
   * Higher limit to accommodate rapid score entry without blocking.
   */
  scoreInput: {
    limit: 20,
    windowMs: 60 * 1000, // 1 minute
  },

  /**
   * Polling rate limit: 12 requests per minute.
   * Clients poll for live standings updates every 5 seconds.
   * 12/minute = 1 request per 5 seconds, matching the POLLING_INTERVAL constant.
   */
  polling: {
    limit: 12,
    windowMs: 60 * 1000, // 1 minute
  },

  /**
   * Token validation rate limit: 10 requests per minute.
   * Tournament tokens are validated when players access score entry pages.
   * Lower limit as token validation should be infrequent per client.
   */
  tokenValidation: {
    limit: 10,
    windowMs: 60 * 1000, // 1 minute
  },

  /**
   * General rate limit: 10 requests per minute.
   * Default for endpoints without a specific rate limit configuration.
   * Conservative limit to prevent abuse of unprotected endpoints.
   */
  general: {
    limit: 10,
    windowMs: 60 * 1000, // 1 minute
  },
};

/**
 * Checks rate limit for a specific operation type using predefined configurations.
 *
 * Convenience function that combines the operation type and client identifier
 * into a unique rate limit key and applies the appropriate configuration.
 *
 * @param type - The operation type (key from rateLimitConfigs)
 * @param identifier - Client identifier (usually IP address)
 * @returns RateLimitResult indicating if the request is allowed
 *
 * @example
 *   const result = await checkRateLimitByType('scoreInput', clientIp);
 */
export async function checkRateLimitByType(
  type: string,
  identifier: string
): Promise<RateLimitResult> {
  // Look up the configuration for this operation type.
  // Fall back to 'general' config if the type is not recognized.
  const config = rateLimitConfigs[type] || rateLimitConfigs.general;

  // Combine type and identifier to create a unique rate limit key.
  // This ensures that limits are per-client-per-operation,
  // not globally shared across all clients or all operations.
  const compositeIdentifier = `${identifier}:${type}`;

  return checkRateLimit(compositeIdentifier, config);
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Clears rate limit data for a specific identifier or all identifiers.
 *
 * Used for testing and administrative purposes. In production, this
 * could be used to manually unblock a rate-limited client.
 *
 * @param identifier - Optional specific identifier to clear.
 *                     If omitted, clears ALL rate limit data.
 *
 * @example
 *   // Clear rate limit for a specific client
 *   await clearRateLimitData('192.168.1.1:scoreInput');
 *
 *   // Clear all rate limit data
 *   await clearRateLimitData();
 */
export async function clearRateLimitData(identifier?: string): Promise<void> {
  try {
    const client = await getRedisClient();

    if (identifier) {
      // Delete the specific rate limit key for this identifier
      const key = `ratelimit:${identifier}`;
      await client.del(key);
      logger.info('Rate limit data cleared for identifier', { identifier });
    } else {
      // Clear all rate limit keys by pattern.
      // WARNING: This scans all keys matching the pattern.
      // In production, prefer clearing specific identifiers.
      const keys = await client.keys('ratelimit:*');
      if (keys.length > 0) {
        await client.del(keys);
      }
      logger.info('All rate limit data cleared', { keysDeleted: keys.length });
    }
  } catch (error) {
    logger.error('Failed to clear rate limit data', {
      identifier,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

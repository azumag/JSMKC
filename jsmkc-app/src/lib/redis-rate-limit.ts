import { createClient, type RedisClientType } from 'redis';
import { createLogger } from './logger';

const log = createLogger('redis');

// Redis client instance
let redisClient: RedisClientType | null = null;

// Global mock client for testing - allows tests to access and modify mock methods
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let mockRedisClientForTesting: any = null;

// Setter function for tests to provide their mock client
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setMockRedisClientForTesting(mockClient: any) {
  mockRedisClientForTesting = mockClient;
}

export async function getRedisClient() {
  if (!redisClient) {
    // Check if we're in test environment and use mock if needed
    if (process.env.NODE_ENV === 'test') {
      // Check if a test mock was already provided by tests
      // Tests can set mockRedisClientForTesting before calling getRedisClient()
      if (mockRedisClientForTesting) {
        redisClient = mockRedisClientForTesting as unknown as RedisClientType;
        return redisClient;
      }

      // Create a mock Redis client for testing using redis.createClient
      // This allows tests to mock redis.createClient to provide their own mock
      redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      }) as unknown as RedisClientType;

      // Store in global variable so tests can access and modify
      mockRedisClientForTesting = redisClient;

      // Don't connect in test mode - tests should handle this
      return redisClient;
    }

    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    redisClient.on('error', (err) => {
      log.error('Redis Client Error:', { error: err });
    });

    redisClient.on('connect', () => {
      log.info('Redis cache connected successfully');
    });

    await redisClient.connect();
  }
  return redisClient;
}

// Reset function for testing - allows tests to clear the cached Redis client
export function resetRedisClientForTest() {
  redisClient = null;
  mockRedisClientForTesting = null;
}

// Rate limiting with Redis
export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<{
  success: boolean;
  remaining?: number;
  reset?: number;
  limit?: number;
  retryAfter?: number;
}> {
  try {
    const client = await getRedisClient();
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const key = `rate_limit:${identifier}`;

    // Remove expired entries
    if (!client) throw new Error('Redis client not available');
    await client.zRemRangeByScore(key, 0, windowStart);

    // Get current count
    const currentCount = await client.zCard(key);

    if (currentCount >= config.limit) {
      // Get oldest request timestamp to calculate retryAfter
      const oldestRequest = await client.zRange(key, 0, 0, { REV: true });
      const oldestTimestamp = oldestRequest.length > 0 ? parseInt(oldestRequest[0]) : now;
      const retryAfter = Math.ceil((oldestTimestamp + config.windowMs - now) / 1000);

      return {
        success: false,
        remaining: 0,
        limit: config.limit,
        retryAfter,
      };
    }

    // Add current request
    await client.zAdd(key, { score: now, value: now.toString() });
    await client.expire(key, Math.ceil(config.windowMs / 1000));

    const remaining = config.limit - currentCount - 1;

    return {
      success: true,
      remaining,
      limit: config.limit,
      retryAfter: undefined,
    };
  } catch (error) {
    log.error('Rate limit check failed:', { error });
    // Fallback to in-memory if Redis fails
    return {
      success: true,
      remaining: config.limit - 1,
      limit: config.limit,
      retryAfter: undefined,
    };
  }
}

// Enhanced rate limiting with different types
export const rateLimitConfigs = {
  scoreInput: { limit: 20, windowMs: 60 * 1000 },      // 20 requests per minute
  polling: { limit: 12, windowMs: 60 * 1000 },         // 12 requests per minute
  tokenValidation: { limit: 10, windowMs: 60 * 1000 }, // 10 requests per minute
  general: { limit: 10, windowMs: 60 * 1000 },         // 10 requests per minute
};

export async function checkRateLimitByType(
  type: keyof typeof rateLimitConfigs,
  identifier: string
) {
  const config = rateLimitConfigs[type] || rateLimitConfigs.general;
  return await checkRateLimit(identifier, config);
}

// Clean up function for testing
export async function clearRateLimitData(identifier?: string) {
  try {
    const client = await getRedisClient();
    if (!client) throw new Error('Redis client not available');
    
    if (identifier) {
      await client.del(`rate_limit:${identifier}`);
    } else {
      const keys = await client.keys('rate_limit:*');
      // Add null/undefined check before accessing length property
      if (keys && keys.length > 0) {
        await client.del(keys);
      }
    }
  } catch (error) {
    log.error('Failed to clear rate limit data:', { error });
  }
}
import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

interface RateLimitResult {
  success: boolean;
  remaining?: number;
  reset?: number;
  limit?: number;
  retryAfter?: number;
}

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// エンドポイント別の制限設定 as specified in ARCHITECTURE.md section 6.2
const rateLimits = {
  // スコア入力: 高頻度を許可
  scoreInput: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '60 s'), // 1分に20回
  }),
  
  // 一般ポーリング: 中程度
  polling: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(12, '60 s'), // 1分に12回（5秒間隔）
  }),
  
  // トークン検証: 低頻度
  tokenValidation: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '60 s'), // 1分に10回
  }),

  // Default general purpose limiter
  general: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1 m'),
    analytics: false,
  }),
};

// Create a new ratelimiter that allows 10 requests per minute (fallback)
const ratelimit = rateLimits.general;

export async function checkRateLimit(
  type: keyof typeof rateLimits, 
  identifier: string
) {
  try {
    const { success, limit, remaining, reset } = await rateLimits[type].limit(identifier)
    
    return {
      success,
      limit,
      remaining,
      reset,
      retryAfter: success ? undefined : Math.ceil((reset - Date.now()) / 1000)
    }
  } catch (error) {
    console.warn(`Rate limiting failed for type ${type}, falling back to in-memory:`, error);
    // Fallback to in-memory rate limiting
    const limit = getLimitForType(type);
    const windowMs = getWindowForType(type);
    return rateLimitInMemory(identifier, limit, windowMs);
  }
}

// Helper function to get limit values for different types
function getLimitForType(type: keyof typeof rateLimits): number {
  switch (type) {
    case 'scoreInput': return 20;
    case 'polling': return 12;
    case 'tokenValidation': return 10;
    default: return 10;
  }
}

function getWindowForType(type: keyof typeof rateLimits): number {
  return 60 * 1000; // 1 minute for all types
}

export async function rateLimit(
  identifier: string,
  limit: number = 10,
  windowMs: number = 60 * 1000 // 1 minute
): Promise<RateLimitResult> {
  try {
    const result = await ratelimit.limit(identifier);
    return {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (error) {
    // Fallback to in-memory rate limiting if Redis is not available
    console.warn('Redis rate limiting failed, falling back to in-memory:', error);
    return rateLimitInMemory(identifier, limit, windowMs);
  }
}

// Fallback in-memory rate limiting for development
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// Maximum store size to prevent memory leaks in Edge Runtime
const MAX_STORE_SIZE = 10000

function cleanupExpiredEntries(): number {
  const now = Date.now()
  let cleanedCount = 0
  
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime < now) {
      rateLimitStore.delete(key)
      cleanedCount++
    }
  }
  
  return cleanedCount
}

function enforceStoreSizeLimit(): number {
  if (rateLimitStore.size <= MAX_STORE_SIZE) return 0
  
  const entries = Array.from(rateLimitStore.entries())
  entries.sort((a, b) => a[1].resetTime - b[1].resetTime)
  
  const toDelete = entries.slice(0, rateLimitStore.size - MAX_STORE_SIZE)
  let deletedCount = 0
  
  for (const [key] of toDelete) {
    rateLimitStore.delete(key)
    deletedCount++
  }
  
  return deletedCount
}

function rateLimitInMemory(
  identifier: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();

  // Clean up expired entries on every request (Edge Runtime compatible)
  const expiredCleaned = cleanupExpiredEntries();
  const sizeCleaned = enforceStoreSizeLimit();
  
  if (expiredCleaned > 0 || sizeCleaned > 0) {
    console.log(`[RateLimit] Cleaned up ${expiredCleaned} expired, ${sizeCleaned} size-limit entries`);
  }

  const current = rateLimitStore.get(identifier);
  
  if (!current || current.resetTime < now) {
    // First request or window expired
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    });
    return { 
      success: true, 
      remaining: limit - 1,
      limit,
      retryAfter: undefined
    };
  }

  if (current.count >= limit) {
    return { 
      success: false, 
      remaining: 0,
      reset: current.resetTime,
      limit,
      retryAfter: Math.ceil((current.resetTime - now) / 1000)
    };
  }

  current.count++;
  return { 
    success: true, 
    remaining: limit - current.count,
    limit,
    retryAfter: undefined
  };
}

export function getClientIdentifier(request: NextRequest): string {
  // Try to get real IP from various headers
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip'); // Cloudflare

  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  if (realIp) {
    return realIp;
  }

  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Fallback
  return 'unknown';
}

export function getUserAgent(request: NextRequest): string {
  return request.headers.get('user-agent') || 'unknown';
}

export async function getServerSideIdentifier(): Promise<string> {
  try {
    const headersList = await headers();
    const forwardedFor = headersList.get('x-forwarded-for');
    const realIp = headersList.get('x-real-ip');
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }

    if (realIp) {
      return realIp;
    }

    return 'server';
  } catch {
    return 'server';
  }
}
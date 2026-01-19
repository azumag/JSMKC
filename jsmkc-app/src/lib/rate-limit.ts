import { NextRequest } from 'next/server';
import { headers } from 'next/headers';

interface RateLimitResult {
  success: boolean;
  remaining?: number;
  reset?: number;
  limit?: number;
  retryAfter?: number;
}

// Rate limit configurations
const rateLimitConfigs = {
  scoreInput: { limit: 20, windowMs: 60 * 1000 },      // 20 requests per minute
  polling: { limit: 12, windowMs: 60 * 1000 },         // 12 requests per minute
  tokenValidation: { limit: 10, windowMs: 60 * 1000 }, // 10 requests per minute
  general: { limit: 10, windowMs: 60 * 1000 },         // 10 requests per minute
};

export async function checkRateLimit(
  type: keyof typeof rateLimitConfigs,
  identifier: string
) {
  const config = rateLimitConfigs[type] || rateLimitConfigs.general;
  return rateLimitInMemory(identifier, config.limit, config.windowMs);
}

export async function rateLimit(
  identifier: string,
  limit: number = 10,
  windowMs: number = 60 * 1000 // 1 minute
): Promise<RateLimitResult> {
  return rateLimitInMemory(identifier, limit, windowMs);
}

// In-memory rate limiting store
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
  // Optimization: maybe don't do this on EVERY request if high traffic, 
  // but for this scale it's fine and ensures memory safety.
  const expiredCleaned = cleanupExpiredEntries();
  const sizeCleaned = enforceStoreSizeLimit();

  if (expiredCleaned > 0 || sizeCleaned > 0) {
    // console.log(`[RateLimit] Cleaned up ${expiredCleaned} expired, ${sizeCleaned} size-limit entries`);
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
import { NextRequest } from 'next/server';
import { headers } from 'next/headers';

interface RateLimitResult {
  success: boolean;
  remaining?: number;
  reset?: number;
}

// In-memory rate limiting for development
// In production, use Redis or similar
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export async function rateLimit(
  identifier: string,
  limit: number = 10,
  windowMs: number = 60 * 1000 // 1 minute
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Clean up expired entries
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }

  const current = rateLimitStore.get(identifier);
  
  if (!current || current.resetTime < now) {
    // First request or window expired
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    });
    return { success: true, remaining: limit - 1 };
  }

  if (current.count >= limit) {
    return { 
      success: false, 
      remaining: 0,
      reset: current.resetTime 
    };
  }

  current.count++;
  return { 
    success: true, 
    remaining: limit - current.count 
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
    const userAgent = headersList.get('user-agent');

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
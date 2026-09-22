/**
 * Request Utilities
 *
 * Provides helper functions for extracting client information from HTTP requests.
 * These utilities are used primarily for audit logging and security monitoring.
 *
 * Functions:
 * - getClientIdentifier: Extracts client IP address from various headers
 * - getUserAgent: Extracts the User-Agent header string
 *
 * Client identification strategy (in priority order):
 * 1. cf-connecting-ip header (Cloudflare - trusted, set by CDN)
 * 2. x-real-ip header (Nginx convention - trusted within internal network)
 * 3. x-forwarded-for header (untrusted - can be spoofed by clients)
 * 4. 'unknown' fallback (should not happen in production)
 *
 * Usage:
 *   import { getUserAgent, getClientIdentifier } from '@/lib/request-utils';
 *   const clientIp = getClientIdentifier(request);
 *   const userAgent = getUserAgent(request);
 */

import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { createLogger } from '@/lib/logger';

/** Logger scoped to request utilities */
const logger = createLogger('request-utils');

const SAFE_ERROR_NAMES = new Set([
  'Error',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
]);

function normalizeIdentifierHeader(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function getForwardedClientIdentifier(value: string | null): string | null {
  if (!value) return null;
  return normalizeIdentifierHeader(value.split(',')[0] ?? null);
}

function getSafeErrorName(error: unknown): string {
  if (!(error instanceof Error)) return 'UnknownError';
  return SAFE_ERROR_NAMES.has(error.name) ? error.name : 'UnknownError';
}

// ============================================================
// Client Identification
// ============================================================

/**
 * Extracts the client IP address from a NextRequest object.
 *
 * Checks multiple headers in priority order to support various
 * deployment configurations:
 * 1. cf-connecting-ip: Cloudflare-specific header set by the trusted CDN/proxy
 * 2. x-real-ip: Reverse-proxy header trusted within the internal network
 * 3. x-forwarded-for: Fallback proxy header that can be spoofed by clients
 *
 * Blank/whitespace-only values are treated as absent. For x-forwarded-for,
 * only the first element is considered; an empty first element fails closed
 * instead of trusting a later proxy-added value.
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
 *     // Use clientIp for audit logging or rate limiting
 *   }
 */
export function getClientIdentifier(request: NextRequest): string {
  // cf-connecting-ip is set by Cloudflare's CDN/proxy and is trustworthy
  const cfIp = normalizeIdentifierHeader(request.headers.get('cf-connecting-ip'));
  if (cfIp) {
    return cfIp;
  }

  // x-real-ip is set by Nginx and some other reverse proxies
  // Only trustworthy when request comes from known internal network
  const realIp = normalizeIdentifierHeader(request.headers.get('x-real-ip'));
  if (realIp) {
    return realIp;
  }

  // x-forwarded-for can be spoofed by clients - use as last resort
  // Extract only the first IP (original client) and trim whitespace
  const forwardedIp = getForwardedClientIdentifier(request.headers.get('x-forwarded-for'));
  if (forwardedIp) {
    return forwardedIp;
  }

  // Fallback when no identifying header is present.
  // This should only happen in development or misconfigured deployments.
  return 'unknown';
}

/**
 * Extracts the User-Agent string from a NextRequest object.
 *
 * Used for audit logging to track which browser/client made the request.
 * Leading/trailing whitespace is removed, and a missing or whitespace-only
 * header is normalized to 'unknown' so audit rows never store a blank agent.
 *
 * @param request - The NextRequest object from the API route handler
 * @returns The normalized User-Agent string
 */
export function getUserAgent(request: NextRequest): string {
  return normalizeIdentifierHeader(request.headers.get('user-agent')) ?? 'unknown';
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

    // Same priority order as getClientIdentifier:
    // cf-connecting-ip (trusted) > x-real-ip (internal) > x-forwarded-for (untrusted)
    const cfIp = normalizeIdentifierHeader(headersList.get('cf-connecting-ip'));
    if (cfIp) {
      return cfIp;
    }

    const realIp = normalizeIdentifierHeader(headersList.get('x-real-ip'));
    if (realIp) {
      return realIp;
    }

    const forwardedIp = getForwardedClientIdentifier(headersList.get('x-forwarded-for'));
    if (forwardedIp) {
      return forwardedIp;
    }

    return 'unknown';
  } catch (error) {
    // headers() can throw if called outside a request context
    // (e.g., during static generation). Return 'unknown' to be safe.
    // Do not persist raw error messages or arbitrary custom error names here:
    // framework/runtime errors can include request data or internal details that
    // are irrelevant to this low-severity diagnostic path.
    logger.debug('Failed to get server-side identifier', {
      errorName: getSafeErrorName(error),
    });
    return 'unknown';
  }
}

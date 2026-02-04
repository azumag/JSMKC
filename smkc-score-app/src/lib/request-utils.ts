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
 * 1. x-forwarded-for header (behind reverse proxy/load balancer)
 * 2. x-real-ip header (Nginx convention)
 * 3. cf-connecting-ip header (Cloudflare)
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
 *     // Use clientIp for audit logging or rate limiting
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

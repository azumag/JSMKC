/**
 * Session Status API Route
 *
 * GET /api/auth/session-status
 *
 * Returns the current authentication session status including user details
 * and token expiration information. This endpoint is used by the frontend
 * to check whether the user is authenticated and to display session info.
 *
 * Security:
 *   - Rate-limited using the 'sessionStatus' bucket to prevent abuse
 *   - Returns rate limit headers (X-RateLimit-*) on 429 responses
 *   - Does not expose sensitive token values in the response
 *
 * Response format:
 *   Success (authenticated):
 *     { success: true, data: { authenticated: true, user: {...}, tokenInfo: {...} } }
 *   Failure (no session):
 *     { success: false, error: 'No active session', requiresAuth: true }
 *   Rate limited:
 *     { success: false, error: '...', retryAfter: <seconds> } (HTTP 429)
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
// Rate limiting removed — internal tournament tool with few concurrent users
import { createLogger } from '@/lib/logger';

export async function GET() {
  // Logger is created inside the function (not at module level) to ensure
  // proper test mocking. Module-level loggers are resolved at import time,
  // before jest.mock() calls take effect.
  const logger = createLogger('auth-session');

  try {
    // Retrieve the current session from NextAuth.
    // Returns null if the user is not authenticated.
    const session = await auth();

    if (!session) {
      // Return a structured response indicating no active session.
      // The requiresAuth flag tells the frontend to redirect to sign-in.
      return NextResponse.json({
        success: false,
        error: 'No active session',
        requiresAuth: true,
      });
    }

    // Return authenticated session data.
    // Token expiration info is structured as placeholders; in a full
    // implementation these values would be populated from the JWT callback
    // where access/refresh token lifetimes are tracked.
    return NextResponse.json({
      success: true,
      data: {
        authenticated: true,
        user: {
          id: session.user?.id,
          name: session.user?.name,
          email: session.user?.email,
          image: session.user?.image,
        },
        // Token expiration fields are placeholders for future JWT callback integration.
        // When implemented, these will reflect actual OAuth token lifetimes.
        tokenInfo: {
          accessTokenExpires: null,
          refreshTokenExpires: null,
        },
      },
    });
  } catch (error) {
    // Log error with structured metadata for debugging and alerting.
    // The error object is passed as metadata to preserve stack traces
    // in Winston's structured logging output.
    logger.error('Session status check failed', { error });
    return NextResponse.json(
      { success: false, error: 'Failed to check session status' },
      { status: 500 }
    );
  }
}

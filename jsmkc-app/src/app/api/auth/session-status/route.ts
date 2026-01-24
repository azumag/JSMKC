import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { checkRateLimit, getServerSideIdentifier } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';

/**
 * GET /api/auth/session-status
 * Returns the current session status with token expiration info
 */
export async function GET() {
  const logger = createLogger('auth-session');
  try {
    // Apply rate limiting
    const identifier = await getServerSideIdentifier();
    const rateLimitResult = await checkRateLimit('tokenValidation', identifier);
    
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Too many requests. Please try again later.',
          retryAfter: rateLimitResult.retryAfter
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': (rateLimitResult.limit ?? 0).toString(),
            'X-RateLimit-Remaining': (rateLimitResult.remaining ?? 0).toString(),
            'X-RateLimit-Reset': (rateLimitResult.reset ?? 0).toString(),
          }
        }
      );
    }

    const session = await auth();
    
    if (!session) {
      return NextResponse.json({
        success: false,
        error: 'No active session',
        requiresAuth: true,
      });
    }

    // For more detailed session info, we'd need to access the JWT callback data
    // This is a simplified version that works with NextAuth's session
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
        // Note: Access token info would need to be added to the session callback
        // This is a placeholder for the structure
        tokenInfo: {
          // These would be populated from the JWT callback
          accessTokenExpires: null, // Would be set from JWT callback
          refreshTokenExpires: null, // Would be set from JWT callback
        },
      },
    });
  } catch (error) {
    // Log error with structured metadata for better debugging and monitoring
    // The error object is passed as metadata to maintain error stack traces
    logger.error('Session status check failed', { error });
    return NextResponse.json(
      { success: false, error: 'Failed to check session status' },
      { status: 500 }
    );
  }
}
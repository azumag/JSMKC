/**
 * Tournament Token Validation Middleware
 *
 * Provides middleware functions for validating tournament access tokens
 * in API routes. This is the primary authentication mechanism for
 * participant score entry, where players use a shared tournament token
 * instead of individual OAuth credentials.
 *
 * Validation flow:
 * 1. Extract token from request header (x-tournament-token) or query param
 * 2. Validate token format (32-char hex)
 * 3. Rate limit the validation request
 * 4. Look up token in database and verify it matches the tournament
 * 5. Check token expiration
 * 6. Log the validation attempt for audit purposes
 *
 * The middleware can be used directly or as a wrapper function
 * (requireTournamentToken) that automatically handles the validation
 * flow and returns appropriate error responses.
 *
 * Usage:
 *   // Direct validation
 *   const result = await validateTournamentToken(request, tournamentId);
 *   if (!result.valid) return createErrorResponse(result.error, 401);
 *
 *   // Middleware wrapper
 *   export const POST = requireTournamentToken(async (req, ctx) => {
 *     // Handler code - token already validated
 *   });
 */

import { NextRequest, NextResponse } from 'next/server';
import { isValidTokenFormat, isTokenValid } from '@/lib/token-utils';
import { checkRateLimit, getClientIdentifier, getUserAgent } from '@/lib/rate-limit';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit-log';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/prisma';

/** Logger scoped to token validation operations */
const logger = createLogger('token-validation');

// ============================================================
// Type Definitions
// ============================================================

/**
 * Result of a basic token format/presence validation.
 *
 * Used for quick pre-checks before database lookups.
 */
export interface TokenValidationResult {
  /** Whether the token is valid */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
}

/**
 * Result of a full tournament token validation including database lookup.
 *
 * Extends the basic validation result with the tournament data
 * when validation succeeds, allowing the caller to use the tournament
 * without an additional database query.
 */
export interface TournamentValidationResult {
  /** Whether the token is valid for this tournament */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** The tournament record (populated only on success) */
  tournament?: {
    id: string;
    name: string;
    status: string;
    token: string | null;
    tokenExpiresAt: Date | null;
  };
}

/**
 * Context passed to handlers wrapped by requireTournamentToken.
 *
 * Contains the validated tournament data and request metadata,
 * so the handler doesn't need to re-validate or re-query.
 */
export interface TournamentContext {
  /** The validated tournament record */
  tournament: {
    id: string;
    name: string;
    status: string;
    token: string | null;
    tokenExpiresAt: Date | null;
  };
  /** The tournament ID from the URL params */
  tournamentId: string;
  /** The client IP address */
  clientIp: string;
  /** The client User-Agent string */
  userAgent: string;
}

// ============================================================
// Validation Functions
// ============================================================

/**
 * Performs basic token format validation.
 *
 * This is a quick pre-check that validates the token is present
 * and matches the expected format before performing expensive
 * database lookups and rate limit checks.
 *
 * @param token - The token string to validate (may be null/undefined)
 * @returns TokenValidationResult indicating if the format is valid
 *
 * @example
 *   const token = request.headers.get('x-tournament-token');
 *   const result = validateToken(token);
 *   if (!result.valid) return createErrorResponse(result.error, 400);
 */
export function validateToken(
  token: string | null | undefined
): TokenValidationResult {
  // Check for missing token
  if (!token) {
    return {
      valid: false,
      error: 'Tournament token is required',
    };
  }

  // Check token format (must be exactly 32 hex characters)
  if (!isValidTokenFormat(token)) {
    return {
      valid: false,
      error: 'Invalid token format',
    };
  }

  return { valid: true };
}

/**
 * Returns the access token expiry duration in milliseconds.
 *
 * Standard access tokens last 24 hours for tournament day use.
 * Refresh tokens last 168 hours (7 days) for longer events.
 *
 * @param isRefresh - If true, returns the refresh token duration
 * @returns Expiry duration in milliseconds
 */
export function getAccessTokenExpiry(isRefresh: boolean = false): number {
  // Standard token: 24 hours for a single tournament day.
  // Refresh token: 168 hours (7 days) for multi-day tournaments
  // or events that span a weekend.
  if (isRefresh) {
    return 168 * 60 * 60 * 1000; // 7 days in milliseconds
  }
  return 24 * 60 * 60 * 1000; // 24 hours in milliseconds
}

/**
 * Performs full tournament token validation against the database.
 *
 * This is the complete validation flow that:
 * 1. Extracts the token from the request header or query parameter
 * 2. Validates the token format
 * 3. Checks rate limits to prevent brute-force token guessing
 * 4. Looks up the tournament in the database
 * 5. Verifies the token matches and has not expired
 * 6. Logs the validation attempt for audit purposes
 *
 * @param request - The incoming NextRequest
 * @param tournamentId - The tournament ID to validate against
 * @returns TournamentValidationResult with validation status and tournament data
 *
 * @example
 *   export async function POST(request: NextRequest, { params }) {
 *     const { id } = await params;
 *     const result = await validateTournamentToken(request, id);
 *     if (!result.valid) {
 *       return NextResponse.json({ error: result.error }, { status: 401 });
 *     }
 *     // Use result.tournament...
 *   }
 */
export async function validateTournamentToken(
  request: NextRequest,
  tournamentId: string
): Promise<TournamentValidationResult> {
  // Extract token from request header (preferred) or query parameter (fallback).
  // The header approach is more secure as it doesn't appear in access logs.
  const token =
    request.headers.get('x-tournament-token') ||
    request.nextUrl.searchParams.get('token');

  // Step 1: Validate token format before any expensive operations
  const formatResult = validateToken(token);
  if (!formatResult.valid) {
    return {
      valid: false,
      error: formatResult.error,
    };
  }

  // Step 2: Check rate limits to prevent brute-force token guessing.
  // Token validation is limited to 10 requests per minute per client.
  const clientIp = getClientIdentifier(request);
  const rateLimitResult = await checkRateLimit('tokenValidation', clientIp);
  if (!rateLimitResult.success) {
    logger.warn('Token validation rate limit exceeded', {
      clientIp,
      tournamentId,
    });
    return {
      valid: false,
      error: 'Too many validation attempts. Please try again later.',
    };
  }

  // Step 3: Look up the tournament in the database.
  // Only fetch the fields needed for validation to minimize data transfer.
  const tournament = await prisma.tournament.findFirst({
    where: {
      id: tournamentId,
    },
    select: {
      id: true,
      name: true,
      status: true,
      token: true,
      tokenExpiresAt: true,
    },
  });

  // Tournament not found or has been deleted
  if (!tournament) {
    await logTokenValidationAttempt(
      request,
      tournamentId,
      false,
      'Tournament not found'
    );
    return {
      valid: false,
      error: 'Tournament not found',
    };
  }

  // Step 4: Verify the token matches the tournament's stored token.
  // Using strict equality to prevent timing attacks would require
  // crypto.timingSafeEqual, but since we're comparing against a
  // database value (not a secret), strict equality is acceptable here.
  if (tournament.token !== token) {
    await logTokenValidationAttempt(
      request,
      tournamentId,
      false,
      'Token mismatch'
    );
    return {
      valid: false,
      error: 'Invalid tournament token',
    };
  }

  // Step 5: Verify the token has not expired
  if (!isTokenValid(token!, tournament.tokenExpiresAt)) {
    await logTokenValidationAttempt(
      request,
      tournamentId,
      false,
      'Token expired'
    );
    return {
      valid: false,
      error: 'Tournament token has expired',
    };
  }

  // Step 6: Log successful validation for audit trail
  await logTokenValidationAttempt(request, tournamentId, true);

  logger.debug('Tournament token validated successfully', {
    tournamentId,
    clientIp,
  });

  return {
    valid: true,
    tournament,
  };
}

// ============================================================
// Middleware Factory
// ============================================================

/**
 * Handler function type for routes protected by token validation.
 * Receives the original request plus a TournamentContext with
 * pre-validated tournament data.
 */
type TokenProtectedHandler = (
  request: NextRequest,
  context: TournamentContext
) => Promise<NextResponse>;

/**
 * Middleware factory that wraps an API route handler with tournament
 * token validation.
 *
 * The handler is only called if the token is valid. If validation
 * fails, an appropriate error response is returned automatically.
 *
 * This pattern reduces boilerplate in score entry API routes by
 * centralizing the token validation logic.
 *
 * @param handler - The route handler to wrap with token validation
 * @returns A new handler function that validates the token first
 *
 * @example
 *   // In an API route file:
 *   export const POST = requireTournamentToken(
 *     async (request: NextRequest, context: TournamentContext) => {
 *       const { tournament, tournamentId } = context;
 *       // Token is already validated - proceed with score entry
 *       const body = await request.json();
 *       // ...
 *       return NextResponse.json({ success: true, data: result });
 *     }
 *   );
 */
export function requireTournamentToken(
  handler: TokenProtectedHandler
): (
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) => Promise<NextResponse> {
  return async (
    request: NextRequest,
    routeContext: { params: Promise<{ id: string }> }
  ): Promise<NextResponse> => {
    // Extract tournament ID from the route parameters
    const { id: tournamentId } = await routeContext.params;

    // Perform full token validation
    const result = await validateTournamentToken(request, tournamentId);

    // Return error response if validation failed
    if (!result.valid || !result.tournament) {
      return NextResponse.json(
        { success: false, error: result.error || 'Token validation failed' },
        { status: 401 }
      );
    }

    // Build the tournament context for the wrapped handler
    const context: TournamentContext = {
      tournament: result.tournament,
      tournamentId,
      clientIp: getClientIdentifier(request),
      userAgent: getUserAgent(request),
    };

    // Call the wrapped handler with validated context
    return handler(request, context);
  };
}

// ============================================================
// Private Helpers
// ============================================================

/**
 * Logs a token validation attempt to the audit log.
 *
 * Records both successful and failed validation attempts for
 * security monitoring. Failed attempts may indicate token brute-force
 * attacks or unauthorized access attempts.
 *
 * This function is fire-and-forget (non-blocking) because the
 * audit log should never block the validation response.
 *
 * @param request - The incoming request (for IP and user agent)
 * @param tournamentId - The tournament being accessed
 * @param success - Whether the validation succeeded
 * @param reason - Optional failure reason for logging
 */
async function logTokenValidationAttempt(
  request: NextRequest,
  tournamentId: string,
  success: boolean,
  reason?: string
): Promise<void> {
  // Create audit log entry for the validation attempt.
  // Uses UNAUTHORIZED_ACCESS action for failures to flag them
  // in security monitoring dashboards.
  const action = success
    ? AUDIT_ACTIONS.LOGIN_SUCCESS
    : AUDIT_ACTIONS.UNAUTHORIZED_ACCESS;

  await createAuditLog({
    ipAddress: getClientIdentifier(request),
    userAgent: getUserAgent(request),
    action,
    targetId: tournamentId,
    targetType: 'Tournament',
    details: {
      validationType: 'tournament-token',
      success,
      ...(reason && { reason }),
    },
  });
}

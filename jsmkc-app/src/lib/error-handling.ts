/**
 * Standardized Error and Success Response Utilities
 *
 * Provides consistent API response formatting across all JSMKC endpoints.
 * Every API route should use these functions to ensure uniform response
 * structure, proper HTTP status codes, and safe error messages.
 *
 * Response format follows the project standard:
 * - Success: { success: true, data: T, message?: string }
 * - Error:   { success: false, error: string, code?: string, details?: unknown }
 *
 * This module also provides specialized error handlers for common scenarios:
 * - Database errors (Prisma-specific with code mapping)
 * - Validation errors (400 Bad Request)
 * - Authentication errors (401 Unauthorized)
 * - Authorization errors (403 Forbidden)
 * - Rate limit errors (429 Too Many Requests)
 *
 * Usage:
 *   import { createSuccessResponse, handleDatabaseError } from '@/lib/error-handling';
 *   return createSuccessResponse(data, 'Players retrieved successfully');
 *   return handleDatabaseError(error, 'player-create');
 */

import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { createLogger } from '@/lib/logger';
import { sanitizeDatabaseError } from '@/lib/sanitize-error';

/** Logger for error handling operations */
const logger = createLogger('error-handling');

// ============================================================
// Response Type Interfaces
// ============================================================

/**
 * Standard error response shape returned by all API error handlers.
 *
 * - success: Always false for error responses
 * - error: User-friendly error message safe for client display
 * - code: Optional machine-readable error code (e.g., 'P2002', 'RATE_LIMIT')
 * - details: Optional additional information for debugging
 */
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: unknown;
}

/**
 * Standard success response shape returned by all API success handlers.
 *
 * Generic type T represents the data payload, ensuring type safety
 * between the API handler and the consuming client code.
 *
 * - success: Always true for success responses
 * - data: The response payload of type T
 * - message: Optional human-readable success message
 */
export interface SuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

// ============================================================
// Response Factory Functions
// ============================================================

/**
 * Creates a standardized error response as a NextResponse object.
 *
 * This is the base function used by all specialized error handlers.
 * It ensures consistent error response format and proper HTTP status codes.
 *
 * @param message - User-friendly error message (displayed to end users)
 * @param status - HTTP status code (400, 401, 403, 404, 409, 429, 500)
 * @param code - Optional machine-readable error code for client handling
 * @param details - Optional additional error context for debugging
 * @returns NextResponse with the error body and appropriate status code
 *
 * @example
 *   return createErrorResponse('Player not found', 404, 'NOT_FOUND');
 */
export function createErrorResponse(
  message: string,
  status: number,
  code?: string,
  details?: unknown
): NextResponse {
  // Construct the error response body following project standard format
  const body: ErrorResponse = {
    success: false,
    error: message,
    // Only include optional fields when they have values
    // to keep response payloads minimal
    ...(code && { code }),
    ...(details !== undefined && { details }),
  };

  // Log all error responses for server-side diagnostics.
  // The status code and message are safe to log since they are
  // already sanitized by this point.
  logger.warn('Error response created', {
    status,
    code,
    message,
  });

  return NextResponse.json(body, { status });
}

/**
 * Creates a standardized success response as a NextResponse object.
 *
 * Always returns HTTP 200 with the data payload wrapped in the
 * standard success response format.
 *
 * @template T - The type of the data payload
 * @param data - The response data payload
 * @param message - Optional human-readable success message
 * @returns NextResponse with the success body and 200 status
 *
 * @example
 *   const players = await prisma.player.findMany();
 *   return createSuccessResponse(players, 'Players retrieved');
 */
export function createSuccessResponse<T>(
  data: T,
  message?: string
): NextResponse {
  // Construct success response body following project standard format
  const body: SuccessResponse<T> = {
    success: true,
    data,
    // Only include message when provided to keep responses clean
    ...(message && { message }),
  };

  return NextResponse.json(body);
}

// ============================================================
// Specialized Error Handlers
// ============================================================

/**
 * Handles Prisma database errors with specific status code mapping.
 *
 * Maps Prisma error codes to appropriate HTTP status codes and
 * user-friendly messages. This prevents database implementation
 * details from leaking to API consumers.
 *
 * Prisma error code mapping:
 * - P2002 (Unique constraint) -> 409 Conflict
 * - P2025 (Record not found)  -> 404 Not Found
 * - P2003 (Foreign key)       -> 400 Bad Request
 * - P2024 (Connection timeout)-> 503 Service Unavailable
 * - Other known errors        -> 400 Bad Request
 * - Unknown errors            -> 500 Internal Server Error
 *
 * @param error - The caught error (may or may not be a Prisma error)
 * @param context - Description of the operation for logging (e.g., 'player-create')
 * @returns NextResponse with appropriate error status and message
 *
 * @example
 *   try {
 *     await prisma.player.create({ data: playerData });
 *   } catch (error) {
 *     return handleDatabaseError(error, 'player-create');
 *   }
 */
export function handleDatabaseError(
  error: unknown,
  context: string
): NextResponse {
  // Log the full error internally for debugging purposes.
  // The context parameter helps identify which operation failed
  // when reviewing server logs.
  logger.error('Database error occurred', {
    context,
    error: error instanceof Error ? error.message : String(error),
  });

  // Handle Prisma-specific known request errors with code-based mapping.
  // These errors have well-defined codes that map to specific HTTP statuses.
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        // Unique constraint violation: the record already exists.
        // Common when creating players with duplicate nicknames
        // or tournaments with conflicting unique fields.
        const sanitizedMessage = sanitizeDatabaseError(error, context);
        return createErrorResponse(
          sanitizedMessage,
          409,
          'CONFLICT'
        );
      }

      case 'P2025': {
        // Record not found for update/delete operations.
        // The requested resource does not exist in the database.
        const sanitizedMessage = sanitizeDatabaseError(error, context);
        return createErrorResponse(
          sanitizedMessage,
          404,
          'NOT_FOUND'
        );
      }

      case 'P2003': {
        // Foreign key constraint failure: referenced record does not exist.
        // Common when creating matches with invalid player IDs.
        const sanitizedMessage = sanitizeDatabaseError(error, context);
        return createErrorResponse(
          sanitizedMessage,
          400,
          'FOREIGN_KEY_ERROR'
        );
      }

      case 'P2024': {
        // Connection pool timeout: the database is overloaded or unavailable.
        // Sanitize to prevent leaking connection pool configuration.
        return createErrorResponse(
          'Database temporarily unavailable. Please try again later.',
          503,
          'SERVICE_UNAVAILABLE'
        );
      }

      default: {
        // Other Prisma known errors are treated as bad requests.
        // The error message is sanitized to remove any database details.
        const sanitizedMessage = sanitizeDatabaseError(error, context);
        return createErrorResponse(
          sanitizedMessage,
          400,
          error.code
        );
      }
    }
  }

  // Handle Prisma validation errors (invalid query structure)
  if (error instanceof Prisma.PrismaClientValidationError) {
    return createErrorResponse(
      'Invalid database query parameters',
      400,
      'VALIDATION_ERROR'
    );
  }

  // Handle non-Prisma errors as generic internal server errors.
  // The error message is sanitized to prevent any information leakage.
  const sanitizedMessage = sanitizeDatabaseError(error, context);
  return createErrorResponse(
    sanitizedMessage || 'An unexpected error occurred',
    500,
    'INTERNAL_ERROR'
  );
}

/**
 * Creates a validation error response (HTTP 400 Bad Request).
 *
 * Used when request data fails schema validation, has missing required
 * fields, or contains invalid values.
 *
 * @param message - Description of the validation failure
 * @param field - Optional name of the specific field that failed validation
 * @returns NextResponse with 400 status and validation error details
 *
 * @example
 *   if (!body.name) {
 *     return handleValidationError('Name is required', 'name');
 *   }
 */
export function handleValidationError(
  message: string,
  field?: string
): NextResponse {
  return createErrorResponse(
    message,
    400,
    'VALIDATION_ERROR',
    // Include the field name as detail so clients can highlight
    // the specific input that needs correction
    field ? { field } : undefined
  );
}

/**
 * Creates an authentication error response (HTTP 401 Unauthorized).
 *
 * Used when a request lacks valid authentication credentials.
 * The generic default message prevents attackers from distinguishing
 * between "no credentials" and "invalid credentials" scenarios.
 *
 * @param message - Optional custom authentication error message
 * @returns NextResponse with 401 status
 *
 * @example
 *   const session = await auth();
 *   if (!session) {
 *     return handleAuthError();
 *   }
 */
export function handleAuthError(
  message: string = 'Authentication required'
): NextResponse {
  return createErrorResponse(
    message,
    401,
    'UNAUTHORIZED'
  );
}

/**
 * Creates an authorization error response (HTTP 403 Forbidden).
 *
 * Used when a user is authenticated but lacks permission for the
 * requested operation. Distinguished from 401 (not authenticated)
 * to help clients determine if re-authentication might help.
 *
 * @param message - Optional custom authorization error message
 * @returns NextResponse with 403 status
 *
 * @example
 *   if (session.user.role !== 'admin') {
 *     return handleAuthzError('Admin access required');
 *   }
 */
export function handleAuthzError(
  message: string = 'Access denied'
): NextResponse {
  return createErrorResponse(
    message,
    403,
    'FORBIDDEN'
  );
}

/**
 * Creates a rate limit error response (HTTP 429 Too Many Requests).
 *
 * Includes the standard Retry-After header to inform clients when
 * they can retry the request. This follows RFC 6585 and helps
 * well-behaved clients implement proper backoff strategies.
 *
 * @param retryAfter - Optional number of seconds until the client can retry
 * @returns NextResponse with 429 status and Retry-After header
 *
 * @example
 *   const rateLimitResult = await checkRateLimit('scoreInput', clientIp);
 *   if (!rateLimitResult.success) {
 *     return handleRateLimitError(60); // retry after 60 seconds
 *   }
 */
export function handleRateLimitError(
  retryAfter?: number
): NextResponse {
  // Create the base error response with 429 status
  const response = createErrorResponse(
    'Too many requests. Please try again later.',
    429,
    'RATE_LIMIT_EXCEEDED'
  );

  // Set the Retry-After header if a retry interval is specified.
  // This is a standard HTTP header (RFC 6585) that tells clients
  // how long to wait before making another request.
  if (retryAfter) {
    response.headers.set('Retry-After', String(retryAfter));
  }

  return response;
}

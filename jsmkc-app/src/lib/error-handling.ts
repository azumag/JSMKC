import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

/**
 * Standardized error response interface
 */
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: unknown;
}

/**
 * Standardized success response interface
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

/**
 * Create a standardized error response
 * @param message - Error message
 * @param status - HTTP status code
 * @param code - Optional error code
 * @param details - Optional error details
 * @returns NextResponse with standardized error format
 */
export function createErrorResponse(
  message: string,
  status: number,
  code?: string,
  details?: unknown
): NextResponse<ErrorResponse> {
  const response: ErrorResponse = {
    success: false,
    error: message,
  };

  if (code) {
    response.code = code;
  }

  if (details) {
    response.details = details;
  }

  return NextResponse.json(response, { status });
}

/**
 * Create a standardized success response
 * @param data - Response data
 * @param message - Optional success message
 * @returns NextResponse with standardized success format
 */
export function createSuccessResponse<T>(
  data: T,
  message?: string
): NextResponse<SuccessResponse<T>> {
  const response: SuccessResponse<T> = {
    success: true,
    data,
  };

  if (message) {
    response.message = message;
  }

  return NextResponse.json(response);
}

/**
 * Handle database errors with appropriate status codes
 * @param error - Error object
 * @param context - Context description for logging
 * @returns NextResponse with appropriate error response
 */
export function handleDatabaseError(
  error: unknown,
  context: string
): NextResponse<ErrorResponse> {
  console.error(`Database error in ${context}:`, error);

  // Prisma initialization errors (502)
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return createErrorResponse(
      'Database connection error',
      502,
      'DATABASE_CONNECTION_ERROR'
    );
  }



  // Prisma known request errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return createErrorResponse(
          'Resource already exists',
          409,
          'RESOURCE_CONFLICT'
        );
      case 'P2025':
        return createErrorResponse(
          'Resource not found',
          404,
          'RESOURCE_NOT_FOUND'
        );
      default:
        return createErrorResponse(
          'Database request error',
          400,
          'DATABASE_REQUEST_ERROR',
          { code: error.code }
        );
    }
  }

  // Generic database errors (500)
  return createErrorResponse(
    'Internal server error',
    500,
    'INTERNAL_SERVER_ERROR'
  );
}

/**
 * Handle validation errors
 * @param message - Validation error message
 * @param field - Optional field name that caused the error
 * @returns NextResponse with validation error
 */
export function handleValidationError(
  message: string,
  field?: string
): NextResponse<ErrorResponse> {
  return createErrorResponse(
    message,
    400,
    'VALIDATION_ERROR',
    field ? { field } : undefined
  );
}

/**
 * Handle authentication errors
 * @param message - Authentication error message
 * @returns NextResponse with authentication error
 */
export function handleAuthError(
  message: string = 'Authentication required'
): NextResponse<ErrorResponse> {
  return createErrorResponse(
    message,
    401,
    'AUTHENTICATION_ERROR'
  );
}

/**
 * Handle authorization errors
 * @param message - Authorization error message
 * @returns NextResponse with authorization error
 */
export function handleAuthzError(
  message: string = 'Access denied'
): NextResponse<ErrorResponse> {
  return createErrorResponse(
    message,
    403,
    'AUTHORIZATION_ERROR'
  );
}

/**
 * Handle rate limit errors
 * @param retryAfter - Optional retry after seconds
 * @returns NextResponse with rate limit error
 */
export function handleRateLimitError(
  retryAfter?: number
): NextResponse<ErrorResponse> {
  const headers: Record<string, string> = {};
  if (retryAfter) {
    headers['Retry-After'] = retryAfter.toString();
  }

  return NextResponse.json(
    {
      success: false,
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
    {
      status: 429,
      headers,
    }
  );
}
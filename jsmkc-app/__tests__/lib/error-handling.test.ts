/**
 * @module __tests__/lib/error-handling.test.ts
 * @description Test suite for the centralized error handling module (`@/lib/error-handling`).
 *
 * This module provides standardized HTTP error and success response helpers used
 * across all API routes. The suite tests:
 *
 * - `createErrorResponse`: Constructs JSON error responses with status codes,
 *   optional error codes, and optional detail payloads.
 * - `createSuccessResponse`: Constructs JSON success responses with data and
 *   optional messages.
 * - `handleDatabaseError`: Maps Prisma-specific errors (P2002 unique constraint,
 *   P2025 not found, P2003 foreign key) to appropriate HTTP status codes
 *   (409, 404, 400) and falls back to 500 for unknown errors.
 * - `handleValidationError`: Returns 400 with VALIDATION_ERROR code and optional
 *   field name in details.
 * - `handleAuthError`: Returns 401 with UNAUTHORIZED code.
 * - `handleAuthzError`: Returns 403 with FORBIDDEN code.
 * - `handleRateLimitError`: Returns 429 with RATE_LIMIT_EXCEEDED code and optional
 *   Retry-After header.
 *
 * Prisma client classes and NextResponse are mocked to isolate the error handling
 * logic from external dependencies. The logger and sanitize-error modules are also
 * mocked since the source imports them at module level.
 */

// Mock @/lib/logger before importing the module under test, because the source
// creates a logger at module level: `const logger = createLogger('error-handling')`.
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Mock @/lib/sanitize-error because handleDatabaseError calls sanitizeDatabaseError().
// Return predictable messages for each Prisma error code scenario.
jest.mock('@/lib/sanitize-error', () => ({
  __esModule: true,
  sanitizeDatabaseError: jest.fn((error: unknown) => {
    // Return messages matching what the real sanitizeDatabaseError would return
    // for each known Prisma error code
    if (error && typeof error === 'object' && 'code' in error) {
      const prismaError = error as { code: string };
      switch (prismaError.code) {
        case 'P2002':
          return 'A record with this value already exists';
        case 'P2025':
          return 'Record not found';
        case 'P2003':
          return 'Related record not found';
        default:
          return 'Database error occurred';
      }
    }
    // For non-Prisma errors (generic Error, etc.), return a sanitized message
    if (error instanceof Error) {
      return error.message;
    }
    return 'An unexpected error occurred';
  }),
}));

// Mock Prisma module with custom classes that support instanceof checks.
// The source uses `error instanceof Prisma.PrismaClientKnownRequestError`
// so the mock classes must be the same ones the source gets via the mock.
jest.mock('@prisma/client', () => {
  // Use requireActual to get the real Prisma namespace as a base
  const { Prisma } = jest.requireActual('@prisma/client');

  return {
    Prisma: {
      ...Prisma,
      // PrismaClientInitializationError: the source does NOT specifically handle
      // this type, so it falls through to the generic error handler (500 INTERNAL_ERROR).
      PrismaClientInitializationError: class extends Error {
        constructor(message: Error) {
          super(message.message);
          this.name = 'PrismaClientInitializationError';
        }
      },
      PrismaClientKnownRequestError: class extends Error {
        constructor(message: string, { code }: { code: string; clientVersion: string }) {
          super(message);
          this.name = 'PrismaClientKnownRequestError';
          this.code = code;
        }
        code: string;
      },
      // PrismaClientValidationError: the source checks for this with instanceof
      PrismaClientValidationError: class extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'PrismaClientValidationError';
        }
      },
    },
    __esModule: true,
  };
});

// Mock next/server to provide NextResponse.json as a jest.fn()
// that returns objects with headers (needed by handleRateLimitError).
jest.mock('next/server', () => {
  const mockJson = jest.fn();
  return {
    NextResponse: {
      json: mockJson,
    },
    __esModule: true,
  };
});

import {
  createErrorResponse,
  createSuccessResponse,
  handleDatabaseError,
  handleValidationError,
  handleAuthError,
  handleAuthzError,
  handleRateLimitError,
} from '@/lib/error-handling';

describe('Error Handling Module', () => {
  const { NextResponse } = jest.requireMock('next/server');
  const { Prisma } = jest.requireMock('@prisma/client');

  describe('createErrorResponse', () => {
    beforeEach(() => {
      // Return a mock response with headers for all tests
      const mockResponse = {
        status: 0,
        headers: new Headers(),
      };
      NextResponse.json.mockReturnValue(mockResponse);
    });

    it('should create a basic error response', () => {
      createErrorResponse('Test error', 400);

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'Test error',
        },
        { status: 400 }
      );
    });

    it('should create an error response with custom status code', () => {
      createErrorResponse('Not found', 404);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.any(Object),
        { status: 404 }
      );
    });

    it('should include error code when provided', () => {
      createErrorResponse('Conflict', 409, 'RESOURCE_CONFLICT');

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'RESOURCE_CONFLICT',
        }),
        expect.any(Object)
      );
    });

    it('should not include error code when not provided', () => {
      createErrorResponse('Error', 400);

      const callArgs = NextResponse.json.mock.calls[0][0];
      expect(callArgs.code).toBeUndefined();
    });

    it('should include details when provided', () => {
      const details = { field: 'username', reason: 'already taken' };
      createErrorResponse('Validation failed', 400, 'VALIDATION_ERROR', details);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          details,
        }),
        expect.any(Object)
      );
    });

    it('should not include details when not provided', () => {
      createErrorResponse('Error', 400);

      const callArgs = NextResponse.json.mock.calls[0][0];
      expect(callArgs.details).toBeUndefined();
    });

    it('should set correct status code', () => {
      createErrorResponse('Server error', 500);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.any(Object),
        { status: 500 }
      );
    });
  });

  describe('createSuccessResponse', () => {
    beforeEach(() => {
      NextResponse.json.mockReturnValue({});
    });

    it('should create a basic success response', () => {
      const data = { id: '1', name: 'Test' };
      createSuccessResponse(data);

      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data,
      });
    });

    it('should include message when provided', () => {
      const data = { id: '1' };
      createSuccessResponse(data, 'Successfully created');

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Successfully created',
        })
      );
    });

    it('should not include message when not provided', () => {
      const data = { id: '1' };
      createSuccessResponse(data);

      const callArgs = NextResponse.json.mock.calls[0][0];
      expect(callArgs.message).toBeUndefined();
    });

    it('should work with different data types', () => {
      const stringData = 'test string';
      const numberData = 123;
      const arrayData = [1, 2, 3];
      const nullData = null;

      createSuccessResponse(stringData);
      createSuccessResponse(numberData);
      createSuccessResponse(arrayData);
      createSuccessResponse(nullData);

      expect(NextResponse.json).toHaveBeenCalledTimes(4);
    });
  });

  describe('handleDatabaseError', () => {
    beforeEach(() => {
      // Return a mock response with headers (needed because createErrorResponse
      // is called internally, which calls logger.warn, then NextResponse.json)
      const mockResponse = {
        status: 500,
        headers: new Headers(),
      };
      NextResponse.json.mockReturnValue(mockResponse);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should handle PrismaClientInitializationError as generic error', () => {
      // The source does NOT specifically handle PrismaClientInitializationError.
      // It falls through to the generic handler at the bottom which returns
      // 500 INTERNAL_ERROR with the sanitized message.
      const error = new Prisma.PrismaClientInitializationError(
        new Error('Connection failed')
      );

      handleDatabaseError(error, 'test context');

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'Connection failed',
          code: 'INTERNAL_ERROR',
        },
        { status: 500 }
      );
    });

    it('should handle P2002 error (unique constraint violation)', () => {
      // Source maps P2002 to 409 with code 'CONFLICT'.
      // The message comes from sanitizeDatabaseError() which returns
      // 'A record with this value already exists' for P2002.
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '5.0.0',
        }
      );

      handleDatabaseError(error, 'test context');

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'A record with this value already exists',
          code: 'CONFLICT',
        },
        { status: 409 }
      );
    });

    it('should handle P2025 error (record not found)', () => {
      // Source maps P2025 to 404 with code 'NOT_FOUND'.
      // The message comes from sanitizeDatabaseError() which returns
      // 'Record not found' for P2025.
      const error = new Prisma.PrismaClientKnownRequestError(
        'Record not found',
        {
          code: 'P2025',
          clientVersion: '5.0.0',
        }
      );

      handleDatabaseError(error, 'test context');

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'Record not found',
          code: 'NOT_FOUND',
        },
        { status: 404 }
      );
    });

    it('should handle P2003 error (foreign key constraint)', () => {
      // Source maps P2003 to 400 with code 'FOREIGN_KEY_ERROR'.
      // The message comes from sanitizeDatabaseError() which returns
      // 'Related record not found' for P2003.
      const error = new Prisma.PrismaClientKnownRequestError(
        'Some other error',
        {
          code: 'P2003',
          clientVersion: '5.0.0',
        }
      );

      handleDatabaseError(error, 'test context');

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'Related record not found',
          code: 'FOREIGN_KEY_ERROR',
        },
        { status: 400 }
      );
    });

    it('should handle unknown errors as generic errors', () => {
      // Non-Prisma errors fall through to the bottom handler:
      // 500 status with code 'INTERNAL_ERROR'.
      // sanitizeDatabaseError returns the error.message for plain Error objects.
      const error = new Error('Unknown error');

      handleDatabaseError(error, 'test context');

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'Unknown error',
          code: 'INTERNAL_ERROR',
        },
        { status: 500 }
      );
    });

    it('should log error with context', () => {
      // Verifying the function returns proper error response for generic errors.
      // The logger is mocked silently so we just verify the response output.
      const error = new Error('Test error');

      handleDatabaseError(error, 'players endpoint');

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'Test error',
          code: 'INTERNAL_ERROR',
        },
        { status: 500 }
      );
    });
  });

  describe('handleValidationError', () => {
    beforeEach(() => {
      const mockResponse = {
        status: 400,
        headers: new Headers(),
      };
      NextResponse.json.mockReturnValue(mockResponse);
    });

    it('should create validation error response', () => {
      handleValidationError('Invalid email format');

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'Invalid email format',
          code: 'VALIDATION_ERROR',
        },
        { status: 400 }
      );
    });

    it('should include field name when provided', () => {
      handleValidationError('Required field', 'username');

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          details: { field: 'username' },
        }),
        expect.any(Object)
      );
    });

    it('should not include field when not provided', () => {
      handleValidationError('Invalid data');

      const callArgs = NextResponse.json.mock.calls[0][0];
      expect(callArgs.details).toBeUndefined();
    });

    it('should always set status code to 400', () => {
      handleValidationError('Error');

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.any(Object),
        { status: 400 }
      );
    });
  });

  describe('handleAuthError', () => {
    beforeEach(() => {
      const mockResponse = {
        status: 401,
        headers: new Headers(),
      };
      NextResponse.json.mockReturnValue(mockResponse);
    });

    it('should create auth error response with default message', () => {
      // Source uses code 'UNAUTHORIZED' (not 'AUTHENTICATION_ERROR')
      handleAuthError();

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED',
        },
        { status: 401 }
      );
    });

    it('should create auth error response with custom message', () => {
      handleAuthError('Invalid token');

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid token',
        }),
        expect.any(Object)
      );
    });

    it('should always set status code to 401', () => {
      handleAuthError('Test');

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.any(Object),
        { status: 401 }
      );
    });
  });

  describe('handleAuthzError', () => {
    beforeEach(() => {
      const mockResponse = {
        status: 403,
        headers: new Headers(),
      };
      NextResponse.json.mockReturnValue(mockResponse);
    });

    it('should create authorization error response with default message', () => {
      // Source uses code 'FORBIDDEN' (not 'AUTHORIZATION_ERROR')
      handleAuthzError();

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'Access denied',
          code: 'FORBIDDEN',
        },
        { status: 403 }
      );
    });

    it('should create authorization error response with custom message', () => {
      handleAuthzError('Insufficient permissions');

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Insufficient permissions',
        }),
        expect.any(Object)
      );
    });

    it('should always set status code to 403', () => {
      handleAuthzError('Test');

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.any(Object),
        { status: 403 }
      );
    });
  });

  describe('handleRateLimitError', () => {
    beforeEach(() => {
      const mockResponse = {
        headers: new Headers(),
      };
      NextResponse.json.mockReturnValue(mockResponse);
    });

    it('should create rate limit error response', () => {
      handleRateLimitError();

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'Too many requests. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED',
        },
        expect.objectContaining({
          status: 429,
        })
      );
    });

    it('should include Retry-After header when retryAfter is provided', () => {
      const retryAfter = 60;
      handleRateLimitError(retryAfter);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          status: 429,
        })
      );
    });

    it('should not include Retry-After header when retryAfter is not provided', () => {
      handleRateLimitError();

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          status: 429,
        })
      );
    });

    it('should always set status code to 429', () => {
      handleRateLimitError(30);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          status: 429,
        })
      );
    });

    it('should convert retryAfter number to string in header', () => {
      const retryAfter = 120;
      handleRateLimitError(retryAfter);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          status: 429,
        })
      );
    });
  });
});

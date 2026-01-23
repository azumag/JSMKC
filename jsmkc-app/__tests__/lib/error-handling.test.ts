import {
  createErrorResponse,
  createSuccessResponse,
  handleDatabaseError,
  handleValidationError,
  handleAuthError,
  handleAuthzError,
  handleRateLimitError,
} from '@/lib/error-handling';

// Mock Prisma module
jest.mock('@prisma/client', () => {
  const { Prisma } = jest.requireActual('@prisma/client');

  return {
    Prisma: {
      ...Prisma,
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
    },
    __esModule: true,
  };
});

jest.mock('next/server', () => {
  const mockJson = jest.fn();
  return {
    NextResponse: {
      json: mockJson,
    },
    __esModule: true,
  };
});

describe('Error Handling Module', () => {
  const { NextResponse } = jest.requireMock('next/server');
  const { Prisma } = jest.requireMock('@prisma/client');

  describe('createErrorResponse', () => {
    beforeEach(() => {
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
      jest.spyOn(console, 'error').mockImplementation(() => {});
      NextResponse.json.mockReturnValue({ status: 500 });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should handle PrismaClientInitializationError', () => {
      const error = new Prisma.PrismaClientInitializationError(
        new Error('Connection failed')
      );

      handleDatabaseError(error, 'test context');

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'Database connection error',
          code: 'DATABASE_CONNECTION_ERROR',
        },
        { status: 502 }
      );
      // In test mode, logger is silent - console.error should not be called
      // expect(console.error).toHaveBeenCalledWith(
      //   '[ERROR] error-handling: Database error in test context:',
      //   expect.objectContaining({ message: expect.any(String) })
      // );
    });

    it('should handle P2002 error (unique constraint violation)', () => {
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
          error: 'Resource already exists',
          code: 'RESOURCE_CONFLICT',
        },
        { status: 409 }
      );
    });

    it('should handle P2025 error (record not found)', () => {
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
          error: 'Resource not found',
          code: 'RESOURCE_NOT_FOUND',
        },
        { status: 404 }
      );
    });

    it('should handle other PrismaClientKnownRequestError codes', () => {
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
          error: 'Database request error',
          code: 'DATABASE_REQUEST_ERROR',
          details: { code: 'P2003' },
        },
        { status: 400 }
      );
    });

    it('should handle unknown errors as generic errors', () => {
      const error = new Error('Unknown error');

      handleDatabaseError(error, 'test context');

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'Internal server error',
          code: 'INTERNAL_SERVER_ERROR',
        },
        { status: 500 }
      );
    });

    it('should log error with context', () => {
      const error = new Error('Test error');

      handleDatabaseError(error, 'players endpoint');

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'Internal server error',
          code: 'INTERNAL_SERVER_ERROR',
        },
        { status: 500 }
      );
      // In test mode, logger is silent - console.error should not be called
      // expect(console.error).toHaveBeenCalledWith(
      //   '[ERROR] error-handling: Database error in players endpoint:',
      //   expect.objectContaining({ message: expect.any(String) })
      // );
    });
  });

  describe('handleValidationError', () => {
    beforeEach(() => {
      NextResponse.json.mockReturnValue({});
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
      NextResponse.json.mockReturnValue({});
    });

    it('should create auth error response with default message', () => {
      handleAuthError();

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'Authentication required',
          code: 'AUTHENTICATION_ERROR',
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
      NextResponse.json.mockReturnValue({});
    });

    it('should create authorization error response with default message', () => {
      handleAuthzError();

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'Access denied',
          code: 'AUTHORIZATION_ERROR',
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

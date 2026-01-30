// @ts-nocheck - This test file uses complex mock types for Next.js API routes

// IMPORTANT: jest.mock() calls use the global jest (not imported from @jest/globals)
// because babel-jest's hoisting plugin does not properly hoist jest.mock()
// when jest is imported from @jest/globals, causing mocks to not be applied.

// Logger mock returns a shared instance so tests can verify calls on the same object
jest.mock('@/lib/logger', () => {
  const mockLoggerInstance = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
  return {
    createLogger: jest.fn(() => mockLoggerInstance),
  };
});

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(),
  getServerSideIdentifier: jest.fn(),
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import * as sessionStatusRoute from '@/app/api/auth/session-status/route';

// Access mocks via requireMock to get references to the same mock functions
// that the route module uses (per CLAUDE.md mock pattern)
const rateLimitMock = jest.requireMock('@/lib/rate-limit') as {
  checkRateLimit: jest.Mock;
  getServerSideIdentifier: jest.Mock;
};

const loggerMock = jest.requireMock('@/lib/logger') as {
  createLogger: jest.Mock;
};

describe('GET /api/auth/session-status', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: rate limiting passes so non-rate-limit tests work correctly
    // Without this, checkRateLimit returns undefined and route throws TypeError
    rateLimitMock.checkRateLimit.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60000,
    });
    rateLimitMock.getServerSideIdentifier.mockResolvedValue('127.0.0.1');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Success Cases', () => {
    it('should return user session when authenticated', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'user@example.com',
        name: 'Test User',
      };

      (auth as jest.Mock).mockResolvedValue({
        user: mockUser,
        expires: '2025-01-01T00:00:00Z',
      });

      await sessionStatusRoute.GET(
        new NextRequest('http://localhost:3000/api/auth/session-status')
      );

      const callArgs = (NextResponse.json as jest.Mock).mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs[0].success).toBe(true);
      expect(callArgs[0].data.user).toEqual(mockUser);
    });

    it('should return null session when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await sessionStatusRoute.GET(
        new NextRequest('http://localhost:3000/api/auth/session-status')
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'No active session',
          requiresAuth: true,
        })
      );
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limit - 429 status', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'user@example.com',
        name: 'Test User',
        role: 'user',
      };

      (auth as jest.Mock).mockResolvedValue({
        user: mockUser,
        expires: '2025-01-01T00:00:00Z',
      });

      // Override default: rate limit exceeded
      rateLimitMock.checkRateLimit.mockResolvedValue({
        success: false,
        retryAfter: 60,
        limit: 100,
        remaining: 0,
        reset: Date.now() + 60000,
      });

      await sessionStatusRoute.GET(
        new NextRequest('http://localhost:3000/api/auth/session-status')
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Too many requests. Please try again later.',
          retryAfter: 60,
        }),
        expect.objectContaining({ status: 429 })
      );
    });

    it('should allow requests when rate limit not exceeded', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'user@example.com',
        name: 'Test User',
        role: 'user',
      };

      (auth as jest.Mock).mockResolvedValue({
        user: mockUser,
        expires: '2025-01-01T00:00:00Z',
      });

      await sessionStatusRoute.GET(
        new NextRequest('http://localhost:3000/api/auth/session-status')
      );

      const callArgs = (NextResponse.json as jest.Mock).mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs[0].success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (auth as jest.Mock).mockRejectedValue(new Error('Auth error'));

      await sessionStatusRoute.GET(
        new NextRequest('http://localhost:3000/api/auth/session-status')
      );

      // createLogger() returns the shared mockLoggerInstance defined in the factory
      // This is the same instance the route handler gets when it calls createLogger()
      const mockLogger = loggerMock.createLogger();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Session status check failed',
        expect.any(Object)
      );
      // Route returns { success: false, error: ... } on error
      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Failed to check session status' },
        { status: 500 }
      );
    });
  });
});

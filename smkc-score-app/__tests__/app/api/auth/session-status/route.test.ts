/**
 * @module Session Status Route Tests
 *
 * Test suite for the GET /api/auth/session-status endpoint.
 * This route checks the current user's authentication session status,
 * returning user data if authenticated or indicating no active session.
 *
 * Covers:
 * - Success cases: Returning user session data when authenticated, handling unauthenticated state
 * - Error handling: Graceful handling of database/auth errors with structured logging
 *
 * Uses the CLAUDE.md mock pattern with jest.requireMock() for accessing shared mock instances.
 */
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

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import * as sessionStatusRoute from '@/app/api/auth/session-status/route';

const loggerMock = jest.requireMock('@/lib/logger') as {
  createLogger: jest.Mock;
};

describe('GET /api/auth/session-status', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
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

      jest.mocked(auth).mockResolvedValue({
        user: mockUser,
        expires: '2025-01-01T00:00:00Z',
      });

      await sessionStatusRoute.GET(new NextRequest('http://localhost:3000/api/auth/session-status'));

      const callArgs = (NextResponse.json as jest.Mock).mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs[0].success).toBe(true);
      expect(callArgs[0].data.user).toEqual(mockUser);
    });

    it('should return null session when not authenticated', async () => {
      jest.mocked(auth).mockResolvedValue(null);

      await sessionStatusRoute.GET(new NextRequest('http://localhost:3000/api/auth/session-status'));

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'No active session',
          requiresAuth: true,
        }),
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      jest.mocked(auth).mockRejectedValue(new Error('Auth error'));

      await sessionStatusRoute.GET(new NextRequest('http://localhost:3000/api/auth/session-status'));

      // createLogger() returns the shared mockLoggerInstance defined in the factory
      // This is the same instance the route handler gets when it calls createLogger()
      const mockLogger = loggerMock.createLogger();
      expect(mockLogger.error).toHaveBeenCalledWith('Session status check failed', expect.any(Object));
      // Route returns { success: false, error: ... } on error
      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Failed to check session status' },
        { status: 500 },
      );
    });
  });
});

// @ts-nocheck - This test file uses complex mock types for Next.js API routes
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(),
  getServerSideIdentifier: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock('next/server', () => {
  const mockJson = jest.fn();
  return {
    NextResponse: {
      json: mockJson,
    },
    __esModule: true,
  };
});

import { auth } from '@/lib/auth';
import { checkRateLimit, getServerSideIdentifier } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';
import * as sessionStatusRoute from '@/app/api/auth/session-status/route';

const logger = createLogger('auth-session-test');

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
        role: 'admin',
      };

      (auth as jest.Mock).mockResolvedValue({
        user: mockUser,
        expires: '2025-01-01T00:00:00Z',
      });

      const callArgs = (NextResponse.json as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toBeDefined();
    });

    it('should return null session when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await sessionStatusRoute.GET(
        new NextRequest('http://localhost:3000/api/auth/session-status')
      );

      expect(NextResponse.json).toHaveBeenCalledWith(null);
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (checkRateLimit as any).mockResolvedValue({
        success: false,
        retryAfter: 60,
        limit: 100,
        remaining: 0,
        reset: Date.now() + 60000,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (getServerSideIdentifier as any).mockResolvedValue('127.0.0.1');

      await sessionStatusRoute.GET(
        new NextRequest('http://localhost:3000/api/auth/session-status')
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Too many requests. Please try again later.',
          retryAfter: 60,
          limit: 100,
          remaining: 0,
          reset: expect.any(String),
        }),
        { status: 429 }
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (checkRateLimit as any).mockResolvedValue({
        success: true,
        retryAfter: 60,
        limit: 100,
        remaining: 5,
        reset: Date.now() + 60000,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (getServerSideIdentifier as any).mockResolvedValue('127.0.0.1');

      await sessionStatusRoute.GET(
        new NextRequest('http://localhost:3000/api/auth/session-status')
      );

      const callArgs = (NextResponse.json as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toBeDefined();
      expect(callArgs[0].success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (auth as jest.Mock).mockRejectedValue(new Error('Auth error'));

      await sessionStatusRoute.GET(
        new NextRequest('http://localhost:3000/api/auth/session-status')
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Session status check failed',
        expect.any(Object)
      );
      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Failed to check session status' },
        { status: 500 }
      );
    });
  });
});

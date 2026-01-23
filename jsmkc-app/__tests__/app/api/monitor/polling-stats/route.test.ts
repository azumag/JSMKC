// @ts-nocheck - This test file uses complex mock types for Next.js API routes
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock dependencies
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
import * as pollingStatsRoute from '@/app/api/monitor/polling-stats/route';

const logger = createLogger('monitor-test');

// Mock functions with proper typing
const mockCheckRateLimit = checkRateLimit as any;
const mockGetServerSideIdentifier = getServerSideIdentifier as any;
const mockAuth = auth as any;

describe('GET /api/monitor/polling-stats', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    // Set up default mock behaviors
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1');
    mockAuth.mockResolvedValue({
      user: { id: 'admin-1' },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Rate Limiting', () => {
    it('should return 429 when rate limit exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue({
        success: false,
        retryAfter: 60,
        limit: 100,
        remaining: 0,
        reset: Date.now() + 60000,
      });
      mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1');

      await pollingStatsRoute.GET();

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Too many requests. Please try again later.',
          retryAfter: 60,
        }),
        expect.objectContaining({
          status: 429,
          headers: expect.objectContaining({
            'X-RateLimit-Limit': '100',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': expect.any(String),
          }),
        })
      );
    });

    it('should allow requests under rate limit', async () => {
      mockCheckRateLimit.mockResolvedValue({ success: true });
      mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1');
      mockAuth.mockResolvedValue({
        user: { id: 'user-1' },
      });

      await pollingStatsRoute.GET();

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        'polling',
        '127.0.0.1'
      );
    });
  });

  describe('Authorization', () => {
    it('should return 401 when not authenticated', async () => {
      mockCheckRateLimit.mockResolvedValue({ success: true });
      mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1');
      mockAuth.mockResolvedValue(null);

      await pollingStatsRoute.GET();

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Unauthorized',
        }),
        { status: 401 }
      );
    });

    it('should return 401 when authenticated but no user', async () => {
      mockCheckRateLimit.mockResolvedValue({ success: true });
      mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1');
      mockAuth.mockResolvedValue({});

      await pollingStatsRoute.GET();

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Unauthorized',
        }),
        { status: 401 }
      );
    });
  });

  describe('Success Cases', () => {
    it('should return polling statistics when authenticated', async () => {
      mockCheckRateLimit.mockResolvedValue({ success: true });
      mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1');
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1' },
      });

      await pollingStatsRoute.GET();

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            totalRequests: expect.any(Number),
            averageResponseTime: expect.any(Number),
            activeConnections: expect.any(Number),
            errorRate: expect.any(Number),
            rateLimitStats: expect.objectContaining({
              scoreInput: expect.any(Object),
              polling: expect.any(Object),
              tokenValidation: expect.any(Object),
            }),
            timePeriod: expect.objectContaining({
              start: expect.any(String),
              end: expect.any(String),
              duration: '1 hour',
            }),
            warnings: expect.any(Array),
          }),
        })
      );
    });

    it('should include statistics in expected format', async () => {
      mockCheckRateLimit.mockResolvedValue({ success: true });
      mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1');
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1' },
      });

      const response = await pollingStatsRoute.GET();

      expect(NextResponse.json).toHaveBeenCalled();
      const callArgs = (NextResponse.json as jest.Mock).mock.calls[0];
      const data = callArgs[0].data;

      expect(data.totalRequests).toBeGreaterThanOrEqual(0);
      expect(data.averageResponseTime).toBeGreaterThanOrEqual(0);
      expect(data.activeConnections).toBeGreaterThanOrEqual(0);
      expect(data.errorRate).toBeGreaterThanOrEqual(0);
      expect(data.rateLimitStats.scoreInput).toHaveProperty('total');
      expect(data.rateLimitStats.scoreInput).toHaveProperty('blocked');
      expect(data.rateLimitStats.scoreInput).toHaveProperty('allowed');
    });
  });

  describe('Error Handling', () => {
    it('should handle auth errors gracefully', async () => {
      mockCheckRateLimit.mockResolvedValue({ success: true });
      mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1');
      mockAuth.mockRejectedValue(new Error('Auth error'));

      await pollingStatsRoute.GET();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get polling stats',
        expect.any(Object)
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Failed to retrieve polling statistics',
        }),
        { status: 500 }
      );
    });

    it('should handle database errors gracefully', async () => {
      mockCheckRateLimit.mockResolvedValue({ success: true });
      mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1');
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1' },
      });

      // Mock one of the internal route methods to throw an error
      const originalGet = pollingStatsRoute.GET.bind(pollingStatsRoute);
      jest.spyOn(pollingStatsRoute, 'GET' as any).mockImplementationOnce(async () => {
        throw new Error('Database error');
      });

      await pollingStatsRoute.GET();

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Failed to retrieve polling statistics',
        }),
        { status: 500 }
      );
    });
  });
});

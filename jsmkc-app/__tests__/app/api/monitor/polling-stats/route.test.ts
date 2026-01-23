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
import * as pollingStatsRoute from '@/app/api/monitor/polling-stats/route';

const logger = createLogger('monitor-test');

type RateLimitResult = {
  success: boolean;
  retryAfter?: number;
  limit?: number;
  remaining?: number;
  reset?: number;
};

describe('GET /api/monitor/polling-stats', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Success Cases', () => {
    it('should return polling statistics', async () => {
      (checkRateLimit as jest.MockedFunction<typeof checkRateLimit>).mockResolvedValue({ success: true });
      (getServerSideIdentifier as jest.MockedFunction<typeof getServerSideIdentifier>).mockResolvedValue('127.0.0.1');
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      await pollingStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/monitor/polling-stats')
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          activeTournaments: expect.any(Number),
          activePlayers: expect.any(Number),
          totalMatches: expect.any(Number),
        })
      );
    });

    it('should return empty stats when no activity', async () => {
      (checkRateLimit as jest.MockedFunction<typeof checkRateLimit>).mockResolvedValue({ success: true });
      (getServerSideIdentifier as jest.MockedFunction<typeof getServerSideIdentifier>).mockResolvedValue('127.0.0.1');
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      await pollingStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/monitor/polling-stats')
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          activeTournaments: expect.any(Number),
          activePlayers: expect.any(Number),
          totalMatches: expect.any(Number),
        })
      );
    });
  });

  describe('Error Cases', () => {
    it('should return empty stats when no activity', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (checkRateLimit as any).mockResolvedValue({ success: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (getServerSideIdentifier as any).mockResolvedValue('127.0.0.1');
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      await pollingStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/monitor/polling-stats')
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          activeTournaments: 0,
          activePlayers: 0,
          totalMatches: 0,
        })
      );
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limit - 429 status', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      const rateLimitResult: RateLimitResult = {
        success: false,
        retryAfter: 60,
        limit: 100,
        remaining: 0,
        reset: Date.now() + 60000,
      };
      (checkRateLimit as jest.MockedFunction<typeof checkRateLimit>).mockResolvedValue(rateLimitResult);
      (getServerSideIdentifier as jest.MockedFunction<typeof getServerSideIdentifier>).mockResolvedValue('127.0.0.1');

      await pollingStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/monitor/polling-stats')
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Too many requests. Please try again later.',
        }),
        { status: 429 }
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (auth as jest.Mock).mockRejectedValue(new Error('Auth error'));

      await pollingStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/monitor/polling-stats')
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch polling stats',
        expect.any(Object)
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Failed to fetch polling stats' },
        { status: 500 }
      );
    });
  });
});

/**
 * @module Test Suite: GET /api/tournaments/[id]/ta/standings
 *
 * Tests for the Time Attack (TA) standings API route handler.
 * This endpoint provides admin-only access to TA standings with caching support
 * (ETag-based) for performance optimization.
 *
 * Test categories:
 * - Authorization: Verifies 403 responses for unauthenticated users and
 *   non-admin authenticated users. Admin role is required for standings access.
 * - Cache Handling: Tests cache hit (returns cached data with _cached flag),
 *   cache miss (fetches fresh data from DB), and cache expiration scenarios.
 *   Uses ETag headers and Cache-Control for HTTP caching.
 * - Success Cases: Validates proper data transformation including formatted time
 *   strings (e.g., '1:40' for 100000ms), null totalTime handling (displayed as '-'),
 *   and entries with totalTime = 0 (displayed as '0:00').
 * - Error Cases: Covers database errors (500 with logging) and cache set errors
 *   (graceful degradation - still returns data even if cache write fails).
 *
 * Dependencies mocked:
 * - @/lib/auth: OAuth session verification (GitHub/Google/Discord via NextAuth v5)
 * - @/lib/logger: Structured Winston logging for error tracking
 * - @/lib/standings-cache: ETag-based cache with TTL (get, set, isExpired, generateETag)
 * - next/server: NextResponse.json mock for response assertions
 * - @/lib/prisma: Database client for TTEntry queries with player includes
 */
// NOTE: Do NOT import from @jest/globals. Mock factories run with the global jest,
// so using the imported jest causes mock identity mismatches (see mock-debug2.test.ts).
import { NextRequest } from 'next/server';

// Mock dependencies


jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

// Mock standings-cache with all exported functions used by the source.
// Without this mock, the real module would be loaded and may cause test issues.
jest.mock('@/lib/standings-cache', () => ({
  get: jest.fn(),
  set: jest.fn(),
  isExpired: jest.fn(),
  generateETag: jest.fn(),
}));

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

jest.mock('next/server', () => {
  const mockJson = jest.fn();
  class MockNextRequest {
    constructor(url, init = {}) {
      this.url = url;
      this.method = init.method || 'GET';
      this._body = init.body;
      const h = init.headers || {};
      this.headers = {
        get: (key) => {
          if (h instanceof Headers) return h.get(key);
          if (h instanceof Map) return h.get(key);
          return h[key] || null;
        },
        forEach: (cb) => {
          if (h instanceof Headers) { h.forEach(cb); return; }
          Object.entries(h).forEach(([k, v]) => cb(v, k));
        },
      };
    }
    async json() {
      if (typeof this._body === 'string') return JSON.parse(this._body);
      return this._body;
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: mockJson,
    },
    __esModule: true,
  };
});

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import * as standingsRoute from '@/app/api/tournaments/[id]/ta/standings/route';

type StandingsCacheMock = {
  get: jest.Mock;
  set: jest.Mock;
  isExpired: jest.Mock;
  generateETag: jest.Mock;
};

const standingsCache = jest.requireMock('@/lib/standings-cache') as StandingsCacheMock;
const { get, set, isExpired, generateETag } = standingsCache;

// Logger mock reference for verifying error logging
const loggerMock = jest.requireMock('@/lib/logger') as {
  createLogger: jest.Mock;
};
// Pre-capture the logger instance for assertions.
// After clearAllMocks(), createLogger loses its return value, so we re-set it in beforeEach.
const loggerInstance = loggerMock.createLogger('initial');

describe('GET /api/tournaments/[id]/ta/standings', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-configure logger mock after clearAllMocks resets return values
    (loggerMock.createLogger as jest.Mock).mockReturnValue(loggerInstance);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authorization', () => {
    it('should return 403 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await standingsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta/standings'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Unauthorized: Admin access required' },
        { status: 403 }
      );
    });

    it('should return 403 when authenticated user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-1', role: 'user' },
      });

      await standingsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta/standings'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Unauthorized: Admin access required' },
        { status: 403 }
      );
    });
  });

  describe('Cache Handling', () => {
    it('should return cached data if available and not expired', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      const cachedData = {
        data: {
          tournamentId: 't1',
          stage: 'qualification',
          entries: [
            { rank: 1, playerName: 'Player 1', totalTime: 100000 },
          ],
        },
        etag: 'cached-etag',
        expiresAt: new Date(Date.now() + 60000),
      };

      (get as jest.Mock).mockResolvedValue(cachedData);

      await standingsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta/standings'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ...cachedData.data,
          _cached: true,
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'ETag': 'cached-etag',
            'Cache-Control': 'public, max-age=300',
          }),
        })
      );
    });

    it('should skip cache and fetch fresh data if cache is expired', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      const cachedData = {
        data: { entries: [] },
        etag: 'old-etag',
        expiresAt: new Date(Date.now() - 1000),
      };

      (get as jest.Mock).mockResolvedValue(cachedData);
      (isExpired as jest.Mock).mockReturnValue(true);

      const mockEntries = [
        {
          id: 'entry1',
          rank: 1,
          totalTime: 100000,
          lives: 3,
          eliminated: false,
          playerId: 'p1',
          player: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'player1',
          },
        },
      ];

      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);
      (set as jest.Mock).mockResolvedValue(undefined);
      (generateETag as jest.Mock).mockReturnValue('new-etag');

      await standingsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta/standings'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tTEntry.findMany).toHaveBeenCalled();
      expect(set).toHaveBeenCalledWith('t1', 'qualification', mockEntries, 'new-etag');
    });
  });

  describe('Success Cases', () => {
    it('should return TA standings successfully with valid entries', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      const mockEntries = [
        {
          id: 'entry1',
          rank: 1,
          totalTime: 100000,
          lives: 3,
          eliminated: false,
          playerId: 'p1',
          player: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'player1',
          },
        },
        {
          id: 'entry2',
          rank: null,
          totalTime: null,
          lives: 1,
          eliminated: false,
          playerId: 'p2',
          player: {
            id: 'p2',
            name: 'Player 2',
            nickname: 'player2',
          },
        },
      ];

      (get as jest.Mock).mockResolvedValue(null);
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);
      (set as jest.Mock).mockResolvedValue(undefined);

      await standingsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta/standings'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tTEntry.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player: true },
        orderBy: { rank: 'asc' },
      });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          tournamentId: 't1',
          stage: 'qualification',
          entries: expect.arrayContaining([
            expect.objectContaining({
              rank: 1,
              playerName: 'Player 1',
              playerNickname: 'player1',
              totalTime: 100000,
              formattedTime: '1:40',
              lives: 3,
              eliminated: false,
            }),
            expect.objectContaining({
              rank: '-',
              playerName: 'Player 2',
              playerNickname: 'player2',
              totalTime: null,
              formattedTime: '-',
            }),
          ]),
        })
      );
    });

    it('should handle entries with totalTime = 0', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      const mockEntries = [
        {
          id: 'entry1',
          rank: 1,
          totalTime: 0,
          lives: 3,
          eliminated: false,
          playerId: 'p1',
          player: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'player1',
          },
        },
      ];

      (get as jest.Mock).mockResolvedValue(null);
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);
      (set as jest.Mock).mockResolvedValue(undefined);

      await standingsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta/standings'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      // Source uses `e.totalTime != null` which correctly treats 0 as a valid time.
      // So totalTime = 0 produces formattedTime = '0:00', not '-'.
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: expect.arrayContaining([
            expect.objectContaining({
              formattedTime: '0:00',
            }),
          ]),
        })
      );
    });
  });

  describe('Error Cases', () => {
    it('should handle database errors gracefully', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      (get as jest.Mock).mockResolvedValue(null);
      (prisma.tTEntry.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      await standingsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta/standings'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      // Verify the shared logger instance (returned by mocked createLogger) logged the error.
      // loggerInstance is pre-captured from the mock and re-set in beforeEach.
      expect(loggerInstance.error).toHaveBeenCalledWith(
        'Failed to fetch TA standings',
        expect.any(Object)
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Failed to fetch TA standings' },
        { status: 500 }
      );
    });

    it('should handle cache set errors gracefully', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      const mockEntries = [
        {
          id: 'entry1',
          rank: 1,
          totalTime: 100000,
          playerId: 'p1',
          player: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'player1',
          },
        },
      ];

      (get as jest.Mock).mockResolvedValue(null);
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);
      (set as jest.Mock).mockRejectedValue(new Error('Cache error'));
      (generateETag as jest.Mock).mockReturnValue('new-etag');

      await standingsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta/standings'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalled();
    });
  });
});

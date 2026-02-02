/**
 * @module Test Suite: /api/tournaments/[id]/ta
 *
 * Tests for the Time Attack (TA) main API route handler.
 * Covers GET, POST, PUT, DELETE endpoints for managing TA entries.
 *
 * Dependencies mocked:
 * - @/lib/auth: Session-based authentication (admin + player)
 * - @/lib/logger: Structured Winston logging (shared singleton via factory)
 * - @/lib/rate-limit: In-memory rate limiting
 * - @/lib/sanitize: Input sanitization
 * - @/lib/audit-log: Audit trail for CRUD operations
 * - @/lib/ta/rank-calculation: Rank recalculation after entry changes
 * - @/lib/ta/promotion: Stage promotion logic (finals, revival rounds)
 * - @/lib/ta/time-utils: Time parsing utilities
 * - next/server: NextResponse.json mock for response assertions
 */
// @ts-nocheck - This test file uses complex mock types for Next.js API routes

// IMPORTANT: jest.mock() calls use the global jest (not imported from @jest/globals)
// because babel-jest's hoisting plugin does not properly hoist jest.mock()
// when jest is imported from @jest/globals, causing mocks to not be applied.

// Mock auth module
jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

// Mock logger with shared singleton - every createLogger call returns the same object
jest.mock('@/lib/logger', () => {
  const sharedLogger = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
  return {
    createLogger: jest.fn(() => sharedLogger),
  };
});

// Mock rate-limit functions with default return values
jest.mock('@/lib/rate-limit', () => ({
  getClientIdentifier: jest.fn(() => '127.0.0.1'),
  getUserAgent: jest.fn(() => 'test-agent'),
  rateLimit: jest.fn(() => Promise.resolve({ success: true })),
}));

// Mock sanitize to pass data through
jest.mock('@/lib/sanitize', () => ({
  sanitizeInput: jest.fn((data) => data),
}));

// Mock audit-log
jest.mock('@/lib/audit-log', () => ({
  createAuditLog: jest.fn(),
  AUDIT_ACTIONS: {
    CREATE_TA_ENTRY: 'CREATE_TA_ENTRY',
    UPDATE_TA_ENTRY: 'UPDATE_TA_ENTRY',
    DELETE_TA_ENTRY: 'DELETE_TA_ENTRY',
  },
}));

// Mock rank-calculation
jest.mock('@/lib/ta/rank-calculation', () => ({
  recalculateRanks: jest.fn(() => Promise.resolve()),
}));

// Mock time-utils with a simple implementation for validation
jest.mock('@/lib/ta/time-utils', () => ({
  timeToMs: jest.fn((val) => {
    if (!val || val === '') return null;
    const match = val.match(/^(\d{1,2}):(\d{2})\.(\d{1,3})$/);
    if (!match) return null;
    return parseInt(match[1]) * 60000 + parseInt(match[2]) * 1000 + parseInt(match[3]);
  }),
}));

// Mock promotion functions
jest.mock('@/lib/ta/promotion', () => ({
  promoteToFinals: jest.fn(),
  promoteToRevival1: jest.fn(),
  promoteToRevival2: jest.fn(),
}));

// Mock next/server with MockNextRequest that supports URL parsing
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

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import * as taRoute from '@/app/api/tournaments/[id]/ta/route';

// Access mocks via requireMock to get references to the same mock functions
// that the route module uses (per CLAUDE.md mock pattern)
const rateLimitMock = jest.requireMock('@/lib/rate-limit') as {
  rateLimit: jest.Mock;
  getClientIdentifier: jest.Mock;
  getUserAgent: jest.Mock;
};

const loggerMock = jest.requireMock('@/lib/logger') as {
  createLogger: jest.Mock;
};

// Valid CUIDs for tests — the TA route uses z.string().cuid() for validation
const VALID_UUID = 'clxxxxxxxxxxxxxxxxtournmt';
const VALID_UUID2 = 'clxxxxxxxxxxxxxxxxxplayer';
const VALID_ENTRY_ID = 'clxxxxxxxxxxxxxxxxxxentry';

describe('/api/tournaments/[id]/ta', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock NextResponse.json to return a response-like object (matching BM/MR/GP test patterns)
    // This ensures auth guard responses are truthy and properly trigger early returns.
    NextResponse.json.mockImplementation((data: any, options?: any) => ({
      data,
      status: options?.status || 200,
    }));
    // Restore default mock return values after clearAllMocks resets them
    rateLimitMock.rateLimit.mockImplementation(() => Promise.resolve({ success: true }));
    rateLimitMock.getClientIdentifier.mockReturnValue('127.0.0.1');
    rateLimitMock.getUserAgent.mockReturnValue('test-agent');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // GET
  // =========================================================================
  describe('GET', () => {
    it('should return TA entries for qualification stage', async () => {
      const mockEntries = [
        {
          id: 'entry1',
          tournamentId: VALID_UUID,
          playerId: 'p1',
          stage: 'qualification',
          rank: 1,
          totalTime: 83456,
          lives: 1,
          times: { MC1: '1:23.456', MC2: '1:30.123' },
          player: { id: 'p1', name: 'Player 1', nickname: 'p1' },
        },
      ];

      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);
      (prisma.tTEntry.count as jest.Mock)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(5);

      await taRoute.GET(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(prisma.tTEntry.findMany).toHaveBeenCalledWith({
        where: { tournamentId: VALID_UUID, stage: 'qualification' },
        include: { player: true },
        orderBy: [{ rank: 'asc' }, { totalTime: 'asc' }],
      });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: mockEntries,
          stage: 'qualification',
          qualCount: 10,
          finalsCount: 5,
        })
      );
    });

    it('should return 400 for invalid tournament ID', async () => {
      await taRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/invalid-id/ta'),
        { params: Promise.resolve({ id: 'invalid-id' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Invalid tournament ID format' },
        { status: 400 }
      );
    });

    it('should handle database errors with 500', async () => {
      (prisma.tTEntry.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));

      await taRoute.GET(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      const sharedLogger = loggerMock.createLogger();
      expect(sharedLogger.error).toHaveBeenCalledWith(
        'Failed to fetch TA data',
        expect.objectContaining({ tournamentId: VALID_UUID })
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Failed to fetch time attack data' },
        { status: 500 }
      );
    });
  });

  // =========================================================================
  // POST
  // =========================================================================
  describe('POST', () => {
    it('should add a player to qualification', async () => {
      // Admin session required — requireAdminOrPlayer() runs before creating the entry
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      });

      const mockEntry = {
        id: VALID_ENTRY_ID,
        tournamentId: VALID_UUID,
        playerId: VALID_UUID2,
        stage: 'qualification',
        times: {},
        player: { id: VALID_UUID2, nickname: 'TestPlayer' },
      };

      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.tTEntry.create as jest.Mock).mockResolvedValue(mockEntry);

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ playerId: VALID_UUID2 }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(prisma.tTEntry.create).toHaveBeenCalledWith({
        data: {
          tournamentId: VALID_UUID,
          playerId: VALID_UUID2,
          stage: 'qualification',
          times: {},
        },
        include: { player: true },
      });

      expect(NextResponse.json).toHaveBeenCalledWith(
        { message: 'Player(s) added to time attack', entries: [mockEntry] },
        { status: 201 }
      );
    });

    it('should return 400 for invalid tournament ID', async () => {
      await taRoute.POST(
        new NextRequest('http://localhost:3000/api/tournaments/bad-id/ta', {
          method: 'POST',
          body: JSON.stringify({ playerId: VALID_UUID2 }),
        }),
        { params: Promise.resolve({ id: 'bad-id' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Invalid tournament ID format' },
        { status: 400 }
      );
    });

    it('should return 429 when rate limited', async () => {
      // Auth must pass before rate limit check runs for add-player action
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      });
      rateLimitMock.rateLimit.mockImplementation(() => Promise.resolve({ success: false }));

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ playerId: VALID_UUID2 }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    });

    it('should return 403 for promote_to_finals when user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-1', role: 'member' },
      });

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({
            action: 'promote_to_finals',
            players: [VALID_UUID2],
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    });

    it('should return 403 for promote_to_finals without admin auth (null session)', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({
            action: 'promote_to_finals',
            players: [VALID_UUID2],
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    });

    it('should return 403 for promote_to_revival_1 without admin auth', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({
            action: 'promote_to_revival_1',
            players: [VALID_UUID2],
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    });

    it('should return 403 for promote_to_revival_2 without admin auth', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({
            action: 'promote_to_revival_2',
            players: [VALID_UUID2],
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    });

    it('should return 403 for add player without session auth', async () => {
      // No session — neither admin nor player authenticated
      (auth as jest.Mock).mockResolvedValue(null);

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ playerId: VALID_UUID2 }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    });

    it('should add player with valid player session', async () => {
      // Player session — authenticated player can add themselves
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'player-user', userType: 'player', playerId: VALID_UUID2, role: 'member' },
      });

      const mockEntry = {
        id: VALID_ENTRY_ID,
        tournamentId: VALID_UUID,
        playerId: VALID_UUID2,
        stage: 'qualification',
        times: {},
        player: { id: VALID_UUID2, nickname: 'TestPlayer' },
      };

      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.tTEntry.create as jest.Mock).mockResolvedValue(mockEntry);

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ playerId: VALID_UUID2 }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { message: 'Player(s) added to time attack', entries: [mockEntry] },
        { status: 201 }
      );
    });
  });

  // =========================================================================
  // PUT
  // =========================================================================
  describe('PUT', () => {
    it('should update a course time', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      });

      const existingEntry = {
        id: VALID_ENTRY_ID,
        tournamentId: VALID_UUID,
        stage: 'qualification',
        times: { MC1: '1:20.000' },
      };

      const updatedEntry = {
        ...existingEntry,
        times: { MC1: '1:20.000', MC2: '1:25.000' },
        player: { id: 'p1', nickname: 'TestPlayer' },
      };

      (prisma.tTEntry.findUnique as jest.Mock)
        .mockResolvedValueOnce(existingEntry)
        .mockResolvedValueOnce(updatedEntry);
      (prisma.tTEntry.update as jest.Mock).mockResolvedValue(updatedEntry);

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            course: 'MC2',
            time: '1:25.000',
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { entry: updatedEntry }
      );
    });

    it('should return 400 for invalid tournament ID', async () => {
      await taRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/bad-id/ta', {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            course: 'MC1',
            time: '1:20.000',
          }),
        }),
        { params: Promise.resolve({ id: 'bad-id' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Invalid tournament ID format' },
        { status: 400 }
      );
    });

    it('should handle database errors with 500', async () => {
      (prisma.tTEntry.findUnique as jest.Mock).mockRejectedValue(new Error('DB error'));

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            course: 'MC1',
            time: '1:20.000',
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      const sharedLogger = loggerMock.createLogger();
      expect(sharedLogger.error).toHaveBeenCalledWith(
        'Failed to update times',
        expect.objectContaining({ tournamentId: VALID_UUID })
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Failed to update times' },
        { status: 500 }
      );
    });

    it('should return 403 for eliminate action when user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-1', role: 'member' },
      });

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            action: 'eliminate',
            eliminated: true,
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    });

    it('should return 403 for eliminate action without admin auth (null session)', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            action: 'eliminate',
            eliminated: true,
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    });

    it('should return 403 for update_lives action without admin auth', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            action: 'update_lives',
            livesDelta: 1,
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    });

    it('should return 403 for reset_lives action without admin auth', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            action: 'reset_lives',
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    });

    it('should return 403 for update times without session auth', async () => {
      // No session — neither admin nor player authenticated
      (auth as jest.Mock).mockResolvedValue(null);

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            times: { MC1: '1:20.000' },
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    });

    it('should update times with valid player session', async () => {
      // Player session — authenticated player can update their times
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'player-user', userType: 'player', playerId: 'p1', role: 'member' },
      });

      const existingEntry = {
        id: VALID_ENTRY_ID,
        tournamentId: VALID_UUID,
        stage: 'qualification',
        times: { MC1: '1:20.000' },
      };

      const updatedEntry = {
        ...existingEntry,
        times: { MC1: '1:20.000', MC2: '1:25.000' },
        player: { id: 'p1', nickname: 'TestPlayer' },
      };

      (prisma.tTEntry.findUnique as jest.Mock)
        .mockResolvedValueOnce(existingEntry)
        .mockResolvedValueOnce(updatedEntry);
      (prisma.tTEntry.update as jest.Mock).mockResolvedValue(updatedEntry);

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            times: { MC2: '1:25.000' },
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { entry: updatedEntry }
      );
    });
  });

  // =========================================================================
  // DELETE
  // =========================================================================
  describe('DELETE', () => {
    it('should delete an entry with admin auth', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      });

      const entryToDelete = {
        id: VALID_ENTRY_ID,
        tournamentId: VALID_UUID,
        stage: 'qualification',
        player: { nickname: 'TestPlayer' },
      };

      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(entryToDelete);
      (prisma.tTEntry.delete as jest.Mock).mockResolvedValue(entryToDelete);

      await taRoute.DELETE(
        new NextRequest(
          `http://localhost:3000/api/tournaments/${VALID_UUID}/ta?entryId=${VALID_ENTRY_ID}`
        ),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Entry deleted successfully',
      });
    });

    it('should return 403 without admin auth (null session)', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await taRoute.DELETE(
        new NextRequest(
          `http://localhost:3000/api/tournaments/${VALID_UUID}/ta?entryId=${VALID_ENTRY_ID}`
        ),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    });

    it('should return 403 when user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-1', email: 'user@example.com', role: 'member' },
      });

      await taRoute.DELETE(
        new NextRequest(
          `http://localhost:3000/api/tournaments/${VALID_UUID}/ta?entryId=${VALID_ENTRY_ID}`
        ),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    });

    it('should return 404 when entry not found', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      });

      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(null);

      await taRoute.DELETE(
        new NextRequest(
          `http://localhost:3000/api/tournaments/${VALID_UUID}/ta?entryId=${VALID_ENTRY_ID}`
        ),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Entry not found' },
        { status: 404 }
      );
    });

    it('should handle database errors with 500', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      });

      (prisma.tTEntry.findUnique as jest.Mock).mockRejectedValue(new Error('DB error'));

      await taRoute.DELETE(
        new NextRequest(
          `http://localhost:3000/api/tournaments/${VALID_UUID}/ta?entryId=${VALID_ENTRY_ID}`
        ),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      const sharedLogger = loggerMock.createLogger();
      expect(sharedLogger.error).toHaveBeenCalledWith(
        'Failed to delete entry',
        expect.objectContaining({ tournamentId: VALID_UUID })
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Failed to delete entry' },
        { status: 500 }
      );
    });
  });
});

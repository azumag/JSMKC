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
 * - @/lib/ta/promotion: (removed — promotion is now in /ta/phases)
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
  createAuditLog: jest.fn(() => Promise.resolve()),
  AUDIT_ACTIONS: {
    CREATE_TA_ENTRY: 'CREATE_TA_ENTRY',
    UPDATE_TA_ENTRY: 'UPDATE_TA_ENTRY',
    DELETE_TA_ENTRY: 'DELETE_TA_ENTRY',
  },
  resolveAuditUserId: jest.fn((s) => s?.user?.id ?? undefined),
}));

// Mock rank-calculation
jest.mock('@/lib/ta/rank-calculation', () => ({
  recalculateRanks: jest.fn(() => Promise.resolve()),
  rerankStageAfterDelete: jest.fn(() => Promise.resolve()),
}));

// Mock time-utils: preserve real Zod schemas (TimeStringSchema, TimesObjectSchema)
// since they are used in route-level Zod schema definitions. Only mock timeToMs
// with an equivalent implementation for test isolation.
jest.mock('@/lib/ta/time-utils', () => ({
  ...jest.requireActual('@/lib/ta/time-utils'),
  timeToMs: jest.fn((val) => {
    if (!val || val === '') return null;
    const match = val.match(/^(\d{1,2}):(\d{2})\.(\d{1,3})$/);
    if (!match) return null;
    return parseInt(match[1]) * 60000 + parseInt(match[2]) * 1000 + parseInt(match[3]);
  }),
}));

// Promotion functions removed — promotion is now handled by /ta/phases endpoint

// Mock freeze-check: default to "not frozen" (returns null) for all existing tests.
// Tests that need to verify freeze behavior can override this mock.
jest.mock('@/lib/ta/freeze-check', () => ({
  checkStageFrozen: jest.fn(() => Promise.resolve(null)),
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
import { configureNextResponseMock } from '../../../../../helpers/next-response-mock';

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

const rankCalculationMock = jest.requireMock('@/lib/ta/rank-calculation') as {
  recalculateRanks: jest.Mock;
  rerankStageAfterDelete: jest.Mock;
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
    configureNextResponseMock(NextResponse);
    // Restore default mock return values after clearAllMocks resets them
    rateLimitMock.rateLimit.mockImplementation(() => Promise.resolve({ success: true }));
    rateLimitMock.getClientIdentifier.mockReturnValue('127.0.0.1');
    rateLimitMock.getUserAgent.mockReturnValue('test-agent');
    (prisma.tTEntry.findFirst as jest.Mock).mockResolvedValue(null);
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
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ frozenStages: [] });
      (prisma.tTEntry.count as jest.Mock).mockResolvedValueOnce(10);

      await taRoute.GET(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      // createSuccessResponse wraps the data in { success: true, data: ... }
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            entries: mockEntries,
            stage: 'qualification',
            qualCount: 10,
            qualificationRegistrationLocked: false,
            qualificationEditingLockedForPlayers: false,
            frozenStages: [],
          }),
        })
      );
    });

    it('should report qualification editing as locked for players after knockout starts', async () => {
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ frozenStages: [] });
      (prisma.tTEntry.count as jest.Mock).mockResolvedValueOnce(24);
      (prisma.tTEntry.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'phase-entry-1' });

      await taRoute.GET(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            qualificationRegistrationLocked: true,
            qualificationEditingLockedForPlayers: true,
          }),
        })
      );
    });

    it('should resolve tournament slug for GET', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValueOnce({ id: VALID_UUID });
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ frozenStages: [] });
      (prisma.tTEntry.count as jest.Mock).mockResolvedValueOnce(0);

      await taRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/jsmkc2026/ta'),
        { params: Promise.resolve({ id: 'jsmkc2026' }) }
      );

      expect(prisma.tournament.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ id: 'jsmkc2026' }, { slug: 'jsmkc2026' }] },
        })
      );
      expect(prisma.tTEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tournamentId: VALID_UUID, stage: 'qualification' },
        })
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
        { success: false, error: 'Failed to fetch time attack data', code: 'INTERNAL_ERROR' },
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

      /*
       * Issue #420: bulk insert path. POST now does:
       *   1. findFirst (knockout-stage check)
       *   2. findMany — duplicate-detection scan over playerIds
       *   3. createMany — bulk insert of new entries
       *   4. findMany — re-fetch with includes for response payload
       * Mock the two findMany calls in order.
       */
      (prisma.tTEntry.findMany as jest.Mock)
        .mockResolvedValueOnce([])           // duplicate-detection: nothing exists
        .mockResolvedValueOnce([mockEntry]); // re-fetch with player include
      (prisma.tTEntry.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ playerId: VALID_UUID2 }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(prisma.tTEntry.createMany).toHaveBeenCalledWith({
        data: [{
          tournamentId: VALID_UUID,
          playerId: VALID_UUID2,
          stage: 'qualification',
          times: {},
          seeding: null,
        }],
      });

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: true, data: { entries: [mockEntry] }, message: 'Player(s) added to time attack' },
        { status: 201 }
      );
    });

    it('should return 409 when knockout has already started', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      });
      (prisma.tTEntry.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'phase-entry-1' });

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ playerId: VALID_UUID2 }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Cannot add players after knockout stage has started', code: 'CONFLICT' },
        { status: 409 }
      );
      expect(prisma.tTEntry.createMany).not.toHaveBeenCalled();
    });

    it('should return 409 when player tries to self-register after knockout has started', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'player-user', userType: 'player', playerId: VALID_UUID2, role: 'member' },
      });
      (prisma.tTEntry.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'phase-entry-1' });

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ playerId: VALID_UUID2 }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Cannot add players after knockout stage has started', code: 'CONFLICT' },
        { status: 409 }
      );
      expect(prisma.tTEntry.createMany).not.toHaveBeenCalled();
    });

    it('should resolve tournament slug for POST', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValueOnce({ id: VALID_UUID });
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      });
      (prisma.tTEntry.findMany as jest.Mock)
        .mockResolvedValueOnce([])  // duplicate-detection
        .mockResolvedValueOnce([{
          id: VALID_ENTRY_ID,
          tournamentId: VALID_UUID,
          playerId: VALID_UUID2,
          stage: 'qualification',
          player: { nickname: 'Player' },
        }]);
      (prisma.tTEntry.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      await taRoute.POST(
        new NextRequest('http://localhost:3000/api/tournaments/jsmkc2026/ta', {
          method: 'POST',
          body: JSON.stringify({ playerId: VALID_UUID2 }),
        }),
        { params: Promise.resolve({ id: 'jsmkc2026' }) }
      );

      expect(prisma.tTEntry.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ tournamentId: VALID_UUID }),
          ]),
        })
      );
    });

    it.skip('should return 429 when rate limited', async () => {
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
        { success: false, error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    });

    // Deprecated promotion actions (promote_to_revival_1, promote_to_revival_2,
    // promote_to_finals) were removed. They now return 400 validation error.
    it('should return 400 for deprecated promote_to_revival_1 action', async () => {
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
        expect.objectContaining({ error: expect.stringContaining('Invalid') }),
        { status: 400 }
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
        { success: false, error: 'Forbidden', code: 'FORBIDDEN' },
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

      (prisma.tTEntry.findMany as jest.Mock)
        .mockResolvedValueOnce([])           // duplicate-detection
        .mockResolvedValueOnce([mockEntry]); // re-fetch with player include
      (prisma.tTEntry.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ playerId: VALID_UUID2 }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: true, data: { entries: [mockEntry] }, message: 'Player(s) added to time attack' },
        { status: 201 }
      );
    });

    it('should return 403 when player tries to add another player', async () => {
      // Player session with playerId VALID_UUID2 — attempting to add a different player
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'player-user', userType: 'player', playerId: VALID_UUID2, role: 'member' },
      });

      const OTHER_PLAYER_ID = 'clxxxxxxxxxxxxxxxxotherpl';

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ playerId: OTHER_PLAYER_ID }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden: Players can only add themselves', code: 'FORBIDDEN' },
        { status: 403 }
      );
    });

    it('should return 403 when player tries to add batch with mixed player IDs', async () => {
      // Player session — attempting to add themselves AND another player in a batch
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'player-user', userType: 'player', playerId: VALID_UUID2, role: 'member' },
      });

      const OTHER_PLAYER_ID = 'clxxxxxxxxxxxxxxxxotherpl';

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ players: [VALID_UUID2, OTHER_PLAYER_ID] }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden: Players can only add themselves', code: 'FORBIDDEN' },
        { status: 403 }
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

      // createSuccessResponse wraps the data in { success: true, data: ... }
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { entry: updatedEntry },
      });
    });

    it('should resolve tournament slug for PUT', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValueOnce({ id: VALID_UUID });
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.tTEntry.findUnique as jest.Mock)
        .mockResolvedValueOnce({
          id: VALID_ENTRY_ID,
          tournamentId: VALID_UUID,
          playerId: 'p1',
          stage: 'qualification',
          times: {},
        })
        .mockResolvedValueOnce({
          id: VALID_ENTRY_ID,
          tournamentId: VALID_UUID,
          playerId: 'p1',
          stage: 'qualification',
          times: { MC1: '1:20.000' },
          player: { id: 'p1', nickname: 'TestPlayer' },
        });
      (prisma.tTEntry.update as jest.Mock).mockResolvedValue({
        id: VALID_ENTRY_ID,
        times: { MC1: '1:20.000' },
      });

      await taRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/jsmkc2026/ta', {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            course: 'MC1',
            time: '1:20.000',
          }),
        }),
        { params: Promise.resolve({ id: 'jsmkc2026' }) }
      );

      expect(prisma.tournament.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ id: 'jsmkc2026' }, { slug: 'jsmkc2026' }] },
        })
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
        { success: false, error: 'Failed to update times', code: 'INTERNAL_ERROR' },
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
        { success: false, error: 'Forbidden', code: 'FORBIDDEN' },
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
        { success: false, error: 'Forbidden', code: 'FORBIDDEN' },
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
        { success: false, error: 'Forbidden', code: 'FORBIDDEN' },
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
        { success: false, error: 'Forbidden', code: 'FORBIDDEN' },
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
        { success: false, error: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 }
      );
    });

    it('should update times with valid player session', async () => {
      // Player session — authenticated player can update their own times
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'player-user', userType: 'player', playerId: 'p1', role: 'member' },
      });

      const existingEntry = {
        id: VALID_ENTRY_ID,
        tournamentId: VALID_UUID,
        playerId: 'p1', // Must match session's playerId for ownership check
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

      // createSuccessResponse wraps the data in { success: true, data: ... }
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { entry: updatedEntry },
      });
    });

    it('should return 403 when player tries to edit qualification times after knockout starts', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'player-user', userType: 'player', playerId: 'p1', role: 'member' },
      });

      const existingEntry = {
        id: VALID_ENTRY_ID,
        tournamentId: VALID_UUID,
        playerId: 'p1',
        stage: 'qualification',
        times: { MC1: '1:20.000' },
      };

      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValueOnce(existingEntry);
      (prisma.tTEntry.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'phase-entry-1' });

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
        {
          success: false,
          error: 'Forbidden: Qualification times can only be edited by admins after knockout starts',
          code: 'FORBIDDEN',
        },
        { status: 403 }
      );
      expect(prisma.tTEntry.update).not.toHaveBeenCalled();
    });

    it('should return 403 when player tries to update another player\'s times', async () => {
      // Player session with playerId 'p1' — attempting to update entry owned by 'p2'
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'player-user', userType: 'player', playerId: 'p1', role: 'member' },
      });

      const existingEntry = {
        id: VALID_ENTRY_ID,
        tournamentId: VALID_UUID,
        playerId: 'p2', // Different from session's playerId — ownership check should fail
        stage: 'qualification',
        times: { MC1: '1:20.000' },
      };

      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValueOnce(existingEntry);

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
        { success: false, error: "Forbidden: You can only update your own or your partner's times", code: 'FORBIDDEN' },
        { status: 403 }
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

      // createSuccessResponse wraps the data in { success: true, data: ... }
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          message: 'Entry deleted successfully',
        },
      });
      expect(rankCalculationMock.rerankStageAfterDelete).toHaveBeenCalledWith(
        VALID_UUID,
        'qualification',
        prisma,
      );
      expect(rankCalculationMock.recalculateRanks).not.toHaveBeenCalled();
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
        { success: false, error: 'Forbidden', code: 'FORBIDDEN' },
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
        { success: false, error: 'Forbidden', code: 'FORBIDDEN' },
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
        { success: false, error: 'Entry not found', code: 'NOT_FOUND' },
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
        { success: false, error: 'Failed to delete entry', code: 'INTERNAL_ERROR' },
        { status: 500 }
      );
    });
  });
});

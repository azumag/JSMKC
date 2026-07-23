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
  createAuditLogs: jest.fn(() => Promise.resolve()),
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

jest.mock('@/lib/tournament-archive', () => {
  const actual = jest.requireActual('@/lib/tournament-archive');
  return {
    getArchivedModePayload: jest.fn(actual.getArchivedModePayload),
    readTournamentArchive: jest.fn(),
  };
});

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
          if (h instanceof Headers) {
            h.forEach(cb);
            return;
          }
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
import { getArchivedModePayload, readTournamentArchive } from '@/lib/tournament-archive';
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

const auditLogMock = jest.requireMock('@/lib/audit-log') as {
  createAuditLog: jest.Mock;
  createAuditLogs: jest.Mock;
};

const freezeCheckMock = jest.requireMock('@/lib/ta/freeze-check') as {
  checkStageFrozen: jest.Mock;
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
    (readTournamentArchive as jest.Mock).mockResolvedValue(null);
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
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({
        id: VALID_UUID,
        frozenStages: [],
        taPlayerSelfEdit: true,
      });
      (prisma.tTEntry.count as jest.Mock).mockResolvedValueOnce(10);

      await taRoute.GET(new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`), {
        params: Promise.resolve({ id: VALID_UUID }),
      });

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
        }),
      );
    });

    it('should report qualification editing as locked for players after knockout starts', async () => {
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({
        id: VALID_UUID,
        frozenStages: [],
        taPlayerSelfEdit: true,
      });
      (prisma.tTEntry.count as jest.Mock).mockResolvedValueOnce(24);
      (prisma.tTEntry.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'phase-entry-1' });

      await taRoute.GET(new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`), {
        params: Promise.resolve({ id: VALID_UUID }),
      });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            qualificationRegistrationLocked: true,
            qualificationEditingLockedForPlayers: true,
          }),
        }),
      );
    });

    it('should resolve tournament slug for GET', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValueOnce({ id: VALID_UUID });
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.tTEntry.count as jest.Mock).mockResolvedValueOnce(0);

      await taRoute.GET(new NextRequest('http://localhost:3000/api/tournaments/jsmkc2026/ta'), {
        params: Promise.resolve({ id: 'jsmkc2026' }),
      });

      expect(prisma.tournament.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ id: 'jsmkc2026' }, { slug: 'jsmkc2026' }] },
        }),
      );
      expect(prisma.tTEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tournamentId: VALID_UUID, stage: 'qualification' },
        }),
      );
    });

    it('should return archived TA payload when tournament lookup returns not found', async () => {
      const archivedEntry = {
        id: 'archived-entry-1',
        playerId: 'archived-player-1',
        stage: 'qualification',
        totalTime: 83456,
        player: { id: 'archived-player-1', name: 'Archived Player', nickname: 'archived' },
      };
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(null);
      (readTournamentArchive as jest.Mock).mockResolvedValue({
        schemaVersion: 1,
        tournament: { id: VALID_UUID, publicModes: ['ta'] },
        modes: {
          ta: { entries: [archivedEntry], courses: ['MC1'] },
          bm: {},
          mr: {},
          gp: {},
        },
        allPlayers: [archivedEntry.player],
      });

      await taRoute.GET(new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`), {
        params: Promise.resolve({ id: VALID_UUID }),
      });

      expect(readTournamentArchive).toHaveBeenCalledWith(VALID_UUID);
      expect(prisma.tTEntry.findMany).not.toHaveBeenCalled();
      expect(prisma.tTEntry.count).not.toHaveBeenCalled();
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          archived: true,
          entries: [archivedEntry],
          courses: ['MC1'],
          allPlayers: [archivedEntry.player],
        }),
      });
    });

    it('should return 404 when tournament and archive are both missing', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(null);
      (readTournamentArchive as jest.Mock).mockResolvedValue(null);

      await taRoute.GET(new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`), {
        params: Promise.resolve({ id: VALID_UUID }),
      });

      expect(readTournamentArchive).toHaveBeenCalledWith(VALID_UUID);
      expect(prisma.tTEntry.findMany).not.toHaveBeenCalled();
      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Tournament not found', code: 'NOT_FOUND' },
        { status: 404 },
      );
    });

    it('should return 404 when archive exists without TA mode payload', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(null);
      (readTournamentArchive as jest.Mock).mockResolvedValue({
        schemaVersion: 1,
        tournament: { id: VALID_UUID, publicModes: ['bm'] },
        modes: {
          bm: {},
          mr: {},
          gp: {},
        },
        allPlayers: [],
      });

      await taRoute.GET(new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`), {
        params: Promise.resolve({ id: VALID_UUID }),
      });

      expect(readTournamentArchive).toHaveBeenCalledWith(VALID_UUID);
      expect(prisma.tTEntry.findMany).not.toHaveBeenCalled();
      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Tournament not found', code: 'NOT_FOUND' },
        { status: 404 },
      );
    });

    it('should handle database errors with 500', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({
        id: VALID_UUID,
        frozenStages: [],
        taPlayerSelfEdit: true,
      });
      (prisma.tTEntry.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));

      await taRoute.GET(new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`), {
        params: Promise.resolve({ id: VALID_UUID }),
      });

      const sharedLogger = loggerMock.createLogger();
      expect(sharedLogger.error).toHaveBeenCalledWith(
        'Failed to fetch TA data',
        expect.objectContaining({ tournamentId: VALID_UUID }),
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Failed to fetch time attack data', code: 'INTERNAL_ERROR' },
        { status: 500 },
      );
    });

    it('should keep DB errors as 500 when archive exists without TA mode payload', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockRejectedValue(new Error('DB error'));
      (readTournamentArchive as jest.Mock).mockResolvedValue({
        schemaVersion: 1,
        tournament: { id: VALID_UUID, publicModes: ['bm'] },
        modes: {
          bm: {},
          mr: {},
          gp: {},
        },
        allPlayers: [],
      });

      await taRoute.GET(new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`), {
        params: Promise.resolve({ id: VALID_UUID }),
      });

      expect(readTournamentArchive).toHaveBeenCalledWith(VALID_UUID);
      expect(getArchivedModePayload).not.toHaveBeenCalled();
      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Failed to fetch time attack data', code: 'INTERNAL_ERROR' },
        { status: 500 },
      );
    });
  });

  // =========================================================================
  // POST
  // =========================================================================
  describe('POST', () => {
    it('recalculates persisted qualification scoring fields for an admin', async () => {
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      });
      (prisma.tTEntry.count as jest.Mock).mockResolvedValue(24);

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ action: 'recalculate_qualification' }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(rankCalculationMock.recalculateRanks).toHaveBeenCalledWith(VALID_UUID, 'qualification', prisma);
      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE_TA_ENTRY',
          targetId: VALID_UUID,
          details: expect.objectContaining({
            action: 'recalculate_qualification',
            recalculatedEntryCount: 24,
          }),
        }),
      );
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { stage: 'qualification', recalculatedEntryCount: 24 },
      });
    });

    it('rejects qualification recalculation from a non-admin session', async () => {
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'player-user', userType: 'player', playerId: VALID_UUID2, role: 'member' },
      });

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ action: 'recalculate_qualification' }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(rankCalculationMock.recalculateRanks).not.toHaveBeenCalled();
      expect(NextResponse.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, code: 'FORBIDDEN' }), {
        status: 403,
      });
    });

    it('should add a player to qualification', async () => {
      // Admin session required — requireAdminOrPlayer() runs before creating the entry
      jest.mocked(auth).mockResolvedValue({
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
        .mockResolvedValueOnce([]) // duplicate-detection: nothing exists
        .mockResolvedValueOnce([mockEntry]); // re-fetch with player include
      (prisma.tTEntry.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ playerId: VALID_UUID2 }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(prisma.tTEntry.createMany).toHaveBeenCalledWith({
        data: [
          {
            tournamentId: VALID_UUID,
            playerId: VALID_UUID2,
            stage: 'qualification',
            times: {},
            seeding: null,
            taHandicapSeconds: 0,
          },
        ],
      });

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: true, data: { entries: [mockEntry] }, message: 'Player(s) added to time attack' },
        { status: 201 },
      );
      expect(auditLogMock.createAuditLogs).toHaveBeenCalledWith([
        expect.objectContaining({
          action: 'CREATE_TA_ENTRY',
          targetId: VALID_ENTRY_ID,
          targetType: 'TTEntry',
        }),
      ]);
    });

    it('should return 409 when knockout has already started', async () => {
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      });
      (prisma.tTEntry.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'phase-entry-1' });

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ playerId: VALID_UUID2 }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Cannot add players after knockout stage has started', code: 'CONFLICT' },
        { status: 409 },
      );
      expect(prisma.tTEntry.createMany).not.toHaveBeenCalled();
    });

    it('should return 409 when player tries to self-register after knockout has started', async () => {
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'player-user', userType: 'player', playerId: VALID_UUID2, role: 'member' },
      });
      (prisma.tTEntry.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'phase-entry-1' });

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ playerId: VALID_UUID2 }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Cannot add players after knockout stage has started', code: 'CONFLICT' },
        { status: 409 },
      );
      expect(prisma.tTEntry.createMany).not.toHaveBeenCalled();
    });

    it('should resolve tournament slug for POST', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValueOnce({ id: VALID_UUID });
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      });
      (prisma.tTEntry.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // duplicate-detection
        .mockResolvedValueOnce([
          {
            id: VALID_ENTRY_ID,
            tournamentId: VALID_UUID,
            playerId: VALID_UUID2,
            stage: 'qualification',
            player: { nickname: 'Player' },
          },
        ]);
      (prisma.tTEntry.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      await taRoute.POST(
        new NextRequest('http://localhost:3000/api/tournaments/jsmkc2026/ta', {
          method: 'POST',
          body: JSON.stringify({ playerId: VALID_UUID2 }),
        }),
        { params: Promise.resolve({ id: 'jsmkc2026' }) },
      );

      expect(prisma.tTEntry.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([expect.objectContaining({ tournamentId: VALID_UUID })]),
        }),
      );
    });

    it.skip('should return 429 when rate limited', async () => {
      // Auth must pass before rate limit check runs for add-player action
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      });
      rateLimitMock.rateLimit.mockImplementation(() => Promise.resolve({ success: false }));

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ playerId: VALID_UUID2 }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 },
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
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Invalid') }),
        { status: 400 },
      );
    });

    it('should return 403 for add player without session auth', async () => {
      // No session — neither admin nor player authenticated
      jest.mocked(auth).mockResolvedValue(null);

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ playerId: VALID_UUID2 }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 },
      );
    });

    it('should add player with valid player session', async () => {
      // Player session — authenticated player can add themselves
      jest.mocked(auth).mockResolvedValue({
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
        .mockResolvedValueOnce([]) // duplicate-detection
        .mockResolvedValueOnce([mockEntry]); // re-fetch with player include
      (prisma.tTEntry.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ playerId: VALID_UUID2 }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: true, data: { entries: [mockEntry] }, message: 'Player(s) added to time attack' },
        { status: 201 },
      );
    });

    it('should return 403 when player tries to add another player', async () => {
      // Player session with playerId VALID_UUID2 — attempting to add a different player
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'player-user', userType: 'player', playerId: VALID_UUID2, role: 'member' },
      });

      const OTHER_PLAYER_ID = 'clxxxxxxxxxxxxxxxxotherpl';

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ playerId: OTHER_PLAYER_ID }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden: Players can only add themselves', code: 'FORBIDDEN' },
        { status: 403 },
      );
    });

    it('should return 403 when player tries to add batch with mixed player IDs', async () => {
      // Player session — attempting to add themselves AND another player in a batch
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'player-user', userType: 'player', playerId: VALID_UUID2, role: 'member' },
      });

      const OTHER_PLAYER_ID = 'clxxxxxxxxxxxxxxxxotherpl';

      await taRoute.POST(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'POST',
          body: JSON.stringify({ players: [VALID_UUID2, OTHER_PLAYER_ID] }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden: Players can only add themselves', code: 'FORBIDDEN' },
        { status: 403 },
      );
    });
  });

  // =========================================================================
  // PUT
  // =========================================================================
  describe('PUT', () => {
    it('should update a course time', async () => {
      jest.mocked(auth).mockResolvedValue({
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

      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValueOnce(existingEntry).mockResolvedValueOnce(updatedEntry);
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
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      // createSuccessResponse wraps the data in { success: true, data: ... }
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { entry: updatedEntry },
      });
    });

    it('should resolve tournament slug for PUT', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValueOnce({ id: VALID_UUID });
      jest.mocked(auth).mockResolvedValue({
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
        { params: Promise.resolve({ id: 'jsmkc2026' }) },
      );

      expect(prisma.tournament.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ id: 'jsmkc2026' }, { slug: 'jsmkc2026' }] },
        }),
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
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      const sharedLogger = loggerMock.createLogger();
      expect(sharedLogger.error).toHaveBeenCalledWith(
        'Failed to update times',
        expect.objectContaining({ tournamentId: VALID_UUID }),
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Failed to update times', code: 'INTERNAL_ERROR' },
        { status: 500 },
      );
    });

    it('should return 403 for eliminate action when user is not admin', async () => {
      jest.mocked(auth).mockResolvedValue({
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
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 },
      );
    });

    it('should return 403 for eliminate action without admin auth (null session)', async () => {
      jest.mocked(auth).mockResolvedValue(null);

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            action: 'eliminate',
            eliminated: true,
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 },
      );
    });

    it('should return 403 for update_lives action without admin auth', async () => {
      jest.mocked(auth).mockResolvedValue(null);

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            action: 'update_lives',
            livesDelta: 1,
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 },
      );
    });

    it('sets an active Phase 3 entry to an exact life total with optimistic locking', async () => {
      jest.mocked(auth).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
      const currentEntry = {
        id: VALID_ENTRY_ID,
        tournamentId: VALID_UUID,
        stage: 'phase3',
        lives: 3,
        eliminated: false,
        version: 7,
        player: { id: 'p1', nickname: 'Mario' },
      };
      const updatedEntry = { ...currentEntry, lives: 5, version: 8 };
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValueOnce(currentEntry).mockResolvedValueOnce(updatedEntry);
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(1);

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            action: 'set_lives',
            lives: 5,
            expectedVersion: 7,
            expectedLives: 3,
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: VALID_ENTRY_ID,
          details: expect.objectContaining({ oldLives: 3, newLives: 5, manualUpdate: true }),
        }),
      );
      expect(NextResponse.json).toHaveBeenCalledWith({ success: true, data: { entry: updatedEntry } });
    });

    it('requires an administrator for an exact-life adjustment', async () => {
      jest.mocked(auth).mockResolvedValue(null);

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            action: 'set_lives',
            lives: 5,
            expectedVersion: 0,
            expectedLives: 3,
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 },
      );
    });

    it.each([0, 11])('rejects an exact-life target outside the supported range (%s)', async (lives) => {
      jest.mocked(auth).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            action: 'set_lives',
            lives,
            expectedVersion: 0,
            expectedLives: 3,
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(prisma.tTEntry.findUnique).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(NextResponse.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }), {
        status: 400,
      });
    });

    it.each([
      { stage: 'phase2', eliminated: false, label: 'not in Phase 3' },
      { stage: 'phase3', eliminated: true, label: 'already eliminated' },
    ])('rejects an exact-life adjustment when the entry is $label', async ({ stage, eliminated }) => {
      jest.mocked(auth).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValueOnce({
        id: VALID_ENTRY_ID,
        tournamentId: VALID_UUID,
        stage,
        lives: 3,
        eliminated,
        version: 0,
        player: { id: 'p1', nickname: 'Mario' },
      });

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            action: 'set_lives',
            lives: 5,
            expectedVersion: 0,
            expectedLives: 3,
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(NextResponse.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CONFLICT' }), { status: 409 });
    });

    it('rejects an exact-life adjustment while Phase 3 is frozen', async () => {
      jest.mocked(auth).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValueOnce({
        id: VALID_ENTRY_ID,
        tournamentId: VALID_UUID,
        stage: 'phase3',
        lives: 3,
        eliminated: false,
        version: 0,
        player: { id: 'p1', nickname: 'Mario' },
      });
      const frozenResponse = { status: 423 };
      freezeCheckMock.checkStageFrozen.mockResolvedValueOnce(frozenResponse);

      const response = await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            action: 'set_lives',
            lives: 5,
            expectedVersion: 0,
            expectedLives: 3,
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(response).toBe(frozenResponse);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('rejects a stale exact-life adjustment instead of applying it to a newer round result', async () => {
      jest.mocked(auth).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValueOnce({
        id: VALID_ENTRY_ID,
        tournamentId: VALID_UUID,
        stage: 'phase3',
        lives: 2,
        eliminated: false,
        version: 8,
        player: { id: 'p1', nickname: 'Mario' },
      });
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(0);

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            action: 'set_lives',
            lives: 5,
            expectedVersion: 7,
            expectedLives: 2,
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(NextResponse.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'OPTIMISTIC_LOCK_ERROR' }), {
        status: 409,
      });
    });

    it('rejects exact-life adjustment for an entry in another tournament', async () => {
      jest.mocked(auth).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValueOnce({
        id: VALID_ENTRY_ID,
        tournamentId: VALID_UUID2,
        stage: 'phase3',
        lives: 3,
        eliminated: false,
        version: 0,
        player: { id: 'p1', nickname: 'Mario' },
      });

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            action: 'set_lives',
            lives: 5,
            expectedVersion: 0,
            expectedLives: 3,
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Entry not found', code: 'NOT_FOUND' },
        { status: 404 },
      );
    });

    it('rejects exact-life adjustment while a Phase 3 round is open', async () => {
      jest.mocked(auth).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValueOnce({
        id: VALID_ENTRY_ID,
        tournamentId: VALID_UUID,
        stage: 'phase3',
        lives: 3,
        eliminated: false,
        version: 0,
        player: { id: 'p1', nickname: 'Mario' },
      });
      (prisma.tTPhaseRound.findFirst as jest.Mock).mockResolvedValue({ id: 'open-round' });

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            action: 'set_lives',
            lives: 5,
            expectedVersion: 0,
            expectedLives: 3,
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(NextResponse.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CONFLICT' }), { status: 409 });
    });

    it('rejects exact-life adjustment for TA battle royale', async () => {
      jest.mocked(auth).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValueOnce({
        id: VALID_ENTRY_ID,
        tournamentId: VALID_UUID,
        stage: 'phase3',
        lives: 3,
        eliminated: false,
        version: 0,
        player: { id: 'p1', nickname: 'Mario' },
      });
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ taBattleRoyaleMode: true });

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            action: 'set_lives',
            lives: 5,
            expectedVersion: 0,
            expectedLives: 3,
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(NextResponse.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CONFLICT' }), { status: 409 });
    });

    it('should return 403 for reset_lives action without admin auth', async () => {
      jest.mocked(auth).mockResolvedValue(null);

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            action: 'reset_lives',
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 },
      );
    });

    it('should return 403 for update times without session auth', async () => {
      // No session — neither admin nor player authenticated
      jest.mocked(auth).mockResolvedValue(null);

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            times: { MC1: '1:20.000' },
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 },
      );
    });

    it('should update times with valid player session', async () => {
      // Player session — authenticated player can update their own times
      jest.mocked(auth).mockResolvedValue({
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

      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValueOnce(existingEntry).mockResolvedValueOnce(updatedEntry);
      (prisma.tTEntry.update as jest.Mock).mockResolvedValue(updatedEntry);

      await taRoute.PUT(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: VALID_ENTRY_ID,
            times: { MC2: '1:25.000' },
          }),
        }),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      // createSuccessResponse wraps the data in { success: true, data: ... }
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { entry: updatedEntry },
      });
    });

    it('should return 403 when player tries to edit qualification times after knockout starts', async () => {
      jest.mocked(auth).mockResolvedValue({
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
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'Forbidden: Qualification times can only be edited by admins after knockout starts',
          code: 'FORBIDDEN',
        },
        { status: 403 },
      );
      expect(prisma.tTEntry.update).not.toHaveBeenCalled();
    });

    it("should return 403 when player tries to update another player's times", async () => {
      // Player session with playerId 'p1' — attempting to update entry owned by 'p2'
      jest.mocked(auth).mockResolvedValue({
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
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: "Forbidden: You can only update your own or your partner's times", code: 'FORBIDDEN' },
        { status: 403 },
      );
    });
  });

  // =========================================================================
  // DELETE
  // =========================================================================
  describe('DELETE', () => {
    it('should delete an entry with admin auth', async () => {
      jest.mocked(auth).mockResolvedValue({
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
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta?entryId=${VALID_ENTRY_ID}`),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      // createSuccessResponse wraps the data in { success: true, data: ... }
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          message: 'Entry deleted successfully',
        },
      });
      expect(rankCalculationMock.rerankStageAfterDelete).toHaveBeenCalledWith(VALID_UUID, 'qualification', prisma);
      expect(rankCalculationMock.recalculateRanks).not.toHaveBeenCalled();
    });

    it('should return 403 without admin auth (null session)', async () => {
      jest.mocked(auth).mockResolvedValue(null);

      await taRoute.DELETE(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta?entryId=${VALID_ENTRY_ID}`),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 },
      );
    });

    it('should return 403 when user is not admin', async () => {
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'user-1', email: 'user@example.com', role: 'member' },
      });

      await taRoute.DELETE(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta?entryId=${VALID_ENTRY_ID}`),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 },
      );
    });

    it('should return 404 when entry not found', async () => {
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      });

      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(null);

      await taRoute.DELETE(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta?entryId=${VALID_ENTRY_ID}`),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Entry not found', code: 'NOT_FOUND' },
        { status: 404 },
      );
    });

    it('should handle database errors with 500', async () => {
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      });

      (prisma.tTEntry.findUnique as jest.Mock).mockRejectedValue(new Error('DB error'));

      await taRoute.DELETE(
        new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta?entryId=${VALID_ENTRY_ID}`),
        { params: Promise.resolve({ id: VALID_UUID }) },
      );

      const sharedLogger = loggerMock.createLogger();
      expect(sharedLogger.error).toHaveBeenCalledWith(
        'Failed to delete entry',
        expect.objectContaining({ tournamentId: VALID_UUID }),
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Failed to delete entry', code: 'INTERNAL_ERROR' },
        { status: 500 },
      );
    });
  });
});

describe('PATCH /api/tournaments/[id]/ta handicaps', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    configureNextResponseMock(NextResponse);
    rateLimitMock.getClientIdentifier.mockReturnValue('127.0.0.1');
    rateLimitMock.getUserAgent.mockReturnValue('test-agent');
    (prisma.tTEntry.findFirst as jest.Mock).mockResolvedValue(null);
    jest.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
    });
  });

  async function patch(body: unknown) {
    return taRoute.PATCH(
      new NextRequest(`http://localhost:3000/api/tournaments/${VALID_UUID}/ta`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
  }

  it('bulk-updates tournament-entry snapshots and audits old/new values', async () => {
    const current = [
      {
        id: VALID_ENTRY_ID,
        playerId: VALID_UUID2,
        taHandicapSeconds: 0,
        player: { id: VALID_UUID2, nickname: 'player' },
      },
    ];
    const updated = [{ ...current[0], taHandicapSeconds: -3 }];
    (prisma.tTEntry.findMany as jest.Mock).mockResolvedValueOnce(current).mockResolvedValueOnce(updated);
    (prisma.$executeRaw as jest.Mock).mockResolvedValue(1);
    auditLogMock.createAuditLogs.mockResolvedValue(undefined);

    await patch({
      action: 'bulk_update_handicaps',
      updates: [{ entryId: VALID_ENTRY_ID, taHandicapSeconds: -3 }],
    });

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(auditLogMock.createAuditLogs).toHaveBeenCalledWith([
      expect.objectContaining({
        targetId: VALID_ENTRY_ID,
        details: expect.objectContaining({
          oldTaHandicapSeconds: 0,
          newTaHandicapSeconds: -3,
          source: 'manual',
        }),
      }),
    ]);
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: { entries: updated } }),
    );
  });

  it('locks handicap changes once a knockout entry exists', async () => {
    (prisma.tTEntry.findFirst as jest.Mock).mockResolvedValue({ id: 'phase3-entry' });

    await patch({ action: 'update_handicap', entryId: VALID_ENTRY_ID, taHandicapSeconds: -1 });

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'TA_HANDICAP_LOCKED' }),
      { status: 409 },
    );
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects invalid handicap tiers and duplicate entry IDs', async () => {
    await patch({ action: 'update_handicap', entryId: VALID_ENTRY_ID, taHandicapSeconds: -2 });
    expect(NextResponse.json).toHaveBeenLastCalledWith(
      expect.objectContaining({ success: false, code: 'VALIDATION_ERROR' }),
      { status: 400 },
    );

    await patch({
      action: 'bulk_update_handicaps',
      updates: [
        { entryId: VALID_ENTRY_ID, taHandicapSeconds: -1 },
        { entryId: VALID_ENTRY_ID, taHandicapSeconds: -3 },
      ],
    });
    expect(NextResponse.json).toHaveBeenLastCalledWith(
      expect.objectContaining({ success: false, code: 'VALIDATION_ERROR' }),
      { status: 400 },
    );
  });

  // Player.taHandicapSeconds (the "player default" this action reset TTEntry
  // rows back to) was removed: it only ever seeded a new tournament entry
  // and never affected an already-entered player. The action was already
  // dead — no UI ever called it — and is now rejected at the schema level
  // rather than silently doing nothing meaningful.
  it('rejects the removed reset-to-player-defaults action', async () => {
    await patch({ action: 'reset_handicaps_to_player_defaults' });

    expect(NextResponse.json).toHaveBeenLastCalledWith(
      expect.objectContaining({ success: false, code: 'VALIDATION_ERROR' }),
      { status: 400 },
    );
    expect(prisma.tTEntry.findMany).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});

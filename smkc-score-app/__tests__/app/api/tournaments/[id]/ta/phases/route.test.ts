/**
 * @module Test Suite: GET /api/tournaments/[id]/ta/phases
 *
 * Tests for the TA Finals Phase API GET handler.
 * Verifies:
 * - Phase status retrieval (no phase param)
 * - Phase-specific data retrieval (with ?phase=phase3)
 * - Invalid phase parameter validation (400 response)
 * - Tournament not found handling (404 response)
 * - Password hash exclusion from player data in response
 * - Database error handling (500 response)
 *
 * Dependencies mocked:
 * - next/server: NextResponse.json mock for response assertions
 * - @/lib/prisma: Database client (via __mocks__/lib/prisma.ts)
 * - @/lib/logger: Structured logging
 * - @/lib/ta/finals-phase-manager: getPhaseStatus
 * - @/lib/ta/course-selection: getPlayedCourses, getAvailableCourses
 * - @/lib/auth: Imported by route but unused in GET handler
 * - @/lib/rate-limit: Imported by route but unused in GET handler
 * - @/lib/sanitize: Imported by route but unused in GET handler
 *
 * IMPORTANT: jest.mock() calls use the global jest (not imported from @jest/globals)
 * because babel-jest's hoisting plugin does not properly hoist jest.mock()
 * when jest is imported from @jest/globals, causing mocks to not be applied.
 */
// @ts-nocheck - This test file uses complex mock types for Next.js API routes

// Explicit mock for Prisma client — the auto-mock from __mocks__/lib/prisma.ts
// may not include tTPhaseRound on all platforms, so we define it directly.
jest.mock('@/lib/prisma', () => {
  const mockPrisma = {
    tournament: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    tTEntry: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    tTPhaseRound: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockPrisma,
    prisma: mockPrisma,
  };
});

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
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

// Mock finals-phase-manager: all exported functions
jest.mock('@/lib/ta/finals-phase-manager', () => ({
  getPhaseStatus: jest.fn(),
  promoteToPhase1: jest.fn(),
  promoteToPhase2: jest.fn(),
  promoteToPhase3: jest.fn(),
  startPhaseRound: jest.fn(),
  submitRoundResults: jest.fn(),
  cancelPhaseRound: jest.fn(),
  undoLastPhaseRound: jest.fn(),
}));

// Mock freeze-check: checkStageFrozen returns null (not frozen) by default
jest.mock('@/lib/ta/freeze-check', () => ({
  checkStageFrozen: jest.fn(),
}));

// Mock course-selection: getPlayedCourses and getAvailableCourses used by GET handler
jest.mock('@/lib/ta/course-selection', () => ({
  getPlayedCourses: jest.fn(),
  getAvailableCourses: jest.fn(),
}));

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => ({ success: true })),
  getClientIdentifier: jest.fn(() => 'test-client'),
  getUserAgent: jest.fn(() => 'test-agent'),
}));

jest.mock('@/lib/sanitize', () => ({
  sanitizeInput: jest.fn((v) => v),
}));

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
import prisma from '@/lib/prisma';
import {
  getPhaseStatus,
  promoteToPhase1,
  promoteToPhase2,
  promoteToPhase3,
  startPhaseRound,
  submitRoundResults,
  cancelPhaseRound,
  undoLastPhaseRound,
} from '@/lib/ta/finals-phase-manager';
import { getPlayedCourses, getAvailableCourses } from '@/lib/ta/course-selection';
import { checkStageFrozen } from '@/lib/ta/freeze-check';
import { auth } from '@/lib/auth';
import * as phasesRoute from '@/app/api/tournaments/[id]/ta/phases/route';

const { NextResponse } = jest.requireMock('next/server');

// Logger mock reference for verifying error logging
const loggerMock = jest.requireMock('@/lib/logger');
const loggerInstance = loggerMock.createLogger('initial');

describe('GET /api/tournaments/[id]/ta/phases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-establish logger mock return value after clearAllMocks
    loggerMock.createLogger.mockReturnValue(loggerInstance);
  });

  const mockParams = Promise.resolve({ id: 'tournament-1' });

  /**
   * Helper: create a GET request with optional query params.
   */
  function createRequest(queryString = '') {
    return new NextRequest(
      `http://localhost:3000/api/tournaments/tournament-1/ta/phases${queryString}`
    );
  }

  /** Default mock phase status returned by getPhaseStatus */
  const defaultPhaseStatus = {
    phase1: null,
    phase2: null,
    phase3: { total: 4, active: 4, eliminated: 0, winner: null },
    currentPhase: 'phase3',
  };

  /**
   * Mock entry without password field (simulates Prisma omit: { password: true }).
   * The password field should NOT appear in API responses.
   */
  const mockEntries = [
    {
      id: 'entry-1',
      tournamentId: 'tournament-1',
      playerId: 'player-1',
      stage: 'phase3',
      lives: 3,
      eliminated: false,
      times: { MC1: '1:03.000' },
      totalTime: 63000,
      rank: 1,
      courseScores: null,
      qualificationPoints: null,
      deletedAt: null,
      version: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      player: {
        id: 'player-1',
        name: 'Test Player',
        nickname: 'test-player',
        country: null,
        // NOTE: no password field — Prisma omit removes it
        deletedAt: null,
        version: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        userId: null,
      },
    },
  ];

  describe('Tournament validation', () => {
    it('should return 404 when tournament does not exist', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

      await phasesRoute.GET(createRequest(), { params: mockParams });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Tournament not found' }),
        { status: 404 }
      );
    });
  });

  describe('Phase parameter validation', () => {
    it('should return 400 for invalid phase parameter', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 'tournament-1' });

      await phasesRoute.GET(createRequest('?phase=invalid'), { params: mockParams });

      // handleValidationError includes code: 'VALIDATION_ERROR'
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid phase parameter. Must be one of: phase1, phase2, phase3',
          code: 'VALIDATION_ERROR',
        }),
        { status: 400 }
      );
    });

    it('should return 400 for numeric phase parameter', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 'tournament-1' });

      await phasesRoute.GET(createRequest('?phase=3'), { params: mockParams });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid phase parameter. Must be one of: phase1, phase2, phase3',
          code: 'VALIDATION_ERROR',
        }),
        { status: 400 }
      );
    });
  });

  describe('No phase parameter', () => {
    it('should return phaseStatus only when no phase param is provided', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 'tournament-1' });
      (getPhaseStatus as jest.Mock).mockResolvedValue(defaultPhaseStatus);

      await phasesRoute.GET(createRequest(), { params: mockParams });

      // createSuccessResponse wraps { phaseStatus } in { success: true, data: { phaseStatus } }
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          phaseStatus: defaultPhaseStatus,
        },
      });
      // Should NOT query entries or rounds when no phase is specified
      expect(prisma.tTEntry.findMany).not.toHaveBeenCalled();
      expect(prisma.tTPhaseRound.findMany).not.toHaveBeenCalled();
    });
  });

  describe('Valid phase parameter (phase3)', () => {
    beforeEach(() => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 'tournament-1' });
      (getPhaseStatus as jest.Mock).mockResolvedValue(defaultPhaseStatus);
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);
      (prisma.tTPhaseRound.findMany as jest.Mock).mockResolvedValue([]);
      (getPlayedCourses as jest.Mock).mockResolvedValue([]);
      (getAvailableCourses as jest.Mock).mockReturnValue([
        'MC1', 'DP1', 'GV1', 'BC1', 'MC2', 'DP2', 'GV2', 'BC2',
        'MC3', 'DP3', 'GV3', 'BC3', 'CI1', 'CI2', 'RR', 'VL1',
        'VL2', 'KD', 'MC4', 'KB1',
      ]);
    });

    it('should return entries, rounds, and courses for a valid phase', async () => {
      await phasesRoute.GET(createRequest('?phase=phase3'), { params: mockParams });

      // createSuccessResponse wraps the response in { success: true, data: ... }
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            phaseStatus: defaultPhaseStatus,
            entries: mockEntries,
            rounds: [],
            availableCourses: expect.arrayContaining(['MC1', 'DP1']),
            playedCourses: [],
          }),
        })
      );
    });

    it('should query entries with correct phase filter', async () => {
      await phasesRoute.GET(createRequest('?phase=phase3'), { params: mockParams });

      expect(prisma.tTEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tournamentId: 'tournament-1', stage: 'phase3' },
        })
      );
    });

    it('should query rounds with correct phase filter', async () => {
      await phasesRoute.GET(createRequest('?phase=phase3'), { params: mockParams });

      expect(prisma.tTPhaseRound.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tournamentId: 'tournament-1', phase: 'phase3' },
        })
      );
    });

    it('should pass phase to getPlayedCourses', async () => {
      await phasesRoute.GET(createRequest('?phase=phase3'), { params: mockParams });

      expect(getPlayedCourses).toHaveBeenCalledWith(
        prisma,
        'tournament-1',
        'phase3'
      );
    });

    it('should include player relation in query (password globally omitted via lib/prisma.ts)', async () => {
      await phasesRoute.GET(createRequest('?phase=phase3'), { params: mockParams });

      // Player.password is globally omitted via PrismaClient config in lib/prisma.ts,
      // so a plain `include: { player: true }` is sufficient — no per-query omit needed.
      expect(prisma.tTEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { player: true },
        })
      );
    });

    it('should not include password field in response entries', async () => {
      await phasesRoute.GET(createRequest('?phase=phase3'), { params: mockParams });

      // createSuccessResponse wraps data in { success: true, data: { entries, ... } }
      const call = NextResponse.json.mock.calls[0][0];
      for (const entry of call.data.entries) {
        expect(entry.player).not.toHaveProperty('password');
      }
    });
  });

  describe('Phase 1 and Phase 2 parameters', () => {
    beforeEach(() => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 'tournament-1' });
      (getPhaseStatus as jest.Mock).mockResolvedValue(defaultPhaseStatus);
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.tTPhaseRound.findMany as jest.Mock).mockResolvedValue([]);
      (getPlayedCourses as jest.Mock).mockResolvedValue([]);
      (getAvailableCourses as jest.Mock).mockReturnValue([]);
    });

    it('should accept phase1 as a valid parameter', async () => {
      await phasesRoute.GET(createRequest('?phase=phase1'), { params: mockParams });

      expect(prisma.tTEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tournamentId: 'tournament-1', stage: 'phase1' },
        })
      );
    });

    it('should accept phase2 as a valid parameter', async () => {
      await phasesRoute.GET(createRequest('?phase=phase2'), { params: mockParams });

      expect(prisma.tTEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tournamentId: 'tournament-1', stage: 'phase2' },
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should return 500 and log error on database failure', async () => {
      const dbError = new Error('Database connection lost');
      (prisma.tournament.findUnique as jest.Mock).mockRejectedValue(dbError);

      await phasesRoute.GET(createRequest(), { params: mockParams });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Internal server error' }),
        { status: 500 }
      );
      expect(loggerInstance.error).toHaveBeenCalledWith(
        'Failed to fetch phase data',
        expect.objectContaining({
          error: 'Database connection lost',
        })
      );
    });

    it('should return 500 when getPhaseStatus throws', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 'tournament-1' });
      (getPhaseStatus as jest.Mock).mockRejectedValue(new Error('Phase query failed'));

      await phasesRoute.GET(createRequest(), { params: mockParams });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Internal server error' }),
        { status: 500 }
      );
    });

    it('should return 500 when entry query throws', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 'tournament-1' });
      (getPhaseStatus as jest.Mock).mockResolvedValue(defaultPhaseStatus);
      (prisma.tTEntry.findMany as jest.Mock).mockRejectedValue(new Error('Entry query failed'));

      await phasesRoute.GET(createRequest('?phase=phase3'), { params: mockParams });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Internal server error' }),
        { status: 500 }
      );
    });

    it('should return 500 when round history query throws', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 'tournament-1' });
      (getPhaseStatus as jest.Mock).mockResolvedValue(defaultPhaseStatus);
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.tTPhaseRound.findMany as jest.Mock).mockRejectedValue(
        new Error('Round query failed')
      );

      await phasesRoute.GET(createRequest('?phase=phase3'), { params: mockParams });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Internal server error' }),
        { status: 500 }
      );
    });

    it('should return 500 when getPlayedCourses throws', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 'tournament-1' });
      (getPhaseStatus as jest.Mock).mockResolvedValue(defaultPhaseStatus);
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.tTPhaseRound.findMany as jest.Mock).mockResolvedValue([]);
      (getPlayedCourses as jest.Mock).mockRejectedValue(
        new Error('Course query failed')
      );

      await phasesRoute.GET(createRequest('?phase=phase3'), { params: mockParams });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Internal server error' }),
        { status: 500 }
      );
    });
  });
});

describe('POST /api/tournaments/[id]/ta/phases', () => {
  const mockParams = Promise.resolve({ id: 'tournament-1' });

  /**
   * Helper: create a POST request with a JSON body.
   */
  function createPostRequest(body: unknown) {
    return new NextRequest('http://localhost:3000/api/tournaments/tournament-1/ta/phases', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /** Admin session fixture */
  const adminSession = {
    user: { id: 'admin-user-1', role: 'admin' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    loggerMock.createLogger.mockReturnValue(loggerInstance);
    // Default: authenticated as admin
    (auth as jest.Mock).mockResolvedValue(adminSession);
    // Default: tournament exists
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 'tournament-1' });
    // Default: phase not frozen
    (checkStageFrozen as jest.Mock).mockResolvedValue(null);
  });

  it('should return 403 when not authenticated', async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    await phasesRoute.POST(createPostRequest({ action: 'promote_phase1' }), { params: mockParams });

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Forbidden', code: 'FORBIDDEN' }),
      { status: 403 }
    );
  });

  it('should return 403 when authenticated but not admin', async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1', role: 'user' } });

    await phasesRoute.POST(createPostRequest({ action: 'promote_phase1' }), { params: mockParams });

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Forbidden', code: 'FORBIDDEN' }),
      { status: 403 }
    );
  });

  it('should return 400 for invalid action', async () => {
    await phasesRoute.POST(createPostRequest({ action: 'invalid_action' }), { params: mockParams });

    // handleValidationError includes code: 'VALIDATION_ERROR'
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Invalid request', code: 'VALIDATION_ERROR' }),
      { status: 400 }
    );
  });

  it('should return 404 when tournament not found', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

    await phasesRoute.POST(createPostRequest({ action: 'promote_phase1' }), { params: mockParams });

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Tournament not found' }),
      { status: 404 }
    );
  });

  it('should call promoteToPhase1 and return success', async () => {
    (promoteToPhase1 as jest.Mock).mockResolvedValue({ promoted: 8 });

    await phasesRoute.POST(createPostRequest({ action: 'promote_phase1' }), { params: mockParams });

    expect(promoteToPhase1).toHaveBeenCalledWith(prisma, expect.objectContaining({ tournamentId: 'tournament-1' }));
    // createSuccessResponse wraps in { success: true, data: { promoted: 8 } }
    expect(NextResponse.json).toHaveBeenCalledWith({ success: true, data: { promoted: 8 } });
  });

  it('should call promoteToPhase2 and return success', async () => {
    (promoteToPhase2 as jest.Mock).mockResolvedValue({ promoted: 8 });

    await phasesRoute.POST(createPostRequest({ action: 'promote_phase2' }), { params: mockParams });

    expect(promoteToPhase2).toHaveBeenCalledWith(prisma, expect.objectContaining({ tournamentId: 'tournament-1' }));
    expect(NextResponse.json).toHaveBeenCalledWith({ success: true, data: { promoted: 8 } });
  });

  it('should call promoteToPhase3 and return success', async () => {
    (promoteToPhase3 as jest.Mock).mockResolvedValue({ promoted: 16 });

    await phasesRoute.POST(createPostRequest({ action: 'promote_phase3' }), { params: mockParams });

    expect(promoteToPhase3).toHaveBeenCalledWith(prisma, expect.objectContaining({ tournamentId: 'tournament-1' }));
    expect(NextResponse.json).toHaveBeenCalledWith({ success: true, data: { promoted: 16 } });
  });

  it('should call startPhaseRound and return success', async () => {
    (startPhaseRound as jest.Mock).mockResolvedValue({ roundNumber: 1, course: 'MC1' });

    await phasesRoute.POST(createPostRequest({ action: 'start_round', phase: 'phase1' }), { params: mockParams });

    expect(checkStageFrozen).toHaveBeenCalledWith(prisma, 'tournament-1', 'phase1');
    expect(startPhaseRound).toHaveBeenCalledWith(prisma, expect.objectContaining({ tournamentId: 'tournament-1' }), 'phase1');
    expect(NextResponse.json).toHaveBeenCalledWith({ success: true, data: { roundNumber: 1, course: 'MC1' } });
  });

  it('should return freeze error when phase is frozen for start_round', async () => {
    // Return a non-null truthy object to simulate a frozen response.
    // NextResponse.json is mocked and returns undefined, so we need a real-looking object.
    const frozenResponse = { status: 423, body: { success: false, error: 'Phase is frozen' } };
    (checkStageFrozen as jest.Mock).mockResolvedValue(frozenResponse);

    await phasesRoute.POST(createPostRequest({ action: 'start_round', phase: 'phase1' }), { params: mockParams });

    expect(startPhaseRound).not.toHaveBeenCalled();
  });

  it('should call cancelPhaseRound and return success', async () => {
    (cancelPhaseRound as jest.Mock).mockResolvedValue({ cancelled: true, roundNumber: 3 });

    await phasesRoute.POST(
      createPostRequest({ action: 'cancel_round', phase: 'phase2', roundNumber: 3 }),
      { params: mockParams }
    );

    expect(checkStageFrozen).toHaveBeenCalledWith(prisma, 'tournament-1', 'phase2');
    expect(cancelPhaseRound).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ tournamentId: 'tournament-1' }),
      'phase2',
      3
    );
    expect(NextResponse.json).toHaveBeenCalledWith({ success: true, data: { cancelled: true, roundNumber: 3 } });
  });

  it('should call undoLastPhaseRound and return success', async () => {
    (undoLastPhaseRound as jest.Mock).mockResolvedValue({ undoneRoundNumber: 5 });

    await phasesRoute.POST(
      createPostRequest({ action: 'undo_round', phase: 'phase3' }),
      { params: mockParams }
    );

    expect(checkStageFrozen).toHaveBeenCalledWith(prisma, 'tournament-1', 'phase3');
    expect(undoLastPhaseRound).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ tournamentId: 'tournament-1' }),
      'phase3'
    );
    expect(NextResponse.json).toHaveBeenCalledWith({ success: true, data: { undoneRoundNumber: 5 } });
  });

  it('should return 400 with business error when undoLastPhaseRound throws "No submitted rounds"', async () => {
    (undoLastPhaseRound as jest.Mock).mockRejectedValue(new Error('No submitted rounds found for phase3'));

    await phasesRoute.POST(
      createPostRequest({ action: 'undo_round', phase: 'phase3' }),
      { params: mockParams }
    );

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'No submitted rounds found for phase3' }),
      { status: 400 }
    );
  });

  it('should return 400 for invalid phase in start_round', async () => {
    await phasesRoute.POST(
      createPostRequest({ action: 'start_round', phase: 'invalid_phase' }),
      { params: mockParams }
    );

    // handleValidationError includes code: 'VALIDATION_ERROR'
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Invalid request', code: 'VALIDATION_ERROR' }),
      { status: 400 }
    );
  });

  it('should call submitRoundResults and return success', async () => {
    (submitRoundResults as jest.Mock).mockResolvedValue({ eliminated: ['player-1'] });
    const body = {
      action: 'submit_results',
      phase: 'phase1',
      roundNumber: 1,
      results: [
        { playerId: 'claaaaaaaaaaaaaaaaaaaaaaaaaa', timeMs: 63000 },
        { playerId: 'clbbbbbbbbbbbbbbbbbbbbbbbbbb', timeMs: 65000 },
      ],
    };

    await phasesRoute.POST(createPostRequest(body), { params: mockParams });

    expect(checkStageFrozen).toHaveBeenCalledWith(prisma, 'tournament-1', 'phase1');
    expect(submitRoundResults).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ tournamentId: 'tournament-1' }),
      'phase1',
      1,
      body.results
    );
    expect(NextResponse.json).toHaveBeenCalledWith({ success: true, data: { eliminated: ['player-1'] } });
  });

  it('should return 500 for unexpected errors', async () => {
    (promoteToPhase1 as jest.Mock).mockRejectedValue(new Error('DB connection lost'));

    await phasesRoute.POST(createPostRequest({ action: 'promote_phase1' }), { params: mockParams });

    expect(NextResponse.json).toHaveBeenCalledWith(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  });
});

/**
 * Unit tests for GET /api/tournaments/[id]/overlay-events.
 *
 * overlay-events route:
 * - Returns 404 when tournament is not found (TC-2482)
 * - Returns 500 and logs error on unexpected database failure (TC-2483)
 * - Returns empty events with Cache-Control: no-store on early-return path
 *   (latestChange ≤ since — nothing changed) (TC-2484)
 * - Returns built events with Cache-Control: no-store on full-build path
 *   (latestChange > since — something changed) (TC-2485)
 * - Skips early-return path and runs full build when initial=1 (TC-2486)
 * - invalidateOverlayProbe removes the probe cache entry for a tournament (TC-2487)
 */

// Prisma mock: factory must be self-contained because jest.mock is hoisted.
// Access the mock instance via jest.requireMock('@/lib/prisma').default.
jest.mock('@/lib/prisma', () => {
  const makeMethods = () => ({
    aggregate: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  });
  return {
    __esModule: true,
    default: {
      bMMatch: makeMethods(),
      mRMatch: makeMethods(),
      gPMatch: makeMethods(),
      tTEntry: makeMethods(),
      tTPhaseRound: makeMethods(),
      scoreEntryLog: { aggregate: jest.fn(), findMany: jest.fn() },
      tournamentPlayerScore: { aggregate: jest.fn() },
    },
  };
});

jest.mock('@/lib/logger', () => {
  const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
  return { createLogger: jest.fn(() => logger) };
});

jest.mock('@/lib/tournament-identifier', () => ({
  resolveTournament: jest.fn(),
}));

jest.mock('@/lib/overlay/events', () => ({
  buildOverlayEvents: jest.fn(),
}));

jest.mock('@/lib/overlay/phase', () => ({
  computeCurrentPhase: jest.fn(),
  computeCurrentPhaseFormat: jest.fn(),
}));

jest.mock('@/lib/overlay/layout', () => ({
  normalizeOverlayBroadcastLayout: jest.fn(),
}));

// withApiTiming is a thin passthrough when PERF_LOG is unset; mock to avoid
// pulling in query-counter and its AsyncLocalStorage dependency.
jest.mock('@/lib/perf/api-timing', () => ({
  withApiTiming: jest.fn((_name: string, fn: () => unknown) => fn()),
}));

// NextResponse must be a class (not a plain object) so that the route's
// `response instanceof NextResponse` guard evaluates to true rather than
// throwing "Right-hand side of instanceof must be callable".
jest.mock('next/server', () => {
  class NextResponseMock {
    data: unknown;
    status: number;
    headers: {
      set: (k: string, v: string) => void;
      get: (k: string) => string | undefined;
      _store: Record<string, string>;
    };
    constructor(body: unknown, options?: { status?: number }) {
      this.data = body;
      this.status = options?.status ?? 200;
      const h: Record<string, string> = {};
      this.headers = {
        set: (k, v) => {
          h[k] = v;
        },
        get: (k) => h[k],
        _store: h,
      };
    }
  }
  (NextResponseMock as unknown as { json: jest.Mock }).json = jest.fn(
    (body: unknown, options?: { status?: number }) => new NextResponseMock(body, options),
  );
  return { NextResponse: NextResponseMock, NextRequest: jest.fn() };
});

import { resolveTournament } from '@/lib/tournament-identifier';
import { buildOverlayEvents } from '@/lib/overlay/events';
import { computeCurrentPhase, computeCurrentPhaseFormat } from '@/lib/overlay/phase';
import { normalizeOverlayBroadcastLayout, DEFAULT_OVERLAY_BROADCAST_LAYOUT } from '@/lib/overlay/layout';
import { GET, invalidateOverlayProbe } from '@/app/api/tournaments/[id]/overlay-events/route';
import { createLogger } from '@/lib/logger';

/** Response shape returned by our NextResponseMock (not the real NextResponse). */
type MockResponse = {
  data: { success: boolean; data: Record<string, unknown> };
  status: number;
  headers: { get: (k: string) => string | undefined };
};

const mockResolveTournament = jest.mocked(resolveTournament);
const mockBuildOverlayEvents = jest.mocked(buildOverlayEvents);
const mockComputeCurrentPhase = jest.mocked(computeCurrentPhase);
const mockComputeCurrentPhaseFormat = jest.mocked(computeCurrentPhaseFormat);
const mockNormalizeLayout = jest.mocked(normalizeOverlayBroadcastLayout);
// Access prisma mock instance created inside jest.mock factory.
const mockPrisma = jest.requireMock('@/lib/prisma').default;

/** Build a minimal tournament fixture with overlay fields. */
function makeTournament(id = 'tournament-1') {
  return {
    id,
    bmQualificationConfirmed: false,
    mrQualificationConfirmed: false,
    gpQualificationConfirmed: false,
    qualificationConfirmedAt: null,
    overlayPlayer1Name: 'Player1',
    overlayPlayer2Name: 'Player2',
    overlayPlayer1NoCamera: false,
    overlayPlayer2NoCamera: false,
    overlayMatchLabel: null,
    overlayPlayer1Wins: null,
    overlayPlayer2Wins: null,
    overlayMatchFt: null,
    overlayLayout: DEFAULT_OVERLAY_BROADCAST_LAYOUT,
  };
}

/** Build a NextRequest stub with optional search params. */
function makeRequest(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return {
    nextUrl: { searchParams: new URLSearchParams(qs) },
  } as unknown as import('next/server').NextRequest;
}

function makeParams(id = 'tournament-1') {
  return { params: Promise.resolve({ id }) };
}

/** Stub all aggregate queries to return the given `at` timestamp. */
function stubAggregatesAt(at: Date) {
  const result = { _max: { updatedAt: at, createdAt: at, submittedAt: at, timestamp: at } };
  mockPrisma.bMMatch.aggregate.mockResolvedValue(result);
  mockPrisma.mRMatch.aggregate.mockResolvedValue(result);
  mockPrisma.gPMatch.aggregate.mockResolvedValue(result);
  mockPrisma.tTEntry.aggregate.mockResolvedValue(result);
  mockPrisma.tTPhaseRound.aggregate.mockResolvedValue(result);
  mockPrisma.scoreEntryLog.aggregate.mockResolvedValue(result);
  mockPrisma.tournamentPlayerScore.aggregate.mockResolvedValue(result);
}

/** Stub readCurrentPhaseInput helpers to all return null (qualification phase). */
function stubPhaseInputEmpty() {
  mockPrisma.bMMatch.findFirst.mockResolvedValue(null);
  mockPrisma.mRMatch.findFirst.mockResolvedValue(null);
  mockPrisma.gPMatch.findFirst.mockResolvedValue(null);
  mockPrisma.tTEntry.findFirst.mockResolvedValue(null);
  mockPrisma.tTPhaseRound.findFirst.mockResolvedValue(null);
}

/** Stub findMany to return empty arrays. */
function stubFindManyEmpty() {
  mockPrisma.bMMatch.findMany.mockResolvedValue([]);
  mockPrisma.mRMatch.findMany.mockResolvedValue([]);
  mockPrisma.gPMatch.findMany.mockResolvedValue([]);
  mockPrisma.tTEntry.findMany.mockResolvedValue([]);
  mockPrisma.tTPhaseRound.findMany.mockResolvedValue([]);
  mockPrisma.scoreEntryLog.findMany.mockResolvedValue([]);
  mockPrisma.tournamentPlayerScore.aggregate.mockResolvedValue({ _max: { updatedAt: null } });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockComputeCurrentPhase.mockReturnValue('qualification');
  mockComputeCurrentPhaseFormat.mockReturnValue(null);
  mockNormalizeLayout.mockReturnValue(DEFAULT_OVERLAY_BROADCAST_LAYOUT);
  mockBuildOverlayEvents.mockReturnValue([]);
});

describe('GET /api/tournaments/[id]/overlay-events', () => {
  describe('TC-2482: 404 when tournament not found', () => {
    it('returns 404 when resolveTournament returns null', async () => {
      mockResolveTournament.mockResolvedValue(null);
      const res = (await GET(makeRequest(), makeParams('unknown-id'))) as unknown as MockResponse;
      expect(res.status).toBe(404);
      expect(res.data).toMatchObject({ success: false });
    });
  });

  describe('TC-2483: 500 on unexpected error', () => {
    it('returns 500 and logs error when resolveTournament throws', async () => {
      mockResolveTournament.mockRejectedValue(new Error('DB connection failed'));
      const res = (await GET(makeRequest(), makeParams())) as unknown as MockResponse;
      expect(res.status).toBe(500);
      const logger = createLogger('overlay-events-api');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to build overlay events',
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });
  });

  describe('TC-2484: early-return path when nothing changed since `since`', () => {
    it('returns empty events and currentPhase when latestChange ≤ since', async () => {
      // Use a unique tournament ID to avoid probe cache from previous tests.
      const id = 'early-return-tc-2484';
      mockResolveTournament.mockResolvedValue(makeTournament(id));

      // All aggregate timestamps are 2 hours ago; since = 1 hour ago → no change.
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      stubAggregatesAt(twoHoursAgo);
      stubPhaseInputEmpty();

      // since = 1 hour ago (passed as query param)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const res = (await GET(makeRequest({ since: oneHourAgo }), makeParams(id))) as unknown as MockResponse;

      expect(res.status).toBe(200);
      // Empty events returned on early-return path
      expect(res.data.data.events).toEqual([]);
      expect(res.data.data.currentPhase).toBe('qualification');
      // buildOverlayEvents must NOT be called on early-return path
      expect(mockBuildOverlayEvents).not.toHaveBeenCalled();
    });
  });

  describe('TC-2485 / TC-2555: full-build path returns events with Cache-Control: no-store', () => {
    it('does not pass a legacy BREAK score report to the event builder', async () => {
      const id = 'break-score-log-tc-3032';
      mockResolveTournament.mockResolvedValue(makeTournament(id));
      const now = new Date();
      stubAggregatesAt(now);
      stubPhaseInputEmpty();
      stubFindManyEmpty();
      mockPrisma.gPMatch.findMany.mockResolvedValue([{ id: 'break-1', isBye: true }]);
      mockPrisma.scoreEntryLog.findMany.mockResolvedValue([
        { id: 'log-break', matchId: 'break-1', matchType: 'GP', timestamp: now, player: { nickname: 'Player' } },
      ]);

      await GET(makeRequest({ since: new Date(now.getTime() - 60_000).toISOString() }), makeParams(id));

      expect(mockBuildOverlayEvents).toHaveBeenCalledWith(expect.objectContaining({ scoreLogs: [], gpMatches: [] }));
    });

    it('returns events from buildOverlayEvents when latestChange > since', async () => {
      const id = 'full-build-tc-2485';
      mockResolveTournament.mockResolvedValue(makeTournament(id));
      mockBuildOverlayEvents.mockReturnValue([
        { id: 'evt-1', type: 'score_reported', title: 'Score', timestamp: new Date().toISOString() },
      ]);

      // Aggregate returns a timestamp from NOW (after since = 1 hour ago).
      const now = new Date();
      stubAggregatesAt(now);
      stubPhaseInputEmpty();
      stubFindManyEmpty();
      // findFirst for earliestFinals (bMMatch)
      mockPrisma.bMMatch.findFirst.mockResolvedValue(null);

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const res = (await GET(makeRequest({ since: oneHourAgo }), makeParams(id))) as unknown as MockResponse;

      expect(res.status).toBe(200);
      expect(res.data.data.events as unknown[]).toHaveLength(1);
      expect(mockBuildOverlayEvents).toHaveBeenCalled();
    });

    it('sets Cache-Control: no-store on success response', async () => {
      const id = 'cache-control-tc-2485';
      mockResolveTournament.mockResolvedValue(makeTournament(id));

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      stubAggregatesAt(twoHoursAgo);
      stubPhaseInputEmpty();

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const res = (await GET(makeRequest({ since: oneHourAgo }), makeParams(id))) as unknown as MockResponse;

      // Cache-Control: no-store must be set to prevent browser caching of
      // time-sensitive overlay poll responses.
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    });
  });

  describe('TC-2486: initial=1 bypasses early-return and runs full build', () => {
    it('calls buildOverlayEvents even when latestChange ≤ since when initial=1', async () => {
      const id = 'initial-tc-2486';
      mockResolveTournament.mockResolvedValue(makeTournament(id));
      mockBuildOverlayEvents.mockReturnValue([]);

      // Aggregate timestamps are very old (early-return would trigger without initial=1).
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      stubAggregatesAt(twoHoursAgo);
      stubPhaseInputEmpty();
      stubFindManyEmpty();
      mockPrisma.bMMatch.findFirst.mockResolvedValue(null);

      // initial=1 is the key; since is omitted (initial window auto-computed)
      const res = (await GET(makeRequest({ initial: '1' }), makeParams(id))) as unknown as MockResponse;

      expect(res.status).toBe(200);
      // buildOverlayEvents MUST be called on initial=1 path even with no recent changes.
      expect(mockBuildOverlayEvents).toHaveBeenCalled();
    });
  });

  describe('TC-2487: invalidateOverlayProbe removes probe cache entry', () => {
    it('invalidates the probe cache, causing the next GET to re-query aggregates', async () => {
      const id = 'probe-invalidation-tc-2487';
      mockResolveTournament.mockResolvedValue(makeTournament(id));
      // Timestamps 2 hours ago: the early-return path fires (since = 1h ago > latest).
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      stubAggregatesAt(twoHoursAgo);
      stubPhaseInputEmpty();

      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // First GET populates the probe cache (runs the 7 aggregate queries).
      await GET(makeRequest({ since }), makeParams(id));
      const callsAfterFirstGet = (mockPrisma.bMMatch.aggregate as jest.Mock).mock.calls.length;

      // Second GET within TTL reuses the cached probe: no additional aggregate calls.
      await GET(makeRequest({ since }), makeParams(id));
      expect((mockPrisma.bMMatch.aggregate as jest.Mock).mock.calls.length).toBe(callsAfterFirstGet);

      // Invalidate the probe cache entry for this tournament.
      invalidateOverlayProbe(id);

      // Third GET must re-run aggregate queries because the probe entry was deleted.
      await GET(makeRequest({ since }), makeParams(id));
      expect((mockPrisma.bMMatch.aggregate as jest.Mock).mock.calls.length).toBeGreaterThan(callsAfterFirstGet);
    });
  });
});

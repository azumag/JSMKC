// @ts-nocheck — mirrors mock-typing pattern from other API route tests.
// Validates the security/lock/skip boundaries of the debug-fill handler:
//   - non-admin → 403 FORBIDDEN
//   - admin + tournament.debugMode === false → 403 DEBUG_MODE_DISABLED
//   - admin + debugMode + per-mode confirmed flag set → 409 QUALIFICATION_LOCKED
//   - already-completed matches are skipped, not refilled
//   - bye matches are skipped, not refilled
//   - audit log entry is written on success

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/audit-log');
jest.mock('@/lib/tournament-identifier', () => ({
  resolveTournamentId: jest.fn(async (id: string) => id),
}));
jest.mock('@/lib/standings-cache', () => ({
  invalidate: jest.fn(async () => undefined),
}));
jest.mock('@/lib/points/overall-ranking', () => ({
  invalidateOverallRankingsCache: jest.fn(),
}));
jest.mock('@/lib/ta/rank-calculation', () => ({
  recalculateRanks: jest.fn(async () => undefined),
}));
// `getServerSideIdentifier` calls `next/headers` which throws outside a real
// request scope; stub it so the audit-log try-block actually executes.
jest.mock('@/lib/request-utils', () => ({
  getServerSideIdentifier: jest.fn(async () => '127.0.0.1'),
  getClientIdentifier: jest.fn(() => '127.0.0.1'),
  getUserAgent: jest.fn(() => 'jest'),
}));

import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { handleDebugFillRequest } from '@/lib/debug/debug-fill';

const auditLogMock = jest.requireMock('@/lib/audit-log');

function makeRequest(): { headers: Headers } {
  return { headers: new Headers({ 'user-agent': 'jest' }) };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('handleDebugFillRequest — auth & debugMode gates', () => {
  it('returns 403 FORBIDDEN when caller is not admin', async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'p1', role: 'player' } });

    const res = await handleDebugFillRequest('t-1', 'bm', makeRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
    // Must not have touched the DB if auth failed
    expect((prisma.tournament.findUnique as jest.Mock)).not.toHaveBeenCalled();
  });

  it('returns 403 DEBUG_MODE_DISABLED when tournament.debugMode is false', async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({
      id: 't-1',
      debugMode: false,
    });

    const res = await handleDebugFillRequest('t-1', 'bm', makeRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('DEBUG_MODE_DISABLED');
    // Should not have queried any matches
    expect((prisma.bMMatch.findMany as jest.Mock)).not.toHaveBeenCalled();
  });

  it('returns 404 when tournament does not exist', async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await handleDebugFillRequest('missing', 'bm', makeRequest());
    expect(res.status).toBe(404);
  });
});

describe('handleDebugFillRequest — lock & skip behaviour (BM)', () => {
  beforeEach(() => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
  });

  it('returns 409 QUALIFICATION_LOCKED when bmQualificationConfirmed is true', async () => {
    (prisma.tournament.findUnique as jest.Mock)
      // First call: guard — debugMode check
      .mockResolvedValueOnce({ id: 't-1', debugMode: true })
      // Second call: per-mode confirmed-lock check inside fillBMScores
      .mockResolvedValueOnce({ bmQualificationConfirmed: true });

    const res = await handleDebugFillRequest('t-1', 'bm', makeRequest());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('QUALIFICATION_LOCKED');
    expect((prisma.bMMatch.update as jest.Mock)).not.toHaveBeenCalled();
  });

  it('skips bye and completed matches, fills only the empty ones', async () => {
    (prisma.tournament.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 't-1', debugMode: true })
      .mockResolvedValueOnce({ bmQualificationConfirmed: false });

    (prisma.bMMatch.findMany as jest.Mock)
      // First call: list of qualification matches
      .mockResolvedValueOnce([
        { id: 'm-bye', completed: true, isBye: true },
        { id: 'm-done', completed: true, isBye: false },
        { id: 'm-empty-1', completed: false, isBye: false },
        { id: 'm-empty-2', completed: false, isBye: false },
      ])
      // Second call (recalc): all completed (after the fill)
      .mockResolvedValueOnce([]);

    const res = await handleDebugFillRequest('t-1', 'bm', makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ filled: 2, skipped: 2, total: 4, mode: 'bm' });

    const updateMock = prisma.bMMatch.update as jest.Mock;
    expect(updateMock).toHaveBeenCalledTimes(2);
    // Verify only the two empty matches were updated
    const updatedIds = updateMock.mock.calls.map((c: any[]) => c[0].where.id).sort();
    expect(updatedIds).toEqual(['m-empty-1', 'm-empty-2']);
    // Each update must produce a sum of TOTAL_BM_ROUNDS = 4
    for (const call of updateMock.mock.calls) {
      const { score1, score2, completed } = call[0].data;
      expect(score1 + score2).toBe(4);
      expect(completed).toBe(true);
    }

    // Audit log was written exactly once with the right action + mode
    expect(auditLogMock.createAuditLog).toHaveBeenCalledTimes(1);
    expect(auditLogMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DEBUG_FILL_SCORES',
        targetType: 'Tournament',
        targetId: 't-1',
        details: expect.objectContaining({ mode: 'bm', filled: 2, skipped: 2 }),
      }),
    );
  });

  it('does not call recalc when zero matches were filled (all skipped)', async () => {
    (prisma.tournament.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 't-1', debugMode: true })
      .mockResolvedValueOnce({ bmQualificationConfirmed: false });

    (prisma.bMMatch.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'm-1', completed: true, isBye: false },
    ]);

    const res = await handleDebugFillRequest('t-1', 'bm', makeRequest());
    expect(res.status).toBe(200);

    // recalc2PStandings would query bMMatch.findMany a second time. With
    // filled=0 it should be skipped → only the initial fetch happened.
    expect((prisma.bMMatch.findMany as jest.Mock)).toHaveBeenCalledTimes(1);
  });
});

describe('handleDebugFillRequest — TA semantics', () => {
  beforeEach(() => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
  });

  it('skips entries that already have any course times (preserves prior data)', async () => {
    (prisma.tournament.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 't-1', debugMode: true })
      // Second call inside fillTATimes for frozenStages check
      .mockResolvedValueOnce({ frozenStages: [] });

    (prisma.tTEntry.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'e-empty', times: null },
      { id: 'e-partial', times: { MC1: '1:23.45' } }, // any prior value → skipped
      { id: 'e-also-empty', times: {} }, // empty object treated as fillable
    ]);

    const res = await handleDebugFillRequest('t-1', 'ta', makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ filled: 2, skipped: 1, mode: 'ta' });

    const updateMock = prisma.tTEntry.update as jest.Mock;
    const updatedIds = updateMock.mock.calls.map((c: any[]) => c[0].where.id).sort();
    expect(updatedIds).toEqual(['e-also-empty', 'e-empty']);
  });

  it('returns 409 QUALIFICATION_LOCKED when TA frozenStages includes qualification', async () => {
    (prisma.tournament.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 't-1', debugMode: true })
      .mockResolvedValueOnce({ frozenStages: ['qualification'] });

    const res = await handleDebugFillRequest('t-1', 'ta', makeRequest());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('QUALIFICATION_LOCKED');
    expect((prisma.tTEntry.update as jest.Mock)).not.toHaveBeenCalled();
  });
});

describe('handleDebugFillRequest — GP requires assigned cup', () => {
  beforeEach(() => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
  });

  it('refuses to fill GP matches that are missing their pre-assigned cup', async () => {
    (prisma.tournament.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 't-1', debugMode: true })
      .mockResolvedValueOnce({ gpQualificationConfirmed: false });

    (prisma.gPMatch.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'm-no-cup', completed: false, isBye: false, cup: null },
    ]);

    const res = await handleDebugFillRequest('t-1', 'gp', makeRequest());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('QUALIFICATION_LOCKED');
    expect((prisma.gPMatch.update as jest.Mock)).not.toHaveBeenCalled();
  });
});

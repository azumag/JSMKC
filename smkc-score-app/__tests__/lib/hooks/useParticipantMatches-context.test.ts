/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useParticipantMatches } from '@/lib/hooks/useParticipantMatches';

const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

const mockUsePolling = jest.fn();
jest.mock('@/lib/hooks/usePolling', () => ({
  usePolling: (...args: unknown[]) => mockUsePolling(...args),
}));

jest.mock('@/lib/fetch-with-retry', () => ({
  fetchWithRetry: jest.fn(),
}));

const mockLoggerError = jest.fn();
jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({ error: mockLoggerError, warn: jest.fn(), info: jest.fn() })),
}));

import { fetchWithRetry } from '@/lib/fetch-with-retry';
const mockedFetchWithRetry = fetchWithRetry as jest.MockedFunction<typeof fetchWithRetry>;

const PLAYER_ID = 'player-123';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeMatch(tournamentId: string) {
  return {
    id: `match-${tournamentId}`,
    matchNumber: 1,
    stage: 'qual',
    player1: { id: PLAYER_ID, name: 'Alice', nickname: 'alice' },
    player1Side: 1,
    player2: { id: 'player-999', name: 'Bob', nickname: 'bob' },
    player2Side: 2,
    completed: false,
    isBye: false,
  };
}

function reportResponse(tournamentId: string, json = jest.fn()) {
  json.mockResolvedValue({ data: { match: { ...makeMatch(tournamentId), completed: true } } });
  return { ok: true, status: 200, json } as unknown as Response;
}

function tournamentIdFromUrl(url: string) {
  const match = url.match(/\/api\/tournaments\/([^/?]+)/);
  if (!match) throw new Error(`Unexpected tournament URL: ${url}`);
  return match[1];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue({
    data: { user: { userType: 'player', role: 'player', playerId: PLAYER_ID } },
    status: 'authenticated',
  });
  mockUsePolling.mockReturnValue({ data: null, error: null, loading: false });
  mockedFetchWithRetry.mockImplementation(async (url) => {
    const tournamentId = tournamentIdFromUrl(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: tournamentId, name: tournamentId, date: '2026-01-01', status: 'active' }),
    } as Response;
  });
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useParticipantMatches report context isolation', () => {
  it('lets the new tournament submit while the old report is pending and ignores the late old success', async () => {
    const reportA = deferred<Response>();
    const reportB = deferred<Response>();
    const reportAJson = jest.fn();

    (global.fetch as jest.Mock).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const tournamentId = tournamentIdFromUrl(url);
      if (init?.method === 'POST') {
        return tournamentId === 'A' ? reportA.promise : reportB.promise;
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ matches: [makeMatch(tournamentId)], qualificationConfirmed: false }),
      });
    });

    const { result, rerender } = renderHook(
      ({ tournamentId }) => useParticipantMatches({ tournamentId, mode: 'bm' }),
      { initialProps: { tournamentId: 'A' } },
    );

    await waitFor(() => expect(result.current.tournament?.id).toBe('A'));

    let oldReportPromise!: Promise<Record<string, unknown> | null>;
    act(() => {
      oldReportPromise = result.current.submitReport('match-A', { score1: 3, score2: 1 });
    });
    await waitFor(() => expect(result.current.submitting).toBe('match-A'));

    const oldPostCall = (global.fetch as jest.Mock).mock.calls.find(
      ([url, init]) => String(url).includes('/tournaments/A/') && init?.method === 'POST',
    );
    expect(oldPostCall).toBeDefined();
    const oldSignal = oldPostCall?.[1]?.signal as AbortSignal;
    expect(oldSignal.aborted).toBe(false);

    rerender({ tournamentId: 'B' });

    await waitFor(() => expect(result.current.tournament?.id).toBe('B'));
    expect(oldSignal.aborted).toBe(true);
    expect(result.current.submitting).toBeNull();

    let newReportPromise!: Promise<Record<string, unknown> | null>;
    act(() => {
      newReportPromise = result.current.submitReport('match-B', { score1: 4, score2: 2 });
    });
    await waitFor(() => expect(result.current.submitting).toBe('match-B'));
    expect(
      (global.fetch as jest.Mock).mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(2);

    await act(async () => {
      reportA.resolve(reportResponse('A', reportAJson));
      await oldReportPromise;
    });

    expect(reportAJson).not.toHaveBeenCalled();
    expect(result.current.tournament?.id).toBe('B');
    expect(result.current.matches.map((match) => match.id)).toEqual(['match-B']);
    expect(result.current.submitting).toBe('match-B');
    expect(result.current.error).toBeNull();

    await act(async () => {
      reportB.resolve(reportResponse('B'));
      await newReportPromise;
    });

    expect(result.current.matches[0]).toMatchObject({ id: 'match-B', completed: true });
    expect(result.current.submitting).toBeNull();
  });

  it('does not surface a late old-context transport failure in the new tournament', async () => {
    const reportA = deferred<Response>();

    (global.fetch as jest.Mock).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const tournamentId = tournamentIdFromUrl(url);
      if (init?.method === 'POST') return reportA.promise;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ matches: [makeMatch(tournamentId)], qualificationConfirmed: false }),
      });
    });

    const { result, rerender } = renderHook(
      ({ tournamentId }) => useParticipantMatches({ tournamentId, mode: 'bm' }),
      { initialProps: { tournamentId: 'A' } },
    );

    await waitFor(() => expect(result.current.tournament?.id).toBe('A'));

    let oldReportPromise!: Promise<Record<string, unknown> | null>;
    act(() => {
      oldReportPromise = result.current.submitReport('match-A', { score1: 3, score2: 1 });
    });

    rerender({ tournamentId: 'B' });
    await waitFor(() => expect(result.current.tournament?.id).toBe('B'));

    await act(async () => {
      reportA.reject(new Error('old internal transport detail'));
      await oldReportPromise;
    });

    expect(result.current.error).toBeNull();
    expect(result.current.matches.map((match) => match.id)).toEqual(['match-B']);
    expect(mockLoggerError).not.toHaveBeenCalledWith(
      'Report submission error:',
      expect.objectContaining({ tournamentId: 'A' }),
    );
  });
});

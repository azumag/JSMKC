/**
 * @jest-environment jsdom
 *
 * Regression coverage for issue #3808: participant initial data belongs to
 * the session/access generation that requested it and must not survive an
 * access transition.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useParticipantMatches } from '@/lib/hooks/useParticipantMatches';

let sessionState: ReturnType<typeof playerSession> | ReturnType<typeof adminSession>;
const mockUseSession = jest.fn(() => sessionState);
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

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() })),
}));

import { fetchWithRetry } from '@/lib/fetch-with-retry';
const mockedFetchWithRetry = fetchWithRetry as jest.MockedFunction<typeof fetchWithRetry>;

const TOURNAMENT_ID = 'tournament-generation';

function playerSession() {
  return {
    data: { user: { userType: 'player', role: 'player', playerId: 'player-1' } },
    status: 'authenticated' as const,
  };
}

function adminSession() {
  return {
    data: { user: { userType: 'admin', role: 'admin', playerId: undefined } },
    status: 'authenticated' as const,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const match = {
  id: 'match-1',
  matchNumber: 1,
  stage: 'qual',
  player1: { id: 'player-1', name: 'Player One', nickname: 'one' },
  player1Side: 1,
  player2: { id: 'player-2', name: 'Player Two', nickname: 'two' },
  player2Side: 2,
  completed: false,
  isBye: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  sessionState = playerSession();
  mockUsePolling.mockReturnValue({ data: null, error: null, loading: false });
  global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('does not restore tournament or matches when an old initial fetch resolves after access loss', async () => {
  const tournamentRequest = deferred<Response>();
  const matchesRequest = deferred<Response>();
  mockedFetchWithRetry.mockReturnValueOnce(tournamentRequest.promise);
  (global.fetch as jest.MockedFunction<typeof fetch>).mockReturnValueOnce(matchesRequest.promise);

  const { result, rerender } = renderHook(() => useParticipantMatches({ tournamentId: TOURNAMENT_ID, mode: 'bm' }));
  await waitFor(() => expect(mockedFetchWithRetry).toHaveBeenCalledTimes(1));

  sessionState = adminSession();
  rerender();

  await waitFor(() => {
    expect(result.current.hasAccess).toBe(false);
    expect(result.current.loading).toBe(false);
  });
  expect(result.current.tournament).toBeNull();
  expect(result.current.matches).toEqual([]);
  expect(result.current.qualificationConfirmed).toBe(false);

  await act(async () => {
    tournamentRequest.resolve(
      new Response(JSON.stringify({ data: { id: TOURNAMENT_ID, name: 'Stale', date: '2026-01-01', status: 'active' } }), {
        status: 200,
      }),
    );
    matchesRequest.resolve(
      new Response(JSON.stringify({ data: { matches: [match], qualificationConfirmed: true } }), { status: 200 }),
    );
    await Promise.all([tournamentRequest.promise, matchesRequest.promise]);
    await Promise.resolve();
  });

  expect(result.current.tournament).toBeNull();
  expect(result.current.matches).toEqual([]);
  expect(result.current.myMatches).toEqual([]);
  expect(result.current.qualificationConfirmed).toBe(false);
});

it('clears already loaded participant data when the session loses player access', async () => {
  mockedFetchWithRetry.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ data: { id: TOURNAMENT_ID, name: 'Loaded', date: '2026-01-01', status: 'active' } }),
      { status: 200 },
    ),
  );
  (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce(
    new Response(JSON.stringify({ data: { matches: [match], qualificationConfirmed: true } }), { status: 200 }),
  );

  const { result, rerender } = renderHook(() => useParticipantMatches({ tournamentId: TOURNAMENT_ID, mode: 'bm' }));
  await waitFor(() => expect(result.current.matches).toHaveLength(1));
  expect(result.current.tournament?.name).toBe('Loaded');
  expect(result.current.qualificationConfirmed).toBe(true);

  sessionState = adminSession();
  rerender();

  await waitFor(() => expect(result.current.hasAccess).toBe(false));
  await waitFor(() => expect(result.current.matches).toEqual([]));
  expect(result.current.tournament).toBeNull();
  expect(result.current.myMatches).toEqual([]);
  expect(result.current.qualificationConfirmed).toBe(false);
  expect(result.current.error).toBeNull();
});

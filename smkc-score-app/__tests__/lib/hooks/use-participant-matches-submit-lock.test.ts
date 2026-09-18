/**
 * @jest-environment jsdom
 *
 * Regression coverage for issue #3806: submitReport must serialize score
 * mutations synchronously, including multiple calls made before React commits
 * the `submitting` state update.
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

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() })),
}));

import { fetchWithRetry } from '@/lib/fetch-with-retry';
const mockedFetchWithRetry = fetchWithRetry as jest.MockedFunction<typeof fetchWithRetry>;

const TOURNAMENT_ID = 'tournament-submit-lock';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue({
    data: { user: { userType: 'player', role: 'player', playerId: 'player-1' } },
    status: 'authenticated',
  });
  mockUsePolling.mockReturnValue({ data: null, error: null, loading: false });
  mockedFetchWithRetry.mockResolvedValue({
    ok: true,
    json: async () => ({ id: TOURNAMENT_ID, name: 'Test', date: '2026-01-01', status: 'active' }),
  } as Response);
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ matches: [], qualificationConfirmed: false }),
  }) as jest.MockedFunction<typeof fetch>;
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('allows only one POST when submitReport is called twice before a state commit', async () => {
  const firstPost = deferred<Response>();
  const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
  fetchMock
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ matches: [], qualificationConfirmed: false }),
    } as Response)
    .mockImplementationOnce(() => firstPost.promise);

  const { result } = renderHook(() => useParticipantMatches({ tournamentId: TOURNAMENT_ID, mode: 'bm' }));
  await waitFor(() => expect(result.current.loading).toBe(false));

  let firstResult!: Promise<Record<string, unknown> | null>;
  let secondResult!: Promise<Record<string, unknown> | null>;
  act(() => {
    firstResult = result.current.submitReport('match-1', { score1: 3, score2: 1 });
    secondResult = result.current.submitReport('match-1', { score1: 3, score2: 1 });
  });

  const postCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(postCalls).toHaveLength(1);
  await expect(secondResult).resolves.toBeNull();

  await act(async () => {
    firstPost.resolve(
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await firstResult;
  });

  expect(result.current.submitting).toBeNull();
});

it('releases the synchronous lock after a failed request so a retry can submit', async () => {
  const firstPost = deferred<Response>();
  const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
  fetchMock
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ matches: [], qualificationConfirmed: false }),
    } as Response)
    .mockImplementationOnce(() => firstPost.promise)
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

  const { result } = renderHook(() => useParticipantMatches({ tournamentId: TOURNAMENT_ID, mode: 'bm' }));
  await waitFor(() => expect(result.current.loading).toBe(false));

  let firstResult!: Promise<Record<string, unknown> | null>;
  act(() => {
    firstResult = result.current.submitReport('match-1', { score1: 3, score2: 1 });
  });

  await act(async () => {
    firstPost.reject(new TypeError('network failed'));
    await expect(firstResult).resolves.toBeNull();
  });

  await act(async () => {
    await expect(result.current.submitReport('match-1', { score1: 3, score2: 1 })).resolves.not.toBeNull();
  });

  const postCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(postCalls).toHaveLength(2);
  expect(result.current.submitting).toBeNull();
});

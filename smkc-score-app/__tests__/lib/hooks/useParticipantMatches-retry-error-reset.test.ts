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

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() })),
}));

import { fetchWithRetry } from '@/lib/fetch-with-retry';

const mockedFetchWithRetry = fetchWithRetry as jest.MockedFunction<typeof fetchWithRetry>;
const tournamentId = 'tournament-retry';
const playerId = 'player-1';

const match = {
  id: 'match-1',
  matchNumber: 1,
  stage: 'qual',
  player1: { id: playerId, name: 'Alice', nickname: 'alice' },
  player1Side: 1,
  player2: { id: 'player-2', name: 'Bob', nickname: 'bob' },
  player2Side: 2,
  completed: false,
};

describe('useParticipantMatches report retry error state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({
      data: { user: { userType: 'player', role: 'player', playerId } },
      status: 'authenticated',
    });
    mockUsePolling.mockReturnValue({ data: null, error: null, loading: false });
    mockedFetchWithRetry.mockResolvedValue({
      ok: true,
      json: async () => ({ id: tournamentId, name: 'Test', date: '2026-01-01', status: 'active' }),
    } as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('clears a previous report error only after a retry succeeds', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ matches: [match] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Score invalid' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { match: { ...match, completed: true } } }),
      });

    const { result } = renderHook(() => useParticipantMatches({ tournamentId, mode: 'bm' }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let firstResult: Record<string, unknown> | null | undefined;
    await act(async () => {
      firstResult = await result.current.submitReport(match.id, { score1: 9 });
    });

    expect(firstResult).toBeNull();
    expect(result.current.error).toBe('Score invalid');

    let retryResult: Record<string, unknown> | null | undefined;
    await act(async () => {
      retryResult = await result.current.submitReport(match.id, { score1: 3, score2: 1 });
    });

    expect(retryResult).toMatchObject({ match: { id: match.id, completed: true } });
    expect(result.current.error).toBeNull();
    expect(result.current.submitting).toBeNull();
    expect(result.current.matches.find((candidate) => candidate.id === match.id)?.completed).toBe(true);
  });
});

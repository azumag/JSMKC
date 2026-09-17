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
const tournamentId = 'tournament-i18n';
const localizedNetworkError = 'localized-network-error';

function renderParticipantHook() {
  return renderHook(() =>
    useParticipantMatches({
      tournamentId,
      mode: 'bm',
      networkErrorMessage: localizedNetworkError,
    }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue({
    data: { user: { userType: 'player', role: 'player', playerId: 'player-1' } },
    status: 'authenticated',
  });
  mockUsePolling.mockReturnValue({ data: null, error: null, loading: false });
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useParticipantMatches localized generic errors (issue #3638)', () => {
  it('surfaces generic initial non-2xx as the supplied localized network error', async () => {
    mockedFetchWithRetry.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: tournamentId, name: 'Tournament' } }),
    } as Response);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    const { result } = renderParticipantHook();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(localizedNetworkError);
    expect(result.current.tournament).toBeNull();
    expect(result.current.matches).toEqual([]);
    expect(mockLoggerError).toHaveBeenCalledWith('Participant data fetch returned non-2xx:', {
      tournamentId,
      mode: 'bm',
      source: 'matches',
      status: 503,
      error: null,
    });
  });

  it('preserves a concrete API error from the initial data request', async () => {
    mockedFetchWithRetry.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Tournament is unavailable' }),
    } as Response);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { matches: [] } }),
    });

    const { result } = renderParticipantHook();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Tournament is unavailable');
  });

  it('does not commit partial state when one successful response body cannot be parsed', async () => {
    mockedFetchWithRetry.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: tournamentId, name: 'Tournament' } }),
    } as Response);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    });

    const { result } = renderParticipantHook();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(localizedNetworkError);
    expect(result.current.tournament).toBeNull();
    expect(result.current.matches).toEqual([]);
  });

  it('uses the localized fallback for generic report non-2xx failures', async () => {
    mockedFetchWithRetry.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: tournamentId, name: 'Tournament' } }),
    } as Response);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { matches: [] } }) })
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });

    const { result } = renderParticipantHook();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.submitReport('match-1', { score1: 3, score2: 1 });
    });

    expect(result.current.error).toBe(localizedNetworkError);
  });

  it('hides request-level report details while retaining them in the logger', async () => {
    mockedFetchWithRetry.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: tournamentId, name: 'Tournament' } }),
    } as Response);
    const transportError = new Error('proxy.internal.example refused connection');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { matches: [] } }) })
      .mockRejectedValueOnce(transportError);

    const { result } = renderParticipantHook();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.submitReport('match-1', { score1: 3, score2: 1 });
    });

    expect(result.current.error).toBe(localizedNetworkError);
    expect(result.current.error).not.toContain('proxy.internal.example');
    expect(mockLoggerError).toHaveBeenCalledWith('Report submission error:', {
      error: transportError,
      tournamentId,
      matchId: 'match-1',
    });
  });
});

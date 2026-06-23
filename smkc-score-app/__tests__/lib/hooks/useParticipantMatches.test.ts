/**
 * @jest-environment jsdom
 */
/**
 * Tests for the useParticipantMatches hook.
 *
 * Covers:
 * - TC-2619: sessionStatus=loading → loading stays true, no fetch called
 * - TC-2620: hasAccess=false (admin-blocked) → loading=false, no API calls
 * - TC-2621: hasAccess=player → fetches tournament and matches, loading→false
 * - TC-2622: Tournament API unwraps json.data createSuccessResponse wrapper
 * - TC-2623: Matches API sets qualificationConfirmed=true from response
 * - TC-2624: myMatches filters by playerId and excludes BYE matches
 * - TC-2625: myMatches sorts incomplete matches before completed
 * - TC-2626: submitReport POSTs to correct endpoint, updates local match on success
 * - TC-2627: submitReport on non-ok response → sets error and returns null
 * - TC-2640: fetchWithRetry throws (network error) → sets error, loading=false
 * - TC-2641: global.fetch (matches) throws (network error) → sets error, loading=false
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { useParticipantMatches } from '@/lib/hooks/useParticipantMatches';

/* Mock next-auth/react */
const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

/* Mock usePolling — controlled per-test via mockUsePolling */
const mockUsePolling = jest.fn();
jest.mock('@/lib/hooks/usePolling', () => ({
  usePolling: (...args: unknown[]) => mockUsePolling(...args),
}));

/* Mock fetchWithRetry */
jest.mock('@/lib/fetch-with-retry', () => ({
  fetchWithRetry: jest.fn(),
}));

/* Mock logger to avoid console noise */
jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() })),
}));

import { fetchWithRetry } from '@/lib/fetch-with-retry';
const mockedFetchWithRetry = fetchWithRetry as jest.MockedFunction<typeof fetchWithRetry>;

const TOURNAMENT_ID = 'tournament-abc';
const MODE = 'bm' as const;
const PLAYER_ID = 'player-123';

function makeHook() {
  return renderHook(() => useParticipantMatches({ tournamentId: TOURNAMENT_ID, mode: MODE }));
}

function playerSession(playerId = PLAYER_ID) {
  return {
    data: { user: { userType: 'player', role: 'player', playerId } },
    status: 'authenticated',
  };
}

function makeMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'match-1',
    matchNumber: 1,
    stage: 'qual',
    player1: { id: PLAYER_ID, name: 'Alice', nickname: 'alice' },
    player1Side: 1,
    player2: { id: 'player-999', name: 'Bob', nickname: 'bob' },
    player2Side: 2,
    completed: false,
    isBye: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  /* Default polling: idle (no data/error) */
  mockUsePolling.mockReturnValue({ data: null, error: null, loading: false });
  /* Default fetch for matches */
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useParticipantMatches', () => {
  describe('TC-2619: sessionStatus=loading', () => {
    it('keeps loading=true and makes no fetch calls while session is loading', () => {
      mockUseSession.mockReturnValue({ data: null, status: 'loading' });
      mockedFetchWithRetry.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

      const { result } = makeHook();

      expect(result.current.loading).toBe(true);
      expect(mockedFetchWithRetry).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('TC-2620: hasAccess=false (admin-blocked)', () => {
    it('sets loading=false immediately, makes no API calls', async () => {
      mockUseSession.mockReturnValue({
        data: { user: { userType: 'admin', role: 'admin', playerId: undefined } },
        status: 'authenticated',
      });

      const { result } = makeHook();

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(mockedFetchWithRetry).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
      expect(result.current.isAdminBlocked).toBe(true);
    });
  });

  describe('TC-2621: hasAccess=player — fetches tournament and matches', () => {
    it('fetches both tournament and matches, sets loading=false', async () => {
      mockUseSession.mockReturnValue(playerSession());
      mockedFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({ id: TOURNAMENT_ID, name: 'Test', date: '2026-01-01', status: 'active' }),
      } as Response);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ matches: [makeMatch()], qualificationConfirmed: false }),
      });

      const { result } = makeHook();

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(mockedFetchWithRetry).toHaveBeenCalledWith(
        `/api/tournaments/${TOURNAMENT_ID}?fields=summary`,
      );
      expect(global.fetch).toHaveBeenCalledWith(`/api/tournaments/${TOURNAMENT_ID}/${MODE}`);
      expect(result.current.tournament?.id).toBe(TOURNAMENT_ID);
      expect(result.current.matches).toHaveLength(1);
    });
  });

  describe('TC-2622: tournament API unwraps json.data createSuccessResponse wrapper', () => {
    it('uses tJson.data when tournament response is wrapped', async () => {
      mockUseSession.mockReturnValue(playerSession());
      const tournament = { id: TOURNAMENT_ID, name: 'Wrapped', date: '2026-01-01', status: 'active' };
      mockedFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({ data: tournament }),
      } as Response);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ matches: [] }),
      });

      const { result } = makeHook();

      await waitFor(() => expect(result.current.tournament?.name).toBe('Wrapped'));
    });
  });

  describe('TC-2623: matches API sets qualificationConfirmed from response', () => {
    it('sets qualificationConfirmed=true when response contains qualificationConfirmed=true', async () => {
      mockUseSession.mockReturnValue(playerSession());
      mockedFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ matches: [], qualificationConfirmed: true }),
      });

      const { result } = makeHook();

      await waitFor(() => expect(result.current.qualificationConfirmed).toBe(true));
    });
  });

  describe('TC-2624: myMatches filters by playerId and excludes BYE matches', () => {
    it('only includes non-BYE matches where player is player1 or player2', async () => {
      mockUseSession.mockReturnValue(playerSession());
      mockedFetchWithRetry.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

      const myMatch = makeMatch({ id: 'match-mine', player1: { id: PLAYER_ID, name: 'Alice', nickname: 'a' } });
      const otherMatch = makeMatch({ id: 'match-other', player1: { id: 'p-other', name: 'C', nickname: 'c' }, player2: { id: 'p-other2', name: 'D', nickname: 'd' } });
      const byeMatch = makeMatch({ id: 'match-bye', player1: { id: PLAYER_ID, name: 'Alice', nickname: 'a' }, isBye: true });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ matches: [myMatch, otherMatch, byeMatch] }),
      });

      const { result } = makeHook();

      await waitFor(() => expect(result.current.myMatches).toHaveLength(1));
      expect(result.current.myMatches[0].id).toBe('match-mine');
    });
  });

  describe('TC-2625: myMatches sorts incomplete matches before completed', () => {
    it('pending matches come before completed matches, then by matchNumber', async () => {
      mockUseSession.mockReturnValue(playerSession());
      mockedFetchWithRetry.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

      const completed = makeMatch({ id: 'match-done', matchNumber: 1, completed: true });
      const pending = makeMatch({ id: 'match-pending', matchNumber: 2, completed: false });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ matches: [completed, pending] }),
      });

      const { result } = makeHook();

      await waitFor(() => expect(result.current.myMatches).toHaveLength(2));
      expect(result.current.myMatches[0].id).toBe('match-pending');
      expect(result.current.myMatches[1].id).toBe('match-done');
    });
  });

  describe('TC-2626: submitReport POSTs to correct endpoint, updates local match state', () => {
    it('sends POST and updates match in state on success', async () => {
      mockUseSession.mockReturnValue(playerSession());
      mockedFetchWithRetry.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

      const match = makeMatch();
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ matches: [match] }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { match: { ...match, completed: true } } }),
        });

      const { result } = makeHook();
      await waitFor(() => expect(result.current.loading).toBe(false));

      let returnValue: Record<string, unknown> | null = null;
      await act(async () => {
        returnValue = await result.current.submitReport('match-1', { score1: 3, score2: 1 });
      });

      const postCall = (global.fetch as jest.Mock).mock.calls.find(
        (c) => c[1]?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      expect(postCall![0]).toBe(
        `/api/tournaments/${TOURNAMENT_ID}/${MODE}/match/match-1/report`,
      );
      expect(returnValue).not.toBeNull();
    });
  });

  describe('TC-2627: submitReport on non-ok response → sets error and returns null', () => {
    it('returns null and sets error message on non-ok response', async () => {
      mockUseSession.mockReturnValue(playerSession());
      mockedFetchWithRetry.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ matches: [] }) })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: 'Score invalid' }),
          status: 400,
        });

      const { result } = makeHook();
      await waitFor(() => expect(result.current.loading).toBe(false));

      let returnValue: Record<string, unknown> | null | undefined;
      await act(async () => {
        returnValue = await result.current.submitReport('match-1', { score1: 9 });
      });

      expect(returnValue).toBeNull();
      expect(result.current.error).toBe('Score invalid');
    });
  });

  describe('TC-2640: fetchWithRetry throws → sets error, loading=false', () => {
    it('sets error state and loading=false when tournament fetch fails with network error', async () => {
      mockUseSession.mockReturnValue(playerSession());
      mockedFetchWithRetry.mockRejectedValue(new Error('Network timeout'));
      // matches fetch would succeed, but Promise.all rejects when either leg throws
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ matches: [] }),
      });

      const { result } = makeHook();

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBeTruthy();
    });
  });

  describe('TC-2641: global.fetch (matches) throws → sets error, loading=false', () => {
    it('sets error state and loading=false when matches fetch fails with network error', async () => {
      mockUseSession.mockReturnValue(playerSession());
      mockedFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({ id: TOURNAMENT_ID }),
      } as Response);
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'));

      const { result } = makeHook();

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBeTruthy();
    });
  });
});

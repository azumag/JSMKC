/**
 * @jest-environment jsdom
 */
/**
 * Tests for the useTournamentDebugMode hook.
 *
 * Covers:
 * - TC-2605: Returns false as initial state before fetch completes
 * - TC-2606: Returns true when API response contains debugMode=true
 * - TC-2607: Returns false when response.ok=false (early return, no state update)
 * - TC-2608: Returns false on fetch failure without throwing (best-effort)
 * - TC-2609: Unwraps json.data wrapper from createSuccessResponse format
 * - TC-2610: Cancels pending state update when hook unmounts (cleanup guard)
 */
import { renderHook, waitFor } from '@testing-library/react';
import { useTournamentDebugMode } from '@/lib/hooks/use-tournament-debug-mode';

jest.mock('@/lib/fetch-with-retry', () => ({
  fetchWithRetry: jest.fn(),
}));

import { fetchWithRetry } from '@/lib/fetch-with-retry';
const mockedFetchWithRetry = fetchWithRetry as jest.MockedFunction<typeof fetchWithRetry>;

const TOURNAMENT_ID = 'tournament-123';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useTournamentDebugMode', () => {
  it('TC-2605: returns false as initial state before fetch completes', () => {
    // Simulate a never-resolving fetch so only the initial render value is observed
    mockedFetchWithRetry.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useTournamentDebugMode(TOURNAMENT_ID));
    expect(result.current).toBe(false);
  });

  it('TC-2606: returns true when API returns debugMode=true', async () => {
    mockedFetchWithRetry.mockResolvedValue({
      ok: true,
      json: async () => ({ debugMode: true }),
    } as Response);

    const { result } = renderHook(() => useTournamentDebugMode(TOURNAMENT_ID));

    await waitFor(() => expect(result.current).toBe(true));
    expect(mockedFetchWithRetry).toHaveBeenCalledWith(
      `/api/tournaments/${TOURNAMENT_ID}?fields=summary`,
    );
  });

  it('TC-2607: returns false when response.ok=false (early return, no state update)', async () => {
    mockedFetchWithRetry.mockResolvedValue({
      ok: false,
      json: async () => ({ debugMode: true }), // body is irrelevant when ok=false
    } as Response);

    const { result } = renderHook(() => useTournamentDebugMode(TOURNAMENT_ID));

    await waitFor(() => expect(mockedFetchWithRetry).toHaveBeenCalledTimes(1));
    expect(result.current).toBe(false);
  });

  it('TC-2608: returns false on fetch failure without throwing (best-effort)', async () => {
    mockedFetchWithRetry.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTournamentDebugMode(TOURNAMENT_ID));

    await waitFor(() => expect(mockedFetchWithRetry).toHaveBeenCalledTimes(1));
    expect(result.current).toBe(false);
  });

  it('TC-2609: unwraps json.data wrapper from createSuccessResponse format', async () => {
    mockedFetchWithRetry.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { debugMode: true } }),
    } as Response);

    const { result } = renderHook(() => useTournamentDebugMode(TOURNAMENT_ID));

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('TC-2610: cancels state update when unmounted before fetch resolves', async () => {
    let resolvePromise!: (v: unknown) => void;
    const deferred = new Promise((res) => { resolvePromise = res; });
    mockedFetchWithRetry.mockReturnValue(deferred as Promise<Response>);

    const { result, unmount } = renderHook(() => useTournamentDebugMode(TOURNAMENT_ID));
    expect(result.current).toBe(false);

    // Unmount while fetch is still pending
    unmount();

    // Resolve the fetch after unmount — the cancelled flag prevents state update
    resolvePromise({ ok: true, json: async () => ({ debugMode: true }) });

    // Allow microtasks to run; result must remain false (no setState after unmount)
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toBe(false);
  });
});

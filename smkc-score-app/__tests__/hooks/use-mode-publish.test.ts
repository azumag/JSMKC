/**
 * @jest-environment jsdom
 */
/**
 * Tests for the useModePublish hook.
 *
 * Covers:
 * - TC-2628: Returns loading=true and isPublic=false before initial fetch resolves
 * - TC-2629: Sets isPublic=true and loading=false when mode is in fetched publicModes
 * - TC-2630: Sets isPublic=false when mode is absent from publicModes
 * - TC-2631: response.ok=false → loading=false, isPublic stays false (early return, finally runs)
 * - TC-2632: fetchWithRetry throws → loading=false, isPublic stays false (best-effort)
 * - TC-2633: Unwraps json.data wrapper from createSuccessResponse format
 * - TC-2634: toggle() when not public → PUT with addPublicMode result, isPublic becomes true
 * - TC-2635: toggle() when public → PUT with removePublicMode result, isPublic becomes false
 * - TC-2636: toggle() on non-ok PUT → no state change, updating resets to false
 * - TC-2637: toggle() dispatches CustomEvent('publicModesChanged') with tournamentId on success
 * - TC-2638: toggle() is no-op when already updating (double-click guard)
 * - TC-2639: Cancels pending state update when hook unmounts before fetch resolves
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { useModePublish } from '@/hooks/use-mode-publish';

jest.mock('@/lib/fetch-with-retry', () => ({
  fetchWithRetry: jest.fn(),
}));

jest.mock('@/lib/client-logger', () => ({
  createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() })),
}));

import { fetchWithRetry } from '@/lib/fetch-with-retry';
const mockedFetchWithRetry = fetchWithRetry as jest.MockedFunction<typeof fetchWithRetry>;

const TOURNAMENT_ID = 'tournament-abc';
const MODE = 'bm' as const;

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useModePublish', () => {
  describe('TC-2628: loading=true before initial fetch resolves', () => {
    it('returns loading=true and isPublic=false synchronously before fetch completes', () => {
      mockedFetchWithRetry.mockReturnValue(new Promise(() => {})); // never resolves
      const { result } = renderHook(() => useModePublish(TOURNAMENT_ID, MODE));
      expect(result.current.loading).toBe(true);
      expect(result.current.isPublic).toBe(false);
      expect(mockedFetchWithRetry).toHaveBeenCalledWith(
        `/api/tournaments/${TOURNAMENT_ID}?fields=summary`,
      );
    });
  });

  describe('TC-2629: isPublic=true when mode is in publicModes', () => {
    it('sets isPublic=true and loading=false when mode is included in fetched publicModes', async () => {
      mockedFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({ publicModes: [MODE, 'ta'] }),
      } as Response);

      const { result } = renderHook(() => useModePublish(TOURNAMENT_ID, MODE));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.isPublic).toBe(true);
    });
  });

  describe('TC-2630: isPublic=false when mode not in publicModes', () => {
    it('sets isPublic=false when mode is absent from publicModes list', async () => {
      mockedFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({ publicModes: ['ta', 'gp'] }),
      } as Response);

      const { result } = renderHook(() => useModePublish(TOURNAMENT_ID, MODE));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.isPublic).toBe(false);
    });
  });

  describe('TC-2631: response.ok=false → loading=false, isPublic stays false', () => {
    it('sets loading=false without changing isPublic when fetch returns non-ok status', async () => {
      mockedFetchWithRetry.mockResolvedValue({
        ok: false,
        status: 403,
      } as Response);

      const { result } = renderHook(() => useModePublish(TOURNAMENT_ID, MODE));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.isPublic).toBe(false);
    });
  });

  describe('TC-2632: fetchWithRetry throws → loading=false, isPublic stays false', () => {
    it('handles network error silently and keeps isPublic=false after fetch failure', async () => {
      mockedFetchWithRetry.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useModePublish(TOURNAMENT_ID, MODE));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.isPublic).toBe(false);
    });
  });

  describe('TC-2633: unwraps json.data wrapper from createSuccessResponse format', () => {
    it('reads publicModes from json.data when response is in createSuccessResponse format', async () => {
      mockedFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { publicModes: [MODE] } }),
      } as Response);

      const { result } = renderHook(() => useModePublish(TOURNAMENT_ID, MODE));

      await waitFor(() => expect(result.current.isPublic).toBe(true));
    });
  });

  describe('TC-2634: toggle() when not public → PUT with addPublicMode result', () => {
    it('adds mode via PUT and sets isPublic=true on success', async () => {
      mockedFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({ publicModes: [] }),
      } as Response);
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true } as Response);

      const { result } = renderHook(() => useModePublish(TOURNAMENT_ID, MODE));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.isPublic).toBe(false);

      await act(async () => {
        await result.current.toggle();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/tournaments/${TOURNAMENT_ID}`,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ publicModes: [MODE] }),
        }),
      );
      expect(result.current.isPublic).toBe(true);
    });
  });

  describe('TC-2635: toggle() when public → PUT with removePublicMode result', () => {
    it('removes mode via PUT and sets isPublic=false on success', async () => {
      mockedFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({ publicModes: [MODE] }),
      } as Response);
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true } as Response);

      const { result } = renderHook(() => useModePublish(TOURNAMENT_ID, MODE));
      await waitFor(() => expect(result.current.isPublic).toBe(true));

      await act(async () => {
        await result.current.toggle();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/tournaments/${TOURNAMENT_ID}`,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ publicModes: [] }),
        }),
      );
      expect(result.current.isPublic).toBe(false);
    });
  });

  describe('TC-2636: toggle() on non-ok PUT → no state change', () => {
    it('does not update isPublic and resets updating=false when PUT returns non-ok', async () => {
      mockedFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({ publicModes: [] }),
      } as Response);
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 } as Response);

      const { result } = renderHook(() => useModePublish(TOURNAMENT_ID, MODE));
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.toggle();
      });

      expect(result.current.isPublic).toBe(false);
      expect(result.current.updating).toBe(false);
    });
  });

  describe('TC-2637: toggle() dispatches publicModesChanged CustomEvent on success', () => {
    it('fires CustomEvent with tournamentId detail after successful PUT', async () => {
      mockedFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({ publicModes: [] }),
      } as Response);
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true } as Response);

      const eventHandler = jest.fn();
      window.addEventListener('publicModesChanged', eventHandler);

      const { result } = renderHook(() => useModePublish(TOURNAMENT_ID, MODE));
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.toggle();
      });

      expect(eventHandler).toHaveBeenCalledTimes(1);
      const event = eventHandler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.tournamentId).toBe(TOURNAMENT_ID);

      window.removeEventListener('publicModesChanged', eventHandler);
    });
  });

  describe('TC-2638: toggle() is no-op when already updating', () => {
    it('second toggle call during in-flight PUT is rejected (double-click guard)', async () => {
      mockedFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({ publicModes: [] }),
      } as Response);
      // Never-resolving PUT keeps updating=true indefinitely for the duration of this test
      (global.fetch as jest.Mock).mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useModePublish(TOURNAMENT_ID, MODE));
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Start first toggle — fetch never resolves, so updating stays true
      act(() => { void result.current.toggle(); });
      await waitFor(() => expect(result.current.updating).toBe(true));

      // Clear call count and attempt a second toggle while updating=true
      (global.fetch as jest.Mock).mockClear();
      act(() => { void result.current.toggle(); });
      await act(async () => { await Promise.resolve(); });

      // Second call must not trigger a new fetch request
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('TC-2639: cancels pending state update when hook unmounts', () => {
    it('does not call setState after unmount when fetch resolves late', async () => {
      let resolvePromise!: (v: unknown) => void;
      const deferred = new Promise((res) => { resolvePromise = res; });
      mockedFetchWithRetry.mockReturnValue(deferred as Promise<Response>);

      const { result, unmount } = renderHook(() => useModePublish(TOURNAMENT_ID, MODE));
      expect(result.current.loading).toBe(true);

      // Unmount while fetch is still pending
      unmount();

      // Resolve the fetch after unmount — cancelled flag must prevent setState
      resolvePromise({ ok: true, json: async () => ({ publicModes: [MODE] }) });
      await new Promise((r) => setTimeout(r, 0));

      // State stays at unmount-time values; isPublic must not flip to true
      expect(result.current.isPublic).toBe(false);
      expect(result.current.loading).toBe(true);
    });
  });
});

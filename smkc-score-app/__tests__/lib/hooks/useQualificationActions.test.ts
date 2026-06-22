/**
 * @jest-environment jsdom
 */
/**
 * Tests for the useQualificationActions hook.
 *
 * Covers:
 * - TC-2611: handleRankOverrideSave sends PATCH and calls refetch on success
 * - TC-2612: handleRankOverrideSave shows alert on non-ok response
 * - TC-2613: handleBulkRankOverrideSave sends PATCH for all updates and returns true
 * - TC-2614: handleBulkRankOverrideSave stops on first failure and returns false
 * - TC-2615: handleTvAssign sends PATCH with matchId and tvNumber (fire-and-forget)
 * - TC-2616: handleBroadcastReflect calls broadcast PUT and shows success toast
 * - TC-2617: handleBroadcastReflect shows error toast on non-ok response
 * - TC-2618: handleBroadcastReflect shows error toast on network failure
 */
import { renderHook, act } from '@testing-library/react';
import { useQualificationActions } from '@/lib/hooks/useQualificationActions';

jest.mock('@/lib/client-logger', () => ({
  createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() })),
}));

// Return i18n keys verbatim so toast assertions can target stable keys, not translation strings
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

import { toast } from 'sonner';

const TOURNAMENT_ID = 'tournament-abc';
const MODE = 'bm' as const;

function makeHook(refetch = jest.fn()) {
  return renderHook(() =>
    useQualificationActions({ tournamentId: TOURNAMENT_ID, mode: MODE, refetch }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useQualificationActions', () => {
  describe('handleRankOverrideSave', () => {
    it('TC-2611: sends PATCH with qualificationId and rankOverride, calls refetch on success', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true } as Response);
      const refetch = jest.fn();
      const { result } = makeHook(refetch);

      await act(async () => {
        await result.current.handleRankOverrideSave('qual-1', 2);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/tournaments/${TOURNAMENT_ID}/${MODE}`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ qualificationId: 'qual-1', rankOverride: 2 }),
        }),
      );
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('TC-2612: shows alert with error message on non-ok response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Not found' }),
      } as unknown as Response);
      const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
      const refetch = jest.fn();
      const { result } = makeHook(refetch);

      await act(async () => {
        await result.current.handleRankOverrideSave('qual-1', 1);
      });

      expect(alertSpy).toHaveBeenCalledWith('Not found');
      expect(refetch).not.toHaveBeenCalled();
    });
  });

  describe('handleBulkRankOverrideSave', () => {
    it('TC-2613: sends PATCH for all updates and calls refetch, returns true on success', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true } as Response);
      const refetch = jest.fn();
      const { result } = makeHook(refetch);

      const updates = [
        { qualificationId: 'q1', rankOverride: 1 },
        { qualificationId: 'q2', rankOverride: 2 },
      ];

      let returnValue: boolean | undefined;
      await act(async () => {
        returnValue = await result.current.handleBulkRankOverrideSave(updates);
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(refetch).toHaveBeenCalledTimes(1);
      expect(returnValue).toBe(true);
    });

    it('TC-2614: stops on first failure, skips remaining updates, returns false', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true } as Response)
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: 'Server error' }),
        } as unknown as Response);
      const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
      const refetch = jest.fn();
      const { result } = makeHook(refetch);

      const updates = [
        { qualificationId: 'q1', rankOverride: 1 },
        { qualificationId: 'q2', rankOverride: 2 },
        { qualificationId: 'q3', rankOverride: 3 }, // should never be reached
      ];

      let returnValue: boolean | undefined;
      await act(async () => {
        returnValue = await result.current.handleBulkRankOverrideSave(updates);
      });

      // Stops after 2nd call (the failing one); 3rd is not executed
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(alertSpy).toHaveBeenCalledWith('Server error');
      expect(refetch).not.toHaveBeenCalled();
      expect(returnValue).toBe(false);
    });
  });

  describe('handleTvAssign', () => {
    it('TC-2615: sends PATCH with matchId and tvNumber (fire-and-forget)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true } as Response);
      const { result } = makeHook();

      act(() => {
        result.current.handleTvAssign('match-1', 3);
      });

      // Allow the microtask queue to flush the fire-and-forget fetch
      await act(async () => {
        await Promise.resolve();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/tournaments/${TOURNAMENT_ID}/${MODE}`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ matchId: 'match-1', tvNumber: 3 }),
        }),
      );
    });
  });

  describe('handleBroadcastReflect', () => {
    it('TC-2616: calls broadcast PUT and shows success toast, returns true on ok', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true } as Response);
      const { result } = makeHook();

      let returnValue: boolean | undefined;
      await act(async () => {
        returnValue = await result.current.handleBroadcastReflect('Alice', 'Bob');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/tournaments/${TOURNAMENT_ID}/broadcast`,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ player1Name: 'Alice', player2Name: 'Bob' }),
        }),
      );
      expect(toast.success).toHaveBeenCalledWith('broadcastReflected');
      expect(returnValue).toBe(true);
    });

    it('TC-2617: shows error toast and returns false on non-ok broadcast response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false } as Response);
      const { result } = makeHook();

      let returnValue: boolean | undefined;
      await act(async () => {
        returnValue = await result.current.handleBroadcastReflect('Alice', 'Bob');
      });

      expect(toast.error).toHaveBeenCalledWith('broadcastError');
      expect(returnValue).toBe(false);
    });

    it('TC-2618: shows error toast and returns false on network failure', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
      const { result } = makeHook();

      let returnValue: boolean | undefined;
      await act(async () => {
        returnValue = await result.current.handleBroadcastReflect('Alice', 'Bob');
      });

      expect(toast.error).toHaveBeenCalledWith('broadcastError');
      expect(returnValue).toBe(false);
    });
  });
});

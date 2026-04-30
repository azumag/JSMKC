/**
 * @jest-environment jsdom
 */
/**
 * Tests for the useBroadcastReflect hook.
 *
 * Covers:
 * - broadcastStatus transitions (idle → success/error → idle)
 * - handleBroadcastReflect sends TV1/TV2 player names and ignores TV3/TV4
 * - resetBroadcastStatus resets state immediately
 * - hasUnbroadcastedTvAssignment flag when TV3/TV4 players are assigned
 */
import { renderHook, act } from '@testing-library/react';
import { useBroadcastReflect } from '@/lib/hooks/use-broadcast-reflect';

const TOURNAMENT_ID = 'tid-test';

const makeEntry = (playerId: string, nickname: string, eliminated = false, noCamera = false) => ({
  playerId,
  eliminated,
  player: { nickname, noCamera },
});

const entries = [
  makeEntry('p1', 'Alice'),
  makeEntry('p2', 'Bob', false, true),
  makeEntry('p3', 'Carol'),
  makeEntry('p4', 'Dave'),
  makeEntry('p5', 'Eve', true), // eliminated
];

function mockFetchOk() {
  global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);
}

function mockFetchError() {
  global.fetch = jest.fn().mockResolvedValue({ ok: false } as Response);
}

function mockFetchThrow() {
  global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useBroadcastReflect', () => {
  describe('broadcastStatus', () => {
    it('starts as idle', () => {
      const { result } = renderHook(() =>
        useBroadcastReflect(TOURNAMENT_ID, {}, entries)
      );
      expect(result.current.broadcastStatus).toBe('idle');
    });

    it('transitions to success on ok response', async () => {
      mockFetchOk();
      const tvAssignments = { p1: 1, p2: 2 };
      const { result } = renderHook(() =>
        useBroadcastReflect(TOURNAMENT_ID, tvAssignments, entries)
      );

      await act(async () => {
        await result.current.handleBroadcastReflect();
      });

      expect(result.current.broadcastStatus).toBe('success');
    });

    it('resets to idle after 3 seconds', async () => {
      mockFetchOk();
      const { result } = renderHook(() =>
        useBroadcastReflect(TOURNAMENT_ID, { p1: 1 }, entries)
      );

      await act(async () => {
        await result.current.handleBroadcastReflect();
      });
      expect(result.current.broadcastStatus).toBe('success');

      act(() => { jest.advanceTimersByTime(3000); });
      expect(result.current.broadcastStatus).toBe('idle');
    });

    it('transitions to error on non-ok response', async () => {
      mockFetchError();
      const { result } = renderHook(() =>
        useBroadcastReflect(TOURNAMENT_ID, { p1: 1 }, entries)
      );

      await act(async () => {
        await result.current.handleBroadcastReflect();
      });

      expect(result.current.broadcastStatus).toBe('error');
    });

    it('transitions to error on network failure', async () => {
      mockFetchThrow();
      const { result } = renderHook(() =>
        useBroadcastReflect(TOURNAMENT_ID, {}, entries)
      );

      await act(async () => {
        await result.current.handleBroadcastReflect();
      });

      expect(result.current.broadcastStatus).toBe('error');
    });
  });

  describe('handleBroadcastReflect', () => {
    it('sends TV1 and TV2 player names to the broadcast API', async () => {
      mockFetchOk();
      // p1 → TV1, p2 → TV2, p3 → TV3 (should be excluded from broadcast body)
      const tvAssignments = { p1: 1, p2: 2, p3: 3 };
      const { result } = renderHook(() =>
        useBroadcastReflect(TOURNAMENT_ID, tvAssignments, entries)
      );

      await act(async () => {
        await result.current.handleBroadcastReflect();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/tournaments/${TOURNAMENT_ID}/broadcast`,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            player1Name: 'Alice',
            player2Name: 'Bob',
            player1NoCamera: false,
            player2NoCamera: true,
          }),
        })
      );
    });

    it('sends empty strings when no TV1/TV2 players are assigned', async () => {
      mockFetchOk();
      const { result } = renderHook(() =>
        useBroadcastReflect(TOURNAMENT_ID, { p3: 3, p4: 4 }, entries)
      );

      await act(async () => {
        await result.current.handleBroadcastReflect();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/tournaments/${TOURNAMENT_ID}/broadcast`,
        expect.objectContaining({
          body: JSON.stringify({
            player1Name: '',
            player2Name: '',
            player1NoCamera: false,
            player2NoCamera: false,
          }),
        })
      );
    });

    it('excludes eliminated players from TV1/TV2 lookup', async () => {
      mockFetchOk();
      // p5 is eliminated — even if assigned TV1, should not be picked
      const tvAssignments = { p5: 1, p1: 2 };
      const { result } = renderHook(() =>
        useBroadcastReflect(TOURNAMENT_ID, tvAssignments, entries)
      );

      await act(async () => {
        await result.current.handleBroadcastReflect();
      });

      const call = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(call[1].body);
      // p5 is eliminated → player1Name should be empty; p1 on TV2 → player2Name Alice
      expect(body.player1Name).toBe('');
      expect(body.player2Name).toBe('Alice');
    });
  });

  describe('resetBroadcastStatus', () => {
    it('immediately resets status to idle', async () => {
      mockFetchOk();
      const { result } = renderHook(() =>
        useBroadcastReflect(TOURNAMENT_ID, { p1: 1 }, entries)
      );

      await act(async () => {
        await result.current.handleBroadcastReflect();
      });
      expect(result.current.broadcastStatus).toBe('success');

      act(() => { result.current.resetBroadcastStatus(); });
      expect(result.current.broadcastStatus).toBe('idle');
    });
  });

  describe('hasUnbroadcastedTvAssignment', () => {
    it('is false when only TV1/TV2 are assigned', () => {
      const { result } = renderHook(() =>
        useBroadcastReflect(TOURNAMENT_ID, { p1: 1, p2: 2 }, entries)
      );
      expect(result.current.hasUnbroadcastedTvAssignment).toBe(false);
    });

    it('is true when any active player is on TV3', () => {
      const { result } = renderHook(() =>
        useBroadcastReflect(TOURNAMENT_ID, { p1: 1, p3: 3 }, entries)
      );
      expect(result.current.hasUnbroadcastedTvAssignment).toBe(true);
    });

    it('is true when any active player is on TV4', () => {
      const { result } = renderHook(() =>
        useBroadcastReflect(TOURNAMENT_ID, { p2: 4 }, entries)
      );
      expect(result.current.hasUnbroadcastedTvAssignment).toBe(true);
    });

    it('ignores eliminated players when checking TV3/TV4', () => {
      // p5 is eliminated and on TV4 — should not trigger the flag
      const { result } = renderHook(() =>
        useBroadcastReflect(TOURNAMENT_ID, { p5: 4 }, entries)
      );
      expect(result.current.hasUnbroadcastedTvAssignment).toBe(false);
    });

    it('is false when tvAssignments is empty', () => {
      const { result } = renderHook(() =>
        useBroadcastReflect(TOURNAMENT_ID, {}, entries)
      );
      expect(result.current.hasUnbroadcastedTvAssignment).toBe(false);
    });
  });
});

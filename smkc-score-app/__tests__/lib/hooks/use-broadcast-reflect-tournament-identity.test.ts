/**
 * @jest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { useBroadcastReflect } from '@/lib/hooks/use-broadcast-reflect';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const entries = [
  {
    playerId: 'player-1',
    eliminated: false,
    player: { nickname: 'Alice' },
  },
];

const assignments = { 'player-1': 1 };

describe('useBroadcastReflect tournament identity', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('ignores a late success from the previous tournament and lets the current tournament reflect normally', async () => {
    const staleRequest = deferred<Response>();
    const currentRequest = deferred<Response>();
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() => staleRequest.promise)
      .mockImplementationOnce(() => currentRequest.promise);
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    const { result, rerender } = renderHook(
      ({ tournamentId }) => useBroadcastReflect(tournamentId, assignments, entries),
      { initialProps: { tournamentId: 'tournament-a' } },
    );

    const staleReflect = result.current.handleBroadcastReflect();
    act(() => {
      rerender({ tournamentId: 'tournament-b' });
    });

    await act(async () => {
      staleRequest.resolve({ ok: true } as Response);
      await staleReflect;
    });

    expect(result.current.broadcastStatus).toBe('idle');
    expect(setTimeoutSpy).not.toHaveBeenCalled();

    const currentReflect = result.current.handleBroadcastReflect();
    await act(async () => {
      currentRequest.resolve({ ok: true } as Response);
      await currentReflect;
    });

    expect(result.current.broadcastStatus).toBe('success');
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/tournaments/tournament-b/broadcast',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores a late network failure from the previous tournament', async () => {
    const staleRequest = deferred<Response>();
    global.fetch = jest.fn().mockImplementationOnce(() => staleRequest.promise);
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    const { result, rerender } = renderHook(
      ({ tournamentId }) => useBroadcastReflect(tournamentId, assignments, entries),
      { initialProps: { tournamentId: 'tournament-a' } },
    );

    const staleReflect = result.current.handleBroadcastReflect();
    act(() => {
      rerender({ tournamentId: 'tournament-b' });
    });

    await act(async () => {
      staleRequest.reject(new Error('stale tournament failure'));
      await staleReflect;
    });

    expect(result.current.broadcastStatus).toBe('idle');
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });
});

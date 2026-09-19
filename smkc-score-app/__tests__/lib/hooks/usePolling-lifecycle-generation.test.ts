/**
 * @jest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { clearPollingCache, usePolling } from '@/lib/hooks/usePolling';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('usePolling lifecycle generation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clearPollingCache();
  });

  afterEach(() => {
    clearPollingCache();
    jest.useRealTimers();
  });

  it('ignores a late success and scheduler from the lifecycle that was disabled before a new lifecycle started', async () => {
    const staleRequest = deferred<{ value: string }>();
    const currentRequest = deferred<{ value: string }>();
    const onSuccess = jest.fn();
    const fetchFn = jest
      .fn()
      .mockImplementationOnce(() => staleRequest.promise)
      .mockImplementationOnce(() => currentRequest.promise);

    const { result, rerender, unmount } = renderHook(
      ({ enabled, interval }) => usePolling(fetchFn, { enabled, interval, onSuccess }),
      { initialProps: { enabled: true, interval: 1_000 } },
    );

    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

    rerender({ enabled: false, interval: 1_000 });
    rerender({ enabled: true, interval: 60_000 });
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));

    await act(async () => {
      staleRequest.resolve({ value: 'stale' });
      await staleRequest.promise;
    });

    expect(result.current.data).toBeNull();
    expect(onSuccess).not.toHaveBeenCalled();

    // The old lifecycle used a 1s interval. Its late completion must not
    // replace the new lifecycle's cadence or start a third poll.
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);

    await act(async () => {
      currentRequest.resolve({ value: 'fresh' });
      await currentRequest.promise;
    });

    await waitFor(() => expect(result.current.data).toEqual({ value: 'fresh' }));
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({ value: 'fresh' });

    unmount();
  });

  it('ignores a late rejection from an invalidated lifecycle', async () => {
    const staleRequest = deferred<{ value: string }>();
    const currentRequest = deferred<{ value: string }>();
    const onError = jest.fn();
    const fetchFn = jest
      .fn()
      .mockImplementationOnce(() => staleRequest.promise)
      .mockImplementationOnce(() => currentRequest.promise);

    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => usePolling(fetchFn, { enabled, interval: 60_000, onError }),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

    rerender({ enabled: false });
    rerender({ enabled: true });
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));

    await act(async () => {
      staleRequest.reject(new Error('stale lifecycle failure'));
      await Promise.resolve();
    });

    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();

    await act(async () => {
      currentRequest.resolve({ value: 'fresh' });
      await currentRequest.promise;
    });

    await waitFor(() => expect(result.current.data).toEqual({ value: 'fresh' }));
    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();

    unmount();
  });
});

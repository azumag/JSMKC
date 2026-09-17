/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useModePublish } from '@/hooks/use-mode-publish';

jest.mock('@/lib/fetch-with-retry', () => ({
  fetchWithRetry: jest.fn(),
}));

jest.mock('@/lib/client-logger', () => ({
  createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() })),
}));

import { fetchWithRetry } from '@/lib/fetch-with-retry';

const mockedFetchWithRetry = fetchWithRetry as jest.MockedFunction<typeof fetchWithRetry>;

describe('useModePublish initial-load retry (issue #3624)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('retries a failed summary load and restores the published state without a PUT', async () => {
    mockedFetchWithRetry
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { publicModes: ['bm'] } }),
      } as Response);

    const { result } = renderHook(() => useModePublish('t-1', 'bm'));

    await waitFor(() => expect(result.current.error).toBe('load'));
    expect(result.current.loading).toBe(false);
    expect(result.current.isPublic).toBe(false);

    act(() => {
      result.current.retryLoad();
    });

    await waitFor(() => expect(mockedFetchWithRetry).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.isPublic).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not refetch when there is no initial-load error', async () => {
    mockedFetchWithRetry.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { publicModes: [] } }),
    } as Response);

    const { result } = renderHook(() => useModePublish('t-1', 'bm'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.retryLoad();
    });

    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(1);
  });
});

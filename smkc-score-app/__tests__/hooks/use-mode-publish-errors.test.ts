/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useModePublish } from '@/hooks/use-mode-publish';

jest.mock('@/lib/fetch-with-retry', () => ({
  fetchWithRetry: jest.fn(),
}));

jest.mock('@/lib/client-logger', () => {
  const error = jest.fn();
  return {
    __mockLoggerError: error,
    createLogger: jest.fn(() => ({
      error,
      warn: jest.fn(),
      info: jest.fn(),
    })),
  };
});

import { fetchWithRetry } from '@/lib/fetch-with-retry';

const { __mockLoggerError: mockLoggerError } = jest.requireMock('@/lib/client-logger') as {
  __mockLoggerError: jest.Mock;
};
const mockedFetchWithRetry = fetchWithRetry as jest.MockedFunction<typeof fetchWithRetry>;
const TOURNAMENT_ID = 'tournament-error-state';
const MODE = 'bm' as const;

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

describe('useModePublish error state', () => {
  it('marks the initial state as unknown after a non-ok load', async () => {
    mockedFetchWithRetry.mockResolvedValue({ ok: false, status: 500 } as Response);

    const { result } = renderHook(() => useModePublish(TOURNAMENT_ID, MODE));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('load');
    expect(result.current.isPublic).toBe(false);
  });

  it('logs raw initial request detail but exposes only the load failure state', async () => {
    mockedFetchWithRetry.mockRejectedValue(new Error('socket reset'));

    const { result } = renderHook(() => useModePublish(TOURNAMENT_ID, MODE));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('load');
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Failed to load publicModes',
      expect.objectContaining({ message: 'socket reset' }),
    );
  });

  it('refuses to toggle when the initial publish state is unknown', async () => {
    mockedFetchWithRetry.mockResolvedValue({ ok: false, status: 503 } as Response);

    const { result } = renderHook(() => useModePublish(TOURNAMENT_ID, MODE));
    await waitFor(() => expect(result.current.error).toBe('load'));

    await act(async () => {
      await result.current.toggle();
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('marks a non-ok update as retryable without changing publish state', async () => {
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

    expect(result.current.error).toBe('update');
    expect(result.current.isPublic).toBe(false);
    expect(result.current.updating).toBe(false);
  });

  it('marks a rejected update as retryable and logs its raw detail', async () => {
    mockedFetchWithRetry.mockResolvedValue({
      ok: true,
      json: async () => ({ publicModes: [] }),
    } as Response);
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Failed to fetch'));

    const { result } = renderHook(() => useModePublish(TOURNAMENT_ID, MODE));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.error).toBe('update');
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Failed to update mode visibility:',
      expect.objectContaining({ message: 'Failed to fetch' }),
    );
  });

  it('clears an update error after a successful retry', async () => {
    mockedFetchWithRetry.mockResolvedValue({
      ok: true,
      json: async () => ({ publicModes: [] }),
    } as Response);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);

    const { result } = renderHook(() => useModePublish(TOURNAMENT_ID, MODE));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.error).toBe('update');

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.isPublic).toBe(true);
  });
});

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

type HookProps = {
  tournamentId: string;
  mode: 'bm' | 'mr';
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useModePublish stale toggle protection', () => {
  it('aborts an old PUT and ignores its late success after tournament/mode identity changes', async () => {
    mockedFetchWithRetry
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicModes: [] }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicModes: ['mr'] }) } as Response);

    let resolvePut!: (response: Response) => void;
    const pendingPut = new Promise<Response>((resolve) => {
      resolvePut = resolve;
    });
    let oldSignal: AbortSignal | undefined;
    (global.fetch as jest.Mock).mockImplementation((_url: string, init?: RequestInit) => {
      oldSignal = init?.signal ?? undefined;
      return pendingPut;
    });

    const eventHandler = jest.fn();
    window.addEventListener('publicModesChanged', eventHandler);

    const { result, rerender } = renderHook(({ tournamentId, mode }: HookProps) => useModePublish(tournamentId, mode), {
      initialProps: { tournamentId: 'tournament-old', mode: 'bm' } as HookProps,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    let oldToggle!: Promise<void>;
    act(() => {
      oldToggle = result.current.toggle();
    });
    await waitFor(() => expect(result.current.updating).toBe(true));
    expect(oldSignal?.aborted).toBe(false);

    rerender({ tournamentId: 'tournament-new', mode: 'mr' });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.isPublic).toBe(true));
    expect(oldSignal?.aborted).toBe(true);
    expect(result.current.updating).toBe(false);

    await act(async () => {
      resolvePut({ ok: true } as Response);
      await oldToggle;
    });

    expect(result.current.isPublic).toBe(true);
    expect(eventHandler).not.toHaveBeenCalled();

    window.removeEventListener('publicModesChanged', eventHandler);
  });

  it('aborts a pending PUT on unmount and suppresses a late success event', async () => {
    mockedFetchWithRetry.mockResolvedValue({ ok: true, json: async () => ({ publicModes: [] }) } as Response);

    let resolvePut!: (response: Response) => void;
    const pendingPut = new Promise<Response>((resolve) => {
      resolvePut = resolve;
    });
    let signal: AbortSignal | undefined;
    (global.fetch as jest.Mock).mockImplementation((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return pendingPut;
    });

    const eventHandler = jest.fn();
    window.addEventListener('publicModesChanged', eventHandler);

    const { result, unmount } = renderHook(() => useModePublish('tournament-old', 'bm'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let toggle!: Promise<void>;
    act(() => {
      toggle = result.current.toggle();
    });
    await waitFor(() => expect(result.current.updating).toBe(true));
    expect(signal?.aborted).toBe(false);

    unmount();
    expect(signal?.aborted).toBe(true);

    await act(async () => {
      resolvePut({ ok: true } as Response);
      await toggle;
    });

    expect(eventHandler).not.toHaveBeenCalled();
    window.removeEventListener('publicModesChanged', eventHandler);
  });
});

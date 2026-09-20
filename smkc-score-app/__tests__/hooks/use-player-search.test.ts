/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { usePlayerSearch } from '@/hooks/use-player-search';

const player = (id: string, nickname: string) => ({ id, nickname, name: `${nickname} Name` });

function responseWith(players: ReturnType<typeof player>[]): Response {
  return {
    ok: true,
    json: async () => ({ success: true, data: players }),
  } as Response;
}

async function advanceDebounce() {
  await act(async () => {
    jest.advanceTimersByTime(250);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('usePlayerSearch', () => {
  it('uses a single bounded first-page request for an empty query', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(responseWith([player('p1', 'Alpha')]));

    const { result } = renderHook(() => usePlayerSearch(''));
    await advanceDebounce();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/players?limit=50', expect.objectContaining({ signal: expect.anything() }));
    expect(result.current.results.map((entry) => entry.id)).toEqual(['p1']);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);
  });

  it('aborts the old query and ignores its late completion after rapid input', async () => {
    let resolveOld!: (value: Response) => void;
    const oldResponse = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    let oldSignal: AbortSignal | undefined;

    (global.fetch as jest.Mock)
      .mockImplementationOnce((_url: string, init?: RequestInit) => {
        oldSignal = init?.signal ?? undefined;
        return oldResponse;
      })
      .mockResolvedValueOnce(responseWith([player('new', 'New Player')]));

    const { result, rerender } = renderHook(({ query }) => usePlayerSearch(query), {
      initialProps: { query: 'old' },
    });

    await advanceDebounce();
    expect(oldSignal?.aborted).toBe(false);

    rerender({ query: 'new' });
    expect(oldSignal?.aborted).toBe(true);
    await advanceDebounce();
    expect(result.current.results.map((entry) => entry.id)).toEqual(['new']);

    await act(async () => {
      resolveOld(responseWith([player('old', 'Old Player')]));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.results.map((entry) => entry.id)).toEqual(['new']);
  });

  it('keeps player details from earlier searches so selected players can remain renderable', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(responseWith([player('p1', 'Alpha')]))
      .mockResolvedValueOnce(responseWith([player('p2', 'Beta')]));

    const { result, rerender } = renderHook(({ query }) => usePlayerSearch(query), {
      initialProps: { query: 'Alpha' },
    });

    await advanceDebounce();
    rerender({ query: 'Beta' });
    await advanceDebounce();

    expect(result.current.results.map((entry) => entry.id)).toEqual(['p2']);
    expect(result.current.knownPlayers.map((entry) => entry.id)).toEqual(['p1', 'p2']);
  });

  it('aborts an in-flight request on unmount', async () => {
    let signal: AbortSignal | undefined;
    (global.fetch as jest.Mock).mockImplementation((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });

    const { unmount } = renderHook(() => usePlayerSearch('Alpha'));
    await advanceDebounce();
    expect(signal?.aborted).toBe(false);

    unmount();
    expect(signal?.aborted).toBe(true);
  });
});

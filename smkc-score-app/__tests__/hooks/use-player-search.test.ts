/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { usePlayerSearch } from '@/hooks/use-player-search';

const player = (id: string, nickname: string) => ({ id, nickname, name: `${nickname} Name` });

function payloadResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

function responseWith(players: ReturnType<typeof player>[]): Response {
  return payloadResponse({ success: true, data: players });
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
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/players?limit=50',
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(result.current.results.map((entry) => entry.id)).toEqual(['p1']);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);
  });

  it('treats a legitimate empty result as a successful search', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(responseWith([]));

    const { result } = renderHook(() => usePlayerSearch('missing'));
    await advanceDebounce();

    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);
  });

  it('fails closed when a successful response has an unsupported payload shape', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      payloadResponse({ success: true, data: { unexpected: [player('p1', 'Alpha')] } }),
    );

    const { result } = renderHook(() => usePlayerSearch('Alpha'));
    await advanceDebounce();

    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(true);
    expect(result.current.knownPlayers).toEqual([]);
  });

  it.each([
    null,
    { id: 'p1', name: 'Alpha Name' },
    { id: 1, name: 'Alpha Name', nickname: 'Alpha' },
    { id: '', name: 'Alpha Name', nickname: 'Alpha' },
    { id: '   ', name: 'Alpha Name', nickname: 'Alpha' },
    { id: 'p1', name: 'Alpha Name', nickname: 'Alpha', country: 81 },
  ])('fails closed when a successful array contains a malformed player row: %p', async (invalidPlayer) => {
    (global.fetch as jest.Mock).mockResolvedValue(
      payloadResponse({ success: true, data: [player('valid', 'Valid'), invalidPlayer] }),
    );

    const { result } = renderHook(() => usePlayerSearch('Alpha'));
    await advanceDebounce();

    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(true);
    expect(result.current.knownPlayers).toEqual([]);
  });

  it('fails closed when a successful array repeats a player identity', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      payloadResponse({ success: true, data: [player('p1', 'Alpha'), player('p1', 'Alpha duplicate')] }),
    );

    const { result } = renderHook(() => usePlayerSearch('Alpha'));
    await advanceDebounce();

    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(true);
    expect(result.current.knownPlayers).toEqual([]);
  });

  it('clears results immediately when the query changes before the debounced request starts', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(responseWith([player('old', 'Old Player')]))
      .mockResolvedValueOnce(responseWith([player('new', 'New Player')]));

    const { result, rerender } = renderHook(({ query }) => usePlayerSearch(query), {
      initialProps: { query: 'old' },
    });

    await advanceDebounce();
    expect(result.current.results.map((entry) => entry.id)).toEqual(['old']);

    rerender({ query: 'new' });

    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await advanceDebounce();
    expect(result.current.results.map((entry) => entry.id)).toEqual(['new']);
  });

  it('does not refetch when raw queries normalize to the same search value', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(responseWith([player('p1', 'Alpha')]));

    const { result, rerender } = renderHook(({ query }) => usePlayerSearch(query), {
      initialProps: { query: 'Alpha' },
    });

    await advanceDebounce();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.current.results.map((entry) => entry.id)).toEqual(['p1']);

    rerender({ query: '  Alpha  ' });

    expect(result.current.results.map((entry) => entry.id)).toEqual(['p1']);
    expect(result.current.loading).toBe(false);

    await advanceDebounce();
    expect(global.fetch).toHaveBeenCalledTimes(1);
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

  it('clears transient state when disabled without forgetting known players', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(responseWith([player('p1', 'Alpha')]));

    const { result, rerender } = renderHook(({ enabled }) => usePlayerSearch('Alpha', enabled), {
      initialProps: { enabled: true },
    });

    await advanceDebounce();
    expect(result.current.results.map((entry) => entry.id)).toEqual(['p1']);
    expect(result.current.knownPlayers.map((entry) => entry.id)).toEqual(['p1']);

    rerender({ enabled: false });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.results).toEqual([]);
    expect(result.current.knownPlayers.map((entry) => entry.id)).toEqual(['p1']);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);
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

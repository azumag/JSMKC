import {
  clearSetupPlayersForSetupCache,
  fetchAllPlayersForSetup,
  resolveAllPlayers,
} from '@/lib/qualification-page-data';
import { fetchWithRetry } from '@/lib/fetch-with-retry';

jest.mock('@/lib/fetch-with-retry', () => ({
  fetchWithRetry: jest.fn(),
}));

const mockedFetchWithRetry = fetchWithRetry as jest.MockedFunction<typeof fetchWithRetry>;

type SetupPlayer = {
  id: string;
  name: string;
  nickname: string;
  country?: string | null;
};

function setupPlayer(id: string, country?: string | null): SetupPlayer {
  return {
    id,
    name: `Name ${id}`,
    nickname: `Nick ${id}`,
    ...(country === undefined ? {} : { country }),
  };
}

function paginatedPlayers(ids: string[], page: number, total: number, totalPages: number) {
  return Response.json({
    success: true,
    data: ids.map((id) => setupPlayer(id)),
    meta: { total, page, limit: 100, totalPages },
  }) as never;
}

function paginatedRows(rows: unknown[], page: number, total: number, totalPages: number) {
  return Response.json({
    success: true,
    data: rows,
    meta: { total, page, limit: 100, totalPages },
  }) as never;
}

describe('qualification page data helpers', () => {
  beforeEach(() => {
    clearSetupPlayersForSetupCache();
    mockedFetchWithRetry.mockReset();
  });

  it('requests the setup player list with the API cap', async () => {
    mockedFetchWithRetry.mockResolvedValue(paginatedPlayers(['p1'], 1, 1, 1));

    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toEqual([setupPlayer('p1')]);
    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(1);
    expect(mockedFetchWithRetry).toHaveBeenCalledWith('/api/players?limit=100');
  });

  it('loads a second page so players above the first 100 remain selectable', async () => {
    const firstPageIds = Array.from({ length: 100 }, (_, index) => `p${index + 1}`);
    mockedFetchWithRetry
      .mockResolvedValueOnce(paginatedPlayers(firstPageIds, 1, 101, 2))
      .mockResolvedValueOnce(paginatedPlayers(['p101'], 2, 101, 2));

    const players = await fetchAllPlayersForSetup<SetupPlayer>();

    expect(players).toHaveLength(101);
    expect(players?.[100]).toEqual(setupPlayer('p101'));
    expect(mockedFetchWithRetry).toHaveBeenNthCalledWith(1, '/api/players?limit=100');
    expect(mockedFetchWithRetry).toHaveBeenNthCalledWith(2, '/api/players?limit=100&page=2');
  });

  it('rejects a short intermediate page before a later page can compensate for the missing rows', async () => {
    const firstPageIds = Array.from({ length: 100 }, (_, index) => `p${index + 1}`);
    const secondPageIds = Array.from({ length: 50 }, (_, index) => `p${index + 101}`);
    const compensatingThirdPageIds = Array.from({ length: 51 }, (_, index) => `p${index + 151}`);
    mockedFetchWithRetry
      .mockResolvedValueOnce(paginatedPlayers(firstPageIds, 1, 201, 3))
      .mockResolvedValueOnce(paginatedPlayers(secondPageIds, 2, 201, 3))
      .mockResolvedValueOnce(paginatedPlayers(compensatingThirdPageIds, 3, 201, 3));

    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toBeNull();
    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(2);
  });

  it('reuses a successful bounded snapshot across repeated qualification polls', async () => {
    mockedFetchWithRetry.mockResolvedValue(paginatedPlayers(['p1'], 1, 1, 1));

    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toEqual([setupPlayer('p1')]);
    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toEqual([setupPlayer('p1')]);

    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(1);
  });

  it('shares an in-flight snapshot request instead of duplicating polling fetches', async () => {
    let resolveResponse: ((value: never) => void) | undefined;
    mockedFetchWithRetry.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveResponse = resolve;
        }),
    );

    const first = fetchAllPlayersForSetup<SetupPlayer>();
    const second = fetchAllPlayersForSetup<SetupPlayer>();
    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(1);

    resolveResponse?.(paginatedPlayers(['p1'], 1, 1, 1));

    await expect(first).resolves.toEqual([setupPlayer('p1')]);
    await expect(second).resolves.toEqual([setupPlayer('p1')]);
  });

  it('starts a fresh request after invalidation and ignores the stale in-flight completion for caching', async () => {
    let resolveStaleResponse: ((value: never) => void) | undefined;
    mockedFetchWithRetry
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStaleResponse = resolve;
          }),
      )
      .mockResolvedValueOnce(paginatedPlayers(['fresh'], 1, 1, 1));

    const staleRequest = fetchAllPlayersForSetup<SetupPlayer>();
    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(1);

    clearSetupPlayersForSetupCache();

    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toEqual([setupPlayer('fresh')]);
    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(2);

    resolveStaleResponse?.(paginatedPlayers(['stale'], 1, 1, 1));
    await expect(staleRequest).resolves.toEqual([setupPlayer('stale')]);

    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toEqual([setupPlayer('fresh')]);
    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(2);
  });

  it('fails closed before issuing unbounded requests for rosters above 300 players', async () => {
    const firstPageIds = Array.from({ length: 100 }, (_, index) => `p${index + 1}`);
    mockedFetchWithRetry.mockResolvedValueOnce(paginatedPlayers(firstPageIds, 1, 301, 4));

    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toBeNull();
    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(1);
  });

  it('fails closed when pagination metadata changes while loading the roster', async () => {
    const firstPageIds = Array.from({ length: 100 }, (_, index) => `p${index + 1}`);
    mockedFetchWithRetry
      .mockResolvedValueOnce(paginatedPlayers(firstPageIds, 1, 101, 2))
      .mockResolvedValueOnce(paginatedPlayers(['p101'], 2, 102, 2));

    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toBeNull();
  });

  it('fails closed on an explicit failed wrapper and retries instead of caching an empty roster', async () => {
    mockedFetchWithRetry
      .mockResolvedValueOnce(Response.json({ success: false, data: [setupPlayer('stale')] }) as never)
      .mockResolvedValueOnce(paginatedPlayers(['recovered'], 1, 1, 1));

    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toBeNull();
    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toEqual([setupPlayer('recovered')]);
    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(2);
  });

  it('fails closed when a subsequent page is an explicit failed wrapper', async () => {
    const firstPageIds = Array.from({ length: 100 }, (_, index) => `p${index + 1}`);
    mockedFetchWithRetry.mockResolvedValueOnce(paginatedPlayers(firstPageIds, 1, 101, 2)).mockResolvedValueOnce(
      Response.json({
        success: false,
        data: [setupPlayer('p101')],
        meta: { total: 101, page: 2, limit: 100, totalPages: 2 },
      }) as never,
    );

    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toBeNull();
    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(2);
  });

  it('accepts a legacy response below the page cap but rejects an ambiguous full page without metadata', async () => {
    mockedFetchWithRetry.mockResolvedValueOnce(Response.json({ data: [setupPlayer('legacy')] }) as never);

    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toEqual([setupPlayer('legacy')]);

    clearSetupPlayersForSetupCache();
    mockedFetchWithRetry.mockResolvedValueOnce(
      Response.json({ data: Array.from({ length: 100 }, (_, index) => setupPlayer(`p${index + 1}`)) }) as never,
    );

    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toBeNull();
  });

  it.each([
    ['missing name', { id: 'p1', nickname: 'Nick p1' }],
    ['non-string name', { id: 'p1', name: 1, nickname: 'Nick p1' }],
    ['missing nickname', { id: 'p1', name: 'Name p1' }],
    ['non-string nickname', { id: 'p1', name: 'Name p1', nickname: 1 }],
    ['invalid country', { id: 'p1', name: 'Name p1', nickname: 'Nick p1', country: 1 }],
  ])('fails closed on a first-page row with %s', async (_label, malformedPlayer) => {
    mockedFetchWithRetry.mockResolvedValueOnce(paginatedRows([malformedPlayer], 1, 1, 1));

    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toBeNull();
  });

  it('fails closed when a later page contains a malformed row', async () => {
    const firstPageIds = Array.from({ length: 100 }, (_, index) => `p${index + 1}`);
    mockedFetchWithRetry
      .mockResolvedValueOnce(paginatedPlayers(firstPageIds, 1, 101, 2))
      .mockResolvedValueOnce(paginatedRows([{ id: 'p101', name: 'Name p101' }], 2, 101, 2));

    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toBeNull();
  });

  it('accepts setup rows with a string, null, or absent country', async () => {
    const players = [setupPlayer('p1', 'JP'), setupPlayer('p2', null), setupPlayer('p3')];
    mockedFetchWithRetry.mockResolvedValueOnce(paginatedRows(players, 1, players.length, 1));

    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toEqual(players);
  });

  it('does not cache malformed rows so the next poll can recover', async () => {
    mockedFetchWithRetry
      .mockResolvedValueOnce(paginatedRows([{ id: 'bad', name: 'Bad' }], 1, 1, 1))
      .mockResolvedValueOnce(paginatedPlayers(['recovered'], 1, 1, 1));

    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toBeNull();
    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toEqual([setupPlayer('recovered')]);
    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(2);
  });

  it('does not cache failures so the next poll can recover', async () => {
    mockedFetchWithRetry
      .mockRejectedValueOnce(new Error('players down'))
      .mockResolvedValueOnce(paginatedPlayers(['recovered'], 1, 1, 1));

    await expect(fetchAllPlayersForSetup()).resolves.toBeNull();
    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toEqual([setupPlayer('recovered')]);
    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(2);
  });

  it('prefers the fresh players response and falls back to archived allPlayers', () => {
    expect(resolveAllPlayers([{ id: 'fresh' }], [{ id: 'archive' }])).toEqual([{ id: 'fresh' }]);
    expect(resolveAllPlayers(null, [{ id: 'archive' }])).toEqual([{ id: 'archive' }]);
    expect(resolveAllPlayers(null, undefined)).toEqual([]);
  });
});

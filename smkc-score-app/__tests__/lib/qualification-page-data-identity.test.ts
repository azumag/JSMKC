import { clearSetupPlayersForSetupCache, fetchAllPlayersForSetup } from '@/lib/qualification-page-data';
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

function setupPlayer(id: string): SetupPlayer {
  return { id, name: `Name ${id}`, nickname: `Nick ${id}` };
}

function paginatedPlayers(ids: string[], page: number, total: number, totalPages: number) {
  return Response.json({
    success: true,
    data: ids.map(setupPlayer),
    meta: { total, page, limit: 100, totalPages },
  }) as never;
}

describe('qualification setup player identity validation', () => {
  beforeEach(() => {
    clearSetupPlayersForSetupCache();
    mockedFetchWithRetry.mockReset();
  });

  it('fails closed on blank, non-canonical, and reserved setup-player ids', async () => {
    mockedFetchWithRetry
      .mockResolvedValueOnce(Response.json({ data: [setupPlayer('')] }) as never)
      .mockResolvedValueOnce(Response.json({ data: [setupPlayer('   ')] }) as never)
      .mockResolvedValueOnce(Response.json({ data: [setupPlayer(' p1 ')] }) as never)
      .mockResolvedValueOnce(Response.json({ data: [setupPlayer('__BREAK__')] }) as never);

    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toBeNull();
    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toBeNull();
    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toBeNull();
    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toBeNull();
    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(4);
  });

  it('fails closed when duplicate player ids appear across pagination pages', async () => {
    const firstPageIds = Array.from({ length: 100 }, (_, index) => `p${index + 1}`);
    mockedFetchWithRetry
      .mockResolvedValueOnce(paginatedPlayers(firstPageIds, 1, 101, 2))
      .mockResolvedValueOnce(paginatedPlayers(['p100'], 2, 101, 2));

    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toBeNull();
    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(2);
  });

  it('does not cache an invalid player identity so the next poll can recover', async () => {
    mockedFetchWithRetry
      .mockResolvedValueOnce(Response.json({ data: [setupPlayer('__BREAK__')] }) as never)
      .mockResolvedValueOnce(paginatedPlayers(['recovered'], 1, 1, 1));

    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toBeNull();
    await expect(fetchAllPlayersForSetup<SetupPlayer>()).resolves.toEqual([setupPlayer('recovered')]);
    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(2);
  });
});

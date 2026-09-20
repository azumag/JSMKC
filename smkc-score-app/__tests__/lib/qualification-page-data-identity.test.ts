import { clearSetupPlayersForSetupCache, fetchAllPlayersForSetup } from '@/lib/qualification-page-data';
import { fetchWithRetry } from '@/lib/fetch-with-retry';

jest.mock('@/lib/fetch-with-retry', () => ({
  fetchWithRetry: jest.fn(),
}));

const mockedFetchWithRetry = fetchWithRetry as jest.MockedFunction<typeof fetchWithRetry>;

function paginatedPlayers(ids: string[], page: number, total: number, totalPages: number) {
  return Response.json({
    success: true,
    data: ids.map((id) => ({ id })),
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
      .mockResolvedValueOnce(Response.json({ data: [{ id: '' }] }) as never)
      .mockResolvedValueOnce(Response.json({ data: [{ id: '   ' }] }) as never)
      .mockResolvedValueOnce(Response.json({ data: [{ id: ' p1 ' }] }) as never)
      .mockResolvedValueOnce(Response.json({ data: [{ id: '__BREAK__' }] }) as never);

    await expect(fetchAllPlayersForSetup<{ id: string }>()).resolves.toBeNull();
    await expect(fetchAllPlayersForSetup<{ id: string }>()).resolves.toBeNull();
    await expect(fetchAllPlayersForSetup<{ id: string }>()).resolves.toBeNull();
    await expect(fetchAllPlayersForSetup<{ id: string }>()).resolves.toBeNull();
    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(4);
  });

  it('fails closed when duplicate player ids appear across pagination pages', async () => {
    const firstPageIds = Array.from({ length: 100 }, (_, index) => `p${index + 1}`);
    mockedFetchWithRetry
      .mockResolvedValueOnce(paginatedPlayers(firstPageIds, 1, 101, 2))
      .mockResolvedValueOnce(paginatedPlayers(['p100'], 2, 101, 2));

    await expect(fetchAllPlayersForSetup<{ id: string }>()).resolves.toBeNull();
    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(2);
  });

  it('does not cache an invalid player identity so the next poll can recover', async () => {
    mockedFetchWithRetry
      .mockResolvedValueOnce(Response.json({ data: [{ id: '__BREAK__' }] }) as never)
      .mockResolvedValueOnce(paginatedPlayers(['recovered'], 1, 1, 1));

    await expect(fetchAllPlayersForSetup<{ id: string }>()).resolves.toBeNull();
    await expect(fetchAllPlayersForSetup<{ id: string }>()).resolves.toEqual([{ id: 'recovered' }]);
    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(2);
  });
});

import { fetchAllPlayersForSetup, resolveAllPlayers } from "@/lib/qualification-page-data";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

jest.mock("@/lib/fetch-with-retry", () => ({
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

describe("qualification page data helpers", () => {
  beforeEach(() => {
    mockedFetchWithRetry.mockReset();
  });

  it("requests the setup player list with the API cap", async () => {
    mockedFetchWithRetry.mockResolvedValue(paginatedPlayers(["p1"], 1, 1, 1));

    await expect(fetchAllPlayersForSetup<{ id: string }>()).resolves.toEqual([{ id: "p1" }]);
    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(1);
    expect(mockedFetchWithRetry).toHaveBeenCalledWith("/api/players?limit=100");
  });

  it("loads a second page so players above the first 100 remain selectable", async () => {
    const firstPageIds = Array.from({ length: 100 }, (_, index) => `p${index + 1}`);
    mockedFetchWithRetry
      .mockResolvedValueOnce(paginatedPlayers(firstPageIds, 1, 101, 2))
      .mockResolvedValueOnce(paginatedPlayers(["p101"], 2, 101, 2));

    const players = await fetchAllPlayersForSetup<{ id: string }>();

    expect(players).toHaveLength(101);
    expect(players?.[100]).toEqual({ id: "p101" });
    expect(mockedFetchWithRetry).toHaveBeenNthCalledWith(1, "/api/players?limit=100");
    expect(mockedFetchWithRetry).toHaveBeenNthCalledWith(2, "/api/players?limit=100&page=2");
  });

  it("fails closed before issuing unbounded requests for rosters above 300 players", async () => {
    const firstPageIds = Array.from({ length: 100 }, (_, index) => `p${index + 1}`);
    mockedFetchWithRetry.mockResolvedValueOnce(paginatedPlayers(firstPageIds, 1, 301, 4));

    await expect(fetchAllPlayersForSetup<{ id: string }>()).resolves.toBeNull();
    expect(mockedFetchWithRetry).toHaveBeenCalledTimes(1);
  });

  it("fails closed when pagination metadata changes while loading the roster", async () => {
    const firstPageIds = Array.from({ length: 100 }, (_, index) => `p${index + 1}`);
    mockedFetchWithRetry
      .mockResolvedValueOnce(paginatedPlayers(firstPageIds, 1, 101, 2))
      .mockResolvedValueOnce(paginatedPlayers(["p101"], 2, 102, 2));

    await expect(fetchAllPlayersForSetup<{ id: string }>()).resolves.toBeNull();
  });

  it("accepts a legacy response below the page cap but rejects an ambiguous full page without metadata", async () => {
    mockedFetchWithRetry.mockResolvedValueOnce(Response.json({ data: [{ id: "legacy" }] }) as never);

    await expect(fetchAllPlayersForSetup<{ id: string }>()).resolves.toEqual([{ id: "legacy" }]);

    mockedFetchWithRetry.mockResolvedValueOnce(
      Response.json({ data: Array.from({ length: 100 }, (_, index) => ({ id: `p${index + 1}` })) }) as never,
    );

    await expect(fetchAllPlayersForSetup<{ id: string }>()).resolves.toBeNull();
  });

  it("returns null instead of throwing when the players endpoint is unavailable", async () => {
    mockedFetchWithRetry.mockRejectedValue(new Error("players down"));

    await expect(fetchAllPlayersForSetup()).resolves.toBeNull();
  });

  it("prefers the fresh players response and falls back to archived allPlayers", () => {
    expect(resolveAllPlayers([{ id: "fresh" }], [{ id: "archive" }])).toEqual([{ id: "fresh" }]);
    expect(resolveAllPlayers(null, [{ id: "archive" }])).toEqual([{ id: "archive" }]);
    expect(resolveAllPlayers(null, undefined)).toEqual([]);
  });
});

import { fetchAllPlayersForSetup, resolveAllPlayers } from "@/lib/qualification-page-data";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

jest.mock("@/lib/fetch-with-retry", () => ({
  fetchWithRetry: jest.fn(),
}));

const mockedFetchWithRetry = fetchWithRetry as jest.MockedFunction<typeof fetchWithRetry>;

describe("qualification page data helpers", () => {
  beforeEach(() => {
    mockedFetchWithRetry.mockReset();
  });

  it("requests the setup player list with the API cap", async () => {
    mockedFetchWithRetry.mockResolvedValue(Response.json({ data: [{ id: "p1" }] }) as never);

    await expect(fetchAllPlayersForSetup<{ id: string }>()).resolves.toEqual([{ id: "p1" }]);
    expect(mockedFetchWithRetry).toHaveBeenCalledWith("/api/players?limit=100");
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


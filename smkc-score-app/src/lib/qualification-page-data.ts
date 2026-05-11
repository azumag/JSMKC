import { extractArrayData } from "@/lib/api-response";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

const SETUP_PLAYERS_URL = "/api/players?limit=100";

export async function fetchAllPlayersForSetup<TPlayer>(): Promise<TPlayer[] | null> {
  try {
    const response = await fetchWithRetry(SETUP_PLAYERS_URL);
    if (!response.ok) return null;
    return extractArrayData<TPlayer>(await response.json());
  } catch {
    return null;
  }
}

export function resolveAllPlayers<TPlayer>(
  fetchedPlayers: TPlayer[] | null,
  archivedPlayers: TPlayer[] | null | undefined,
): TPlayer[] {
  return fetchedPlayers ?? archivedPlayers ?? [];
}


import { extractArrayData } from "@/lib/api-response";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

// API hard cap from pagination.ts. The default limit=50 silently paginates
// Setup Players once rosters exceed 50; switch to server-side search above 100.
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

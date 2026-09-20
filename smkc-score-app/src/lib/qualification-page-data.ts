import { extractArrayData, extractPaginationMeta } from '@/lib/api-response';
import { fetchWithRetry } from '@/lib/fetch-with-retry';

// The players API caps pages at 100 records. Setup/Edit Players is polled by the
// qualification pages, so keep pagination deliberately bounded rather than
// turning every 3-second poll into an unbounded full-table scan. Rosters above
// this bound fail closed instead of silently presenting the first 100 players as
// a complete list; server-side search is the long-term path for larger rosters.
const SETUP_PLAYERS_PAGE_SIZE = 100;
const MAX_SETUP_PLAYER_PAGES = 3;
const SETUP_PLAYERS_URL = `/api/players?limit=${SETUP_PLAYERS_PAGE_SIZE}`;

function setupPlayersPageUrl(page: number): string {
  return page === 1 ? SETUP_PLAYERS_URL : `${SETUP_PLAYERS_URL}&page=${page}`;
}

export async function fetchAllPlayersForSetup<TPlayer>(): Promise<TPlayer[] | null> {
  try {
    const firstResponse = await fetchWithRetry(setupPlayersPageUrl(1));
    if (!firstResponse.ok) return null;

    const firstPayload = await firstResponse.json();
    const firstPlayers = extractArrayData<TPlayer>(firstPayload);
    const firstMeta = extractPaginationMeta(firstPayload);

    // Legacy/non-paginated payloads can only be trusted as complete when they
    // contain fewer records than the API page cap. Exactly 100 rows without
    // metadata is ambiguous, so fail closed rather than silently truncating.
    if (!firstMeta) {
      return firstPlayers.length < SETUP_PLAYERS_PAGE_SIZE ? firstPlayers : null;
    }

    if (firstMeta.page !== 1 || firstMeta.limit !== SETUP_PLAYERS_PAGE_SIZE) {
      return null;
    }

    if (firstMeta.totalPages > MAX_SETUP_PLAYER_PAGES) {
      return null;
    }

    const players = [...firstPlayers];

    for (let page = 2; page <= firstMeta.totalPages; page += 1) {
      const response = await fetchWithRetry(setupPlayersPageUrl(page));
      if (!response.ok) return null;

      const payload = await response.json();
      const pageMeta = extractPaginationMeta(payload);

      // Each page must describe the same snapshot contract. If the total/count
      // changes while paging, retry on the next poll instead of combining an
      // internally inconsistent roster.
      if (
        !pageMeta ||
        pageMeta.page !== page ||
        pageMeta.limit !== firstMeta.limit ||
        pageMeta.total !== firstMeta.total ||
        pageMeta.totalPages !== firstMeta.totalPages
      ) {
        return null;
      }

      players.push(...extractArrayData<TPlayer>(payload));
    }

    return players.length === firstMeta.total ? players : null;
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

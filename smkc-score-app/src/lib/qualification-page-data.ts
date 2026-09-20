import { extractArrayDataOrNull, extractPaginationMeta } from '@/lib/api-response';
import { fetchWithRetry } from '@/lib/fetch-with-retry';

// The players API caps pages at 100 records. Setup/Edit Players is polled by the
// qualification pages, so keep pagination deliberately bounded rather than
// turning every 3-second poll into an unbounded full-table scan. Rosters above
// this bound fail closed instead of silently presenting the first 100 players as
// a complete list; server-side search is the long-term path for larger rosters.
const SETUP_PLAYERS_PAGE_SIZE = 100;
const MAX_SETUP_PLAYER_PAGES = 3;
const SETUP_PLAYERS_URL = `/api/players?limit=${SETUP_PLAYERS_PAGE_SIZE}`;

// Qualification mode data refreshes every 3 seconds, but the setup-player seed
// does not need that cadence: BM/MR/GP dialogs use server-side search as the
// authoritative discovery path, and TA only needs a reasonably fresh bounded
// seed until it is migrated to the same search contract. Keep one short-lived
// snapshot so a 101-300 player roster does not trigger 2-3 extra requests on
// every qualification poll while still picking up registry changes promptly.
const SETUP_PLAYERS_CACHE_TTL_MS = 30_000;

let cachedSetupPlayers: { players: unknown[]; expiresAt: number } | null = null;
let setupPlayersInFlight: Promise<unknown[] | null> | null = null;

function setupPlayersPageUrl(page: number): string {
  return page === 1 ? SETUP_PLAYERS_URL : `${SETUP_PLAYERS_URL}&page=${page}`;
}

async function loadSetupPlayers<TPlayer>(): Promise<TPlayer[] | null> {
  try {
    const firstResponse = await fetchWithRetry(setupPlayersPageUrl(1));
    if (!firstResponse.ok) return null;

    const firstPayload = await firstResponse.json();
    const firstPlayers = extractArrayDataOrNull<TPlayer>(firstPayload);
    if (!firstPlayers) return null;
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
      const pagePlayers = extractArrayDataOrNull<TPlayer>(payload);
      const pageMeta = extractPaginationMeta(payload);

      // Each page must describe the same snapshot contract. If the total/count
      // changes while paging, retry on the next uncached load instead of
      // combining an internally inconsistent roster. Failed/malformed wrappers
      // are rejected instead of being normalized into a partial empty page.
      if (
        !pagePlayers ||
        !pageMeta ||
        pageMeta.page !== page ||
        pageMeta.limit !== firstMeta.limit ||
        pageMeta.total !== firstMeta.total ||
        pageMeta.totalPages !== firstMeta.totalPages
      ) {
        return null;
      }

      players.push(...pagePlayers);
    }

    return players.length === firstMeta.total ? players : null;
  } catch {
    return null;
  }
}

export async function fetchAllPlayersForSetup<TPlayer>(): Promise<TPlayer[] | null> {
  const now = Date.now();
  if (cachedSetupPlayers && cachedSetupPlayers.expiresAt > now) {
    return [...cachedSetupPlayers.players] as TPlayer[];
  }

  if (!setupPlayersInFlight) {
    setupPlayersInFlight = loadSetupPlayers<unknown>().finally(() => {
      setupPlayersInFlight = null;
    });
  }

  const players = await setupPlayersInFlight;
  if (players === null) {
    // Do not cache transport failures, malformed pagination, or over-limit
    // fail-closed results. The next poll may recover after a transient issue.
    return null;
  }

  cachedSetupPlayers = {
    players: [...players],
    expiresAt: Date.now() + SETUP_PLAYERS_CACHE_TTL_MS,
  };
  return [...players] as TPlayer[];
}

/**
 * Explicit invalidation for tests and future player-registry mutations that
 * need the setup seed refreshed immediately rather than waiting for the TTL.
 */
export function clearSetupPlayersForSetupCache(): void {
  cachedSetupPlayers = null;
}

export function resolveAllPlayers<TPlayer>(
  fetchedPlayers: TPlayer[] | null,
  archivedPlayers: TPlayer[] | null | undefined,
): TPlayer[] {
  return fetchedPlayers ?? archivedPlayers ?? [];
}

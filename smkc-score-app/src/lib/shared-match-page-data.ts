import { createLogger } from '@/lib/client-logger';
import { fetchWithRetry } from '@/lib/fetch-with-retry';

const logger = createLogger({ serviceName: 'shared-match-page-data' });

export type SharedMatchMode = 'BM' | 'MR' | 'GP';

export class SharedMatchNotFoundError extends Error {
  constructor() {
    super('shared-match-not-found');
    this.name = 'SharedMatchNotFoundError';
  }
}

class SharedMatchLoadError extends Error {
  constructor() {
    super('shared-match-load-failed');
    this.name = 'SharedMatchLoadError';
  }
}

export function isSharedMatchNotFoundError(error: Error | string | null): boolean {
  return error instanceof SharedMatchNotFoundError || error === 'shared-match-not-found';
}

export async function fetchSharedMatchPageData<TMatch, TTournament>({
  tournamentId,
  matchId,
  mode,
}: {
  tournamentId: string;
  matchId: string;
  mode: SharedMatchMode;
}): Promise<{ match: TMatch; tournament: TTournament }> {
  const modePath = mode.toLowerCase();

  try {
    const [matchResponse, tournamentResponse] = await Promise.all([
      fetch(`/api/tournaments/${tournamentId}/${modePath}/match/${matchId}`),
      fetchWithRetry(`/api/tournaments/${tournamentId}?fields=summary`),
    ]);

    if (matchResponse.status === 404 || tournamentResponse.status === 404) {
      throw new SharedMatchNotFoundError();
    }

    if (!matchResponse.ok || !tournamentResponse.ok) {
      logger.error('Shared match page fetch returned a generic error response', {
        mode,
        tournamentId,
        matchId,
        matchStatus: matchResponse.status,
        tournamentStatus: tournamentResponse.status,
      });
      throw new SharedMatchLoadError();
    }

    const [matchJson, tournamentJson] = await Promise.all([matchResponse.json(), tournamentResponse.json()]);

    return {
      match: (matchJson.data ?? matchJson) as TMatch,
      tournament: (tournamentJson.data ?? tournamentJson) as TTournament,
    };
  } catch (error) {
    if (error instanceof SharedMatchNotFoundError || error instanceof SharedMatchLoadError) {
      throw error;
    }

    const metadata = error instanceof Error ? { message: error.message, stack: error.stack } : { error };
    logger.error('Failed to load shared match page data', {
      ...metadata,
      mode,
      tournamentId,
      matchId,
    });
    throw new SharedMatchLoadError();
  }
}

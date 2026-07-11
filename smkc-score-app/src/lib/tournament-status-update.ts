type TournamentStatusTarget = {
  archived?: boolean;
};

function readApiErrorDetail(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;

  const candidate = payload as { error?: unknown; message?: unknown };
  if (typeof candidate.error === 'string' && candidate.error.trim()) {
    return candidate.error.trim();
  }
  if (typeof candidate.message === 'string' && candidate.message.trim()) {
    return candidate.message.trim();
  }
  return null;
}

/**
 * Archived tournament summaries are read-only fallbacks backed by R2. They do
 * not have a live database row that can accept lifecycle updates.
 */
export function canUpdateTournamentStatus(tournament: TournamentStatusTarget | null): boolean {
  return tournament !== null && tournament.archived !== true;
}

/**
 * Unwrap the standard API response and turn non-2xx responses into actionable
 * errors. Callers can show the thrown message instead of silently ignoring a
 * rejected status transition.
 */
export async function parseTournamentStatusUpdateResponse<T extends object>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(readApiErrorDetail(payload) ?? `HTTP ${response.status}`);
  }

  const data =
    payload && typeof payload === 'object' && 'data' in payload
      ? (payload as { data?: unknown }).data
      : payload;

  if (!data || typeof data !== 'object') {
    throw new Error('Invalid tournament status update response');
  }

  return data as T;
}

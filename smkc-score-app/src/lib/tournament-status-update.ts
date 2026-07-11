type TournamentStatusTarget = object;

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
 * A summary marked as archived may be a permanent R2-only record, but it may
 * also be a temporary fallback returned after a failed database read. Keep the
 * lifecycle action available and let the PUT endpoint determine whether the
 * live row can actually be updated; any rejection is surfaced by the caller.
 */
export function canUpdateTournamentStatus(tournament: TournamentStatusTarget | null): boolean {
  return tournament !== null;
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
    payload && typeof payload === 'object' && 'data' in payload ? (payload as { data?: unknown }).data : payload;

  if (!data || typeof data !== 'object') {
    throw new Error('Invalid tournament status update response');
  }

  return data as T;
}

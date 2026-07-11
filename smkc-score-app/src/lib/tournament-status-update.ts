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

async function readResponsePayload(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function archivedRestoreUrl(response: Response): string | null {
  const match = response.url.match(/\/api\/tournaments\/[^/?#]+/);
  return match ? `${match[0]}/restore` : null;
}

async function unwrapTournamentResponse<T extends object>(response: Response, payload: unknown): Promise<T> {
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

/**
 * A summary marked as archived may be a permanent R2-only record, but it may
 * also be a temporary fallback returned after a failed database read. Keep the
 * lifecycle action available and let the update/restore endpoints determine
 * whether the tournament can actually be reopened.
 */
export function canUpdateTournamentStatus(tournament: TournamentStatusTarget | null): boolean {
  return tournament !== null;
}

/**
 * Unwrap the status-update response. When reopening an archived-only tournament,
 * the ordinary PUT returns 404 because its live D1 row has already been deleted.
 * In that case, call the admin-only restore endpoint, which recreates the live
 * tournament and its archived competition data in the active state.
 */
export async function parseTournamentStatusUpdateResponse<T extends object>(response: Response): Promise<T> {
  const payload = await readResponsePayload(response);

  if (response.status === 404) {
    const restoreUrl = archivedRestoreUrl(response);
    if (restoreUrl) {
      const restoreResponse = await fetch(restoreUrl, { method: 'POST' });
      return unwrapTournamentResponse<T>(restoreResponse, await readResponsePayload(restoreResponse));
    }
  }

  return unwrapTournamentResponse<T>(response, payload);
}

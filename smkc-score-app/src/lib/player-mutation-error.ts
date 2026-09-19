import { PLAYER_ERROR_CODES } from '@/lib/player-error-codes';

export type PlayerUpdateFailureKind = 'duplicateNickname' | 'generic';

/**
 * Reduces an update failure response to the only user-visible distinction the
 * player-management UI supports. Backend prose and unknown codes are discarded.
 */
export async function classifyPlayerUpdateFailure(response: Response): Promise<PlayerUpdateFailureKind> {
  try {
    const payload = (await response.json()) as { code?: unknown };
    return payload.code === PLAYER_ERROR_CODES.DUPLICATE_NICKNAME ? 'duplicateNickname' : 'generic';
  } catch {
    return 'generic';
  }
}

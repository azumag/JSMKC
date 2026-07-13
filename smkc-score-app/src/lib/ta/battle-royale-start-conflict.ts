import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

/**
 * Returns true when creating Phase 3 entries lost a race with another start
 * request. TTEntry's unique constraint on tournamentId, playerId, and stage
 * makes Prisma report that race as P2002.
 */
export function isTaBattleRoyaleStartConflict(error: unknown): boolean {
  return error instanceof PrismaClientKnownRequestError && error.code === 'P2002';
}

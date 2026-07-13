type PrismaErrorWithCode = {
  code?: unknown;
};

/**
 * Returns true when creating Phase 3 entries lost a race with another start
 * request. TTEntry's unique constraint on tournamentId, playerId, and stage
 * makes Prisma report that race as P2002.
 */
export function isTaBattleRoyaleStartConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as PrismaErrorWithCode).code === 'P2002'
  );
}

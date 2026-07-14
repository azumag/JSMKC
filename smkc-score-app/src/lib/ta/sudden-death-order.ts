/**
 * Pure, dependency-free sudden-death ordering helper shared by the Phase 3
 * write path (finals-phase-manager.ts, which re-exports this for backward
 * compatibility) and read-only replay consumers (phase3-life-replay.ts,
 * cdm-export's tt-lives-replay.ts). Kept in its own leaf module — rather than
 * only living in finals-phase-manager.ts — because that module pulls in
 * Prisma/audit-log/logger and is routinely jest.mock()'d wholesale by API
 * route tests; a pure helper needed by a plain data-replay function must not
 * disappear when the heavy engine module is mocked out.
 */

export interface TimedResult {
  playerId: string;
  timeMs: number;
}

/**
 * Order base-round results using the FULL chain of resolved sudden-death
 * rounds for that base round.
 *
 * A single base round can accumulate several sudden deaths (a life-loss tie
 * resolved first, then a bronze race between the two last-life losers —
 * issue #2773; or a re-tied sudden death continued at the next sequence).
 * Ordering by only the latest sudden death would forget who won the earlier
 * ones: a pair whose base times are equal but whose order was decided by
 * sudden death #1 must keep that order when sudden death #2 (between other
 * players) resolves. For each pair, the LATEST sudden death both players
 * participated in wins; pairs never raced together fall back to base times.
 */
export function orderResultsWithSuddenDeathChain<T extends TimedResult>(
  baseResults: T[],
  resolvedSuddenDeathResults: TimedResult[][],
): T[] {
  // Latest sequence first, so the most recent shared race decides each pair.
  const timesBySequence = resolvedSuddenDeathResults
    .map((results) => new Map(results.map((result) => [result.playerId, result.timeMs])))
    .reverse();
  return [...baseResults].sort((a, b) => {
    for (const times of timesBySequence) {
      const aTime = times.get(a.playerId);
      const bTime = times.get(b.playerId);
      if (aTime !== undefined && bTime !== undefined && aTime !== bTime) {
        return aTime - bTime;
      }
    }
    return a.timeMs - b.timeMs;
  });
}

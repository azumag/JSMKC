/**
 * Server-side qualification rank computation.
 *
 * Computes 1224 competition ranks, applies H2H tiebreakers, and respects
 * admin rankOverrides.  This is extracted from standings-route.ts so that
 * the qualification route can inject the same `_rank` into raw qualification
 * records, eliminating client/server rank mismatches.
 */

export interface ComputeRanksOptions {
  /** Fields used to decide H2H winner. Defaults to { p1: 'score1', p2: 'score2' } */
  matchScoreFields?: { p1: string; p2: string };
}

/**
 * Assign `_rank` and `_rankOverridden` to qualification records.
 *
 * The input array must already be sorted according to `orderBy` (this is
 * guaranteed when the array comes from a Prisma `findMany({ orderBy })` query).
 *
 * @param qualifications - Already sorted qualification records (player included).
 * @param orderBy        - Prisma order-by array used to determine tiedness.
 * @param matches        - Completed qualification matches (non-bye) for H2H.
 * @param options        - Optional score field mapping for H2H winner detection.
 * @returns              - New array with `_rank` / `_rankOverridden` injected,
 *                         sorted by effective rank ascending.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeQualificationRanks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  qualifications: any[],
  orderBy: Array<Partial<Record<string, 'asc' | 'desc'>>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  matches: any[],
  options: ComputeRanksOptions = {},
): any[] {
  if (qualifications.length === 0) return [];

  /*
   * 1. Assign 1224 competition ranks.
   * Two entries share a rank when all their orderBy field values are equal.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ranked: any[] = [];
  for (let i = 0; i < qualifications.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = qualifications[i] as any;
    if (i === 0) {
      ranked.push({ ...q, _rank: 1 });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prev = qualifications[i - 1] as any;
      const isTied = (orderBy ?? []).every((ob) => {
        const field = Object.keys(ob)[0];
        return q[field] === prev[field];
      });
      ranked.push({ ...q, _rank: isTied ? ranked[i - 1]._rank : i + 1 });
    }
  }

  /*
   * 2. H2H tiebreaker: re-sort tied groups by direct match results.
   * Players tied after the primary criteria are re-sorted by how many H2H
   * matches they won within the tied group.  Players from different groups
   * (who never played each other) stay tied.
   */
  if (matches.length > 0) {
    const scoreFields = options.matchScoreFields ?? { p1: 'score1', p2: 'score2' };

    /* Group entries by _rank to find tied sets */
    const rankGroups = new Map<number, typeof ranked>();
    for (const entry of ranked) {
      const g = rankGroups.get(entry._rank) ?? [];
      g.push(entry);
      rankGroups.set(entry._rank, g);
    }

    const tiedPlayerIds = Array.from(rankGroups.values())
      .filter((g) => g.length >= 2)
      .flat()
      .map((e: { playerId: string }) => e.playerId);

    /*
     * Filter matches to only those between tied players.
     * We can't use Prisma here (this is a pure helper), so we assume the
     * caller has already fetched the relevant matches and we filter in-memory.
     */
    const playerIdSet = new Set(tiedPlayerIds);
    const h2hMatches = matches.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any) =>
        // standings-route.ts uses Prisma select without completed/isBye fields,
        // so treat undefined as "include this match" (caller already filtered).
        (m.completed === undefined || m.completed === true) &&
        (m.isBye === undefined || m.isBye !== true) &&
        playerIdSet.has(m.player1Id) &&
        playerIdSet.has(m.player2Id),
    );

    const resolved: typeof ranked = [];
    for (const [rank, group] of [...rankGroups.entries()].sort(([a], [b]) => a - b)) {
      if (group.length < 2) {
        resolved.push(...group);
        continue;
      }

      const gPlayerIds = group.map((e: { playerId: string }) => e.playerId);
      const gPlayerIdSet = new Set(gPlayerIds);
      const groupMatches = h2hMatches.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m: any) => gPlayerIdSet.has(m.player1Id) && gPlayerIdSet.has(m.player2Id),
      );

      /* Tally H2H wins; draws award no win to either player */
      const h2hWins = new Map<string, number>(gPlayerIds.map((id) => [id, 0]));
      for (const m of groupMatches) {
        const s1: number = m[scoreFields.p1];
        const s2: number = m[scoreFields.p2];
        if (s1 > s2) h2hWins.set(m.player1Id, (h2hWins.get(m.player1Id) ?? 0) + 1);
        else if (s2 > s1) h2hWins.set(m.player2Id, (h2hWins.get(m.player2Id) ?? 0) + 1);
      }

      /* Sort by H2H wins desc; preserve original order on equal wins */
      const sortedGroup = [...group].sort(
        (a, b) => (h2hWins.get(b.playerId) ?? 0) - (h2hWins.get(a.playerId) ?? 0),
      );

      /* Re-assign _rank within the group using 1224 competition ranking */
      let subRank = rank;
      for (let i = 0; i < sortedGroup.length; i++) {
        if (i > 0) {
          const prevWins = h2hWins.get(sortedGroup[i - 1].playerId) ?? 0;
          const curWins = h2hWins.get(sortedGroup[i].playerId) ?? 0;
          if (curWins !== prevWins) subRank = rank + i;
        }
        resolved.push({ ...sortedGroup[i], _rank: subRank });
      }
    }

    ranked.splice(0, ranked.length, ...resolved);
  }

  /*
   * 3. Apply rankOverride and sort by effective rank.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withOverrides = ranked.map((entry: any) =>
    entry.rankOverride != null
      ? { ...entry, _rank: entry.rankOverride, _rankOverridden: true }
      : entry,
  );

  withOverrides.sort(
    (
      a: { _rank: number; _rankOverridden?: boolean },
      b: { _rank: number; _rankOverridden?: boolean },
    ) => {
      if (a._rank !== b._rank) return a._rank - b._rank;
      return (b._rankOverridden ? 1 : 0) - (a._rankOverridden ? 1 : 0);
    },
  );

  return withOverrides;
}

/**
 * BM/MR/GP Qualification Points Calculation
 *
 * This module calculates qualification stage points for the three match-based
 * competition modes: Battle Mode (BM), Match Race (MR), and Grand Prix (GP).
 * All three modes use the same round-robin qualification format and identical
 * point calculation logic.
 *
 * Scoring formula:
 *   matchPoints = 2 x wins + 1 x ties + 0 x losses
 *
 * Normalization formula:
 *   normalizedPoints = 1000 * matchPoints / maxMatchPoints
 *
 * Where:
 *   maxMatchPoints = 2 * totalOpponents (for full round-robin)
 *   Each player plays every other player once; max 2 points per match (a win).
 *
 * The 0-1000 normalization ensures qualification points are directly comparable
 * across modes regardless of group size, and provides a consistent scale
 * that combines cleanly with finals points (max 2000) for overall ranking.
 *
 * Examples with 8 players in a group (7 matches each, maxMatchPoints = 14):
 *   7 wins, 0 ties  -> matchPoints=14, normalized=1000 (perfect record)
 *   4 wins, 2 ties   -> matchPoints=10, normalized= 714
 *   0 wins, 0 ties   -> matchPoints= 0, normalized=   0
 *
 * Ranking uses "standard competition ranking" (1224): ties share the same rank,
 * and the next rank skips by the number of tied players.
 */

/**
 * A player's win/tie/loss record from round-robin qualification.
 * Used as input to the points calculation functions.
 */
export interface MatchRecord {
  playerId: string;
  wins: number;
  ties: number;
  losses: number;
}

/**
 * Calculated qualification points for a single player.
 *
 * @property matchPoints      - Raw match points (2xW + 1xT)
 * @property normalizedPoints - Points on 0-1000 scale for cross-mode comparison
 * @property rank             - Position within the qualification group (1-based)
 */
export interface QualificationPointsResult {
  playerId: string;
  matchPoints: number;
  normalizedPoints: number;
  rank: number;
}

/**
 * Calculate raw match points from a win/tie/loss record.
 *
 * The formula awards 2 points per win and 1 per tie. Losses contribute 0 points.
 * The `_losses` parameter is accepted for API clarity (callers pass the full record)
 * but does not affect the calculation, since loss points are defined as 0.
 *
 * @param wins    - Number of wins
 * @param ties    - Number of ties (draws)
 * @param _losses - Number of losses (unused in calculation, kept for API symmetry)
 * @returns Match points: 2*wins + 1*ties
 */
export function calculateMatchPoints(
  wins: number,
  ties: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _losses: number
): number {
  // Formula: 2 points per win, 1 point per tie, 0 for loss.
  // This weighting ensures a win is worth exactly two ties, creating
  // a clear incentive to play for the win.
  return 2 * wins + 1 * ties;
}

/**
 * Calculate the maximum possible match points in a round-robin tournament.
 *
 * In a round-robin, each player faces every other player once.
 * The maximum points achievable is 2 (a win) per match played.
 *
 * @param totalOpponents - Number of opponents each player faces
 * @returns Maximum match points (2 * totalOpponents)
 */
export function calculateMaxMatchPoints(totalOpponents: number): number {
  // Maximum scenario: win every match -> 2 points per match
  return 2 * totalOpponents;
}

/**
 * Normalize raw match points to the 0-1000 scale.
 *
 * The normalization formula is: 1000 * matchPoints / maxMatchPoints
 * This produces a value where:
 *   - Perfect record (all wins) = 1000
 *   - No wins (all losses)     = 0
 *   - Mixed results fall proportionally between
 *
 * The result is rounded to the nearest integer using standard rounding
 * (Math.round), which provides the most intuitive display values.
 *
 * @param matchPoints    - Raw match points to normalize
 * @param maxMatchPoints - Maximum possible match points (denominator)
 * @returns Normalized points in range [0, 1000], or 0 if maxMatchPoints <= 0
 */
export function normalizePoints(
  matchPoints: number,
  maxMatchPoints: number
): number {
  // Guard against division by zero (e.g., a group with only one player)
  if (maxMatchPoints <= 0) {
    return 0;
  }

  const normalized = (1000 * matchPoints) / maxMatchPoints;

  // Round to nearest integer for clean display and storage
  return Math.round(normalized);
}

/**
 * Calculate qualification points for all players in a single group.
 *
 * Assumes a full round-robin: each player plays (n-1) matches where n
 * is the number of players. Points are normalized and players are ranked
 * by normalized points descending, with match points as tiebreaker.
 *
 * Ranking uses "standard competition ranking" (1224): if two players
 * tie at rank 2, the next player is rank 4 (not 3).
 *
 * @param records - Array of player match records from the group
 * @returns Array of QualificationPointsResult sorted by rank ascending
 */
export function calculateQualificationPoints(
  records: MatchRecord[]
): QualificationPointsResult[] {
  if (records.length === 0) {
    return [];
  }

  // In a full round-robin, opponents count is (group size - 1)
  const totalOpponents = records.length - 1;
  const maxMatchPoints = calculateMaxMatchPoints(totalOpponents);

  // Step 1: Calculate raw and normalized points for each player
  const results: QualificationPointsResult[] = records.map((record) => {
    const matchPoints = calculateMatchPoints(
      record.wins,
      record.ties,
      record.losses
    );
    const normalizedPoints = normalizePoints(matchPoints, maxMatchPoints);

    return {
      playerId: record.playerId,
      matchPoints,
      normalizedPoints,
      rank: 0, // Placeholder -- assigned after sorting
    };
  });

  // Step 2: Sort by normalized points descending; use raw match points
  // as secondary sort to break ties deterministically
  results.sort((a, b) => {
    if (b.normalizedPoints !== a.normalizedPoints) {
      return b.normalizedPoints - a.normalizedPoints;
    }
    return b.matchPoints - a.matchPoints;
  });

  // Step 3: Assign ranks using standard competition ranking (1224 scheme).
  // Players with identical normalized points share the same rank.
  // The next distinct rank jumps to the player's 1-based position.
  let currentRank = 1;
  let previousPoints: number | null = null;

  for (let i = 0; i < results.length; i++) {
    if (
      previousPoints !== null &&
      results[i].normalizedPoints === previousPoints
    ) {
      // Tied with previous player -- keep same rank
      results[i].rank = currentRank;
    } else {
      // New point value -- rank equals 1-based position
      currentRank = i + 1;
      results[i].rank = currentRank;
    }
    previousPoints = results[i].normalizedPoints;
  }

  return results;
}

/**
 * Calculate qualification points when not all round-robin matches are complete.
 *
 * Unlike `calculateQualificationPoints`, this function uses each player's
 * actual matches played as the denominator for normalization, rather than
 * assuming a full round-robin. This prevents penalizing players who have
 * fewer matches completed (e.g., due to scheduling or byes).
 *
 * @param records - Player match records extended with `matchesPlayed` count
 * @returns Array of QualificationPointsResult sorted by rank
 */
export function calculateQualificationPointsFromMatches(
  records: (MatchRecord & { matchesPlayed: number })[]
): QualificationPointsResult[] {
  if (records.length === 0) {
    return [];
  }

  // Calculate points based on each player's individual matches played,
  // rather than a fixed group-wide opponent count
  const results: QualificationPointsResult[] = records.map((record) => {
    const matchPoints = calculateMatchPoints(
      record.wins,
      record.ties,
      record.losses
    );
    // Use actual matches played as the normalization base
    const maxMatchPoints = calculateMaxMatchPoints(record.matchesPlayed);
    const normalizedPoints = normalizePoints(matchPoints, maxMatchPoints);

    return {
      playerId: record.playerId,
      matchPoints,
      normalizedPoints,
      rank: 0,
    };
  });

  // Sort and rank identically to the full round-robin version
  results.sort((a, b) => {
    if (b.normalizedPoints !== a.normalizedPoints) {
      return b.normalizedPoints - a.normalizedPoints;
    }
    return b.matchPoints - a.matchPoints;
  });

  let currentRank = 1;
  let previousPoints: number | null = null;

  for (let i = 0; i < results.length; i++) {
    if (
      previousPoints !== null &&
      results[i].normalizedPoints === previousPoints
    ) {
      results[i].rank = currentRank;
    } else {
      currentRank = i + 1;
      results[i].rank = currentRank;
    }
    previousPoints = results[i].normalizedPoints;
  }

  return results;
}

/**
 * Aggregate qualification points across multiple groups into a unified ranking.
 *
 * When a tournament has multiple qualification groups (e.g., Group A and Group B),
 * normalized points allow direct comparison because the 0-1000 scale is
 * independent of group size. This function flattens all group results and
 * re-ranks players globally.
 *
 * @param groupResults - Array where each element is one group's QualificationPointsResult[]
 * @returns Combined results with global ranking applied
 */
export function aggregateGroupQualificationPoints(
  groupResults: QualificationPointsResult[][]
): QualificationPointsResult[] {
  // Flatten all group results into a single array
  const allResults = groupResults.flat();

  // Re-sort globally by normalized points, then match points as tiebreaker
  allResults.sort((a, b) => {
    if (b.normalizedPoints !== a.normalizedPoints) {
      return b.normalizedPoints - a.normalizedPoints;
    }
    return b.matchPoints - a.matchPoints;
  });

  // Assign global ranks using standard competition ranking
  let currentRank = 1;
  let previousPoints: number | null = null;

  for (let i = 0; i < allResults.length; i++) {
    if (
      previousPoints !== null &&
      allResults[i].normalizedPoints === previousPoints
    ) {
      allResults[i].rank = currentRank;
    } else {
      currentRank = i + 1;
      allResults[i].rank = currentRank;
    }
    previousPoints = allResults[i].normalizedPoints;
  }

  return allResults;
}

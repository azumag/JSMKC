/**
 * Finals Points Fixed Tables
 *
 * This module provides lookup tables and utility functions for finals-stage
 * point assignment. Points are awarded based on a player's final placement
 * in each mode's elimination bracket.
 *
 * Unlike qualification points (which are calculated from match records),
 * finals points are predetermined fixed values. This ensures consistent,
 * transparent tournament scoring that players can reference in advance.
 *
 * Point distribution philosophy:
 * - Top 4 positions receive significantly more points to reward reaching
 *   the deepest rounds of elimination.
 * - TA (Time Attack) has unique points for each position (1st through 24th)
 *   because TA finals determine exact individual rankings.
 * - BM/MR/GP share the same table with grouped positions (e.g., 5th-6th share
 *   750 points) because bracket elimination naturally creates tied placements
 *   (both losers of a semi-final share 5th-6th).
 *
 * Point tables (24 positions each):
 *
 * TA Finals:
 *   1st: 2000, 2nd: 1600, 3rd: 1300, 4th: 1000
 *   5th: 800, 6th: 700, 7th: 600, 8th: 500
 *   9th-16th: 420, 400, 380, 360, 340, 320, 300, 280
 *   17th-24th: 160, 150, 140, 130, 120, 110, 100, 90
 *
 * BM/MR/GP Finals (grouped):
 *   1st: 2000, 2nd: 1600, 3rd: 1300, 4th: 1000
 *   5th-6th: 750, 7th-8th: 550
 *   9th-12th: 400, 13th-16th: 300
 *   17th-20th: 150, 21st-24th: 100
 *
 * Maximum finals points: 2000 (1st place in any mode).
 * Combined with max qualification points (1000), each mode can contribute
 * up to 3000 points toward the overall tournament ranking (max 12000 total).
 */

/**
 * Mode type discriminator for finals points lookup.
 * TA uses a distinct points table; BM, MR, and GP share the same table.
 */
export type FinalsMode = "TA" | "BM" | "MR" | "GP";

/**
 * TA Finals points table.
 * Array index corresponds to 0-based position (index 0 = 1st place).
 * TA has unique points per position because individual time-based ranking
 * produces a strict ordering without natural ties.
 */
export const TA_FINALS_POINTS: readonly number[] = [
  2000, // 1st
  1600, // 2nd
  1300, // 3rd
  1000, // 4th
  800,  // 5th
  700,  // 6th
  600,  // 7th
  500,  // 8th
  420,  // 9th
  400,  // 10th
  380,  // 11th
  360,  // 12th
  340,  // 13th
  320,  // 14th
  300,  // 15th
  280,  // 16th
  160,  // 17th
  150,  // 18th
  140,  // 19th
  130,  // 20th
  120,  // 21st
  110,  // 22nd
  100,  // 23rd
  90,   // 24th
] as const;

/**
 * BM/MR/GP Finals points table.
 * Shared across all three match-based modes because they use the same
 * double elimination bracket format, which naturally groups players
 * into tied placement ranges.
 *
 * Array index corresponds to 0-based position (index 0 = 1st place).
 * Positions within the same bracket stage receive identical points
 * (e.g., both semi-final losers receive 750 for 5th-6th).
 */
export const BM_MR_GP_FINALS_POINTS: readonly number[] = [
  2000, // 1st
  1600, // 2nd
  1300, // 3rd
  1000, // 4th
  750,  // 5th (tied with 6th -- both SF losers)
  750,  // 6th
  550,  // 7th (tied with 8th -- both QF losers in losers bracket)
  550,  // 8th
  400,  // 9th  (tied 9th-12th -- eliminated in losers R2/R3)
  400,  // 10th
  400,  // 11th
  400,  // 12th
  300,  // 13th (tied 13th-16th -- eliminated in losers R1)
  300,  // 14th
  300,  // 15th
  300,  // 16th
  150,  // 17th (tied 17th-20th -- did not qualify for top 16)
  150,  // 18th
  150,  // 19th
  150,  // 20th
  100,  // 21st (tied 21st-24th -- lowest qualifying tier)
  100,  // 22nd
  100,  // 23rd
  100,  // 24th
] as const;

/**
 * Look up finals points for a given position in TA mode.
 *
 * Converts the 1-based position to a 0-based array index.
 * Positions beyond 24th receive 0 points (they participated
 * but did not place in the points-earning range).
 *
 * @param position - Final position (1-based: 1 = first place)
 * @returns Points for that position, or 0 if out of range
 */
export function getTAFinalsPoints(position: number): number {
  // Convert 1-based position to 0-based array index
  const index = position - 1;

  if (index < 0 || index >= TA_FINALS_POINTS.length) {
    // Positions beyond 24th earn no finals points
    return 0;
  }

  return TA_FINALS_POINTS[index];
}

/**
 * Look up finals points for a given position in BM, MR, or GP mode.
 *
 * All three modes share the same table because their double elimination
 * bracket format produces identical placement groupings.
 *
 * @param position - Final position (1-based: 1 = first place)
 * @returns Points for that position, or 0 if out of range
 */
export function getBMMRGPFinalsPoints(position: number): number {
  // Convert 1-based position to 0-based array index
  const index = position - 1;

  if (index < 0 || index >= BM_MR_GP_FINALS_POINTS.length) {
    // Positions beyond 24th earn no finals points
    return 0;
  }

  return BM_MR_GP_FINALS_POINTS[index];
}

/**
 * Unified finals points lookup that dispatches to the correct table
 * based on the competition mode.
 *
 * @param mode     - The competition mode (TA, BM, MR, or GP)
 * @param position - Final position (1-based: 1 = first place)
 * @returns Points for that position in the given mode
 */
export function getFinalsPoints(mode: FinalsMode, position: number): number {
  // TA has its own distinct points table
  if (mode === "TA") {
    return getTAFinalsPoints(position);
  }
  // BM, MR, and GP all share the same grouped points table
  return getBMMRGPFinalsPoints(position);
}

/**
 * Computed finals result for a single player, combining their
 * placement with the corresponding point value.
 */
export interface FinalsPointsResult {
  playerId: string;
  position: number;
  points: number;
}

/**
 * Calculate finals points for a batch of players based on their final placements.
 *
 * This is a convenience function that maps an array of {playerId, position}
 * pairs to full FinalsPointsResult objects including the looked-up points.
 *
 * @param mode       - The competition mode (TA, BM, MR, or GP)
 * @param placements - Array of player placements to score
 * @returns Array of FinalsPointsResult with points assigned
 */
export function calculateFinalsPoints(
  mode: FinalsMode,
  placements: { playerId: string; position: number }[]
): FinalsPointsResult[] {
  return placements.map((placement) => ({
    playerId: placement.playerId,
    position: placement.position,
    points: getFinalsPoints(mode, placement.position),
  }));
}

/**
 * Get the maximum finals points possible (1st place points).
 *
 * Currently all modes award 2000 points for 1st place. The `_mode` parameter
 * is accepted for API consistency, allowing future flexibility if different
 * modes ever need different max values.
 *
 * @param _mode - The competition mode (currently unused; all modes return 2000)
 * @returns Maximum finals points (2000)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getMaxFinalsPoints(_mode: FinalsMode): number {
  // All modes currently have the same 1st-place value.
  // The mode parameter is retained for API consistency and future extensibility.
  return 2000;
}

/**
 * Get the position range that shares the same point value.
 *
 * In BM/MR/GP, certain positions are grouped (e.g., 5th and 6th both
 * receive 750 points). This function returns the start and end of the
 * group containing the given position, useful for displaying "5th-6th"
 * instead of just "5th" or "6th".
 *
 * TA has unique points per position, so every range is a single position.
 *
 * @param mode     - The competition mode
 * @param position - A position within the range to look up
 * @returns Object with `start` and `end` positions of the group
 */
export function getPositionRange(
  mode: FinalsMode,
  position: number
): { start: number; end: number } {
  // TA: each position has unique points, so the range is always [pos, pos]
  if (mode === "TA") {
    return { start: position, end: position };
  }

  // BM/MR/GP: predefined grouped ranges matching the points table structure.
  // These ranges correspond to the bracket elimination stages where
  // multiple players are eliminated at the same point.
  const groupRanges = [
    { start: 1, end: 1 },     // 1st (Grand Final winner)
    { start: 2, end: 2 },     // 2nd (Grand Final loser)
    { start: 3, end: 3 },     // 3rd (Losers Final loser)
    { start: 4, end: 4 },     // 4th (Losers SF loser)
    { start: 5, end: 6 },     // 5th-6th (Losers R3 losers)
    { start: 7, end: 8 },     // 7th-8th (Losers R2 losers)
    { start: 9, end: 12 },    // 9th-12th (Losers R1 losers)
    { start: 13, end: 16 },   // 13th-16th (did not advance past qualification top 16)
    { start: 17, end: 20 },   // 17th-20th
    { start: 21, end: 24 },   // 21st-24th
  ];

  for (const range of groupRanges) {
    if (position >= range.start && position <= range.end) {
      return range;
    }
  }

  // Position beyond the defined ranges (beyond 24th)
  return { start: position, end: position };
}

/**
 * Format a number as an ordinal string (e.g., 1 -> "1st", 2 -> "2nd").
 *
 * Handles the special cases for 11th, 12th, and 13th (which use "th"
 * instead of the standard "st", "nd", "rd" suffixes).
 *
 * @param position - Position number (1-based)
 * @returns Formatted ordinal string (e.g., "1st", "2nd", "3rd", "11th")
 */
export function formatOrdinal(position: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const value = position % 100;

  // Special case: 11th, 12th, 13th always use "th" suffix
  // (English ordinal exception for "teens")
  if (value >= 11 && value <= 13) {
    return `${position}th`;
  }

  // Standard suffix lookup: 1->st, 2->nd, 3->rd, everything else->th
  const suffix = suffixes[value % 10] || "th";
  return `${position}${suffix}`;
}

/**
 * Format a position range as a human-readable string.
 *
 * For single positions (TA mode or top-4 in BM/MR/GP): returns "1st", "2nd", etc.
 * For grouped positions: returns "5th-6th", "9th-12th", etc.
 *
 * @param mode     - The competition mode (determines grouping)
 * @param position - A position within the range to format
 * @returns Formatted range string (e.g., "5th-6th" or "1st")
 */
export function formatPositionRange(mode: FinalsMode, position: number): string {
  const range = getPositionRange(mode, position);

  // Single position -- no range needed
  if (range.start === range.end) {
    return formatOrdinal(range.start);
  }

  // Range: "Xth-Yth"
  return `${formatOrdinal(range.start)}-${formatOrdinal(range.end)}`;
}

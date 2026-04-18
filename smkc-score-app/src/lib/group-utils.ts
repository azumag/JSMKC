/**
 * Group assignment utilities for BM/MR/GP qualification modes.
 *
 * Pure functions for group management, extracted for testability.
 * These are used by the GroupSetupDialog component.
 */

/** Available qualification groups (supports up to 4 groups per §10.2) */
export const GROUPS = ["A", "B", "C", "D"] as const;

/** Valid range for group count */
const MIN_GROUPS = 2;
const MAX_GROUPS = GROUPS.length;

/** Minimum player count to show a group-count recommendation in the UI */
export const MIN_PLAYERS_FOR_RECOMMENDATION = 8;

/** Player-group assignment entry with optional seeding */
export interface SetupPlayer {
  playerId: string;
  group: string;
  seeding?: number;
}

/**
 * Clamp groupCount to valid range [2, GROUPS.length].
 * Prevents division-by-zero and out-of-bounds access.
 */
function clampGroupCount(groupCount: number): number {
  return Math.max(MIN_GROUPS, Math.min(MAX_GROUPS, Math.floor(groupCount)));
}

/**
 * Recommend a group count based on the number of players.
 *
 * Per §4.1: players are divided into 2-4 groups based on participant count.
 * Targets 5-8 players per group for balanced round-robin scheduling.
 *
 * Thresholds (based on CDM2025 experience and §10.3):
 *   ≤15 players → 2 groups (4-8 per group)
 *   16-23 players → 3 groups (5-8 per group)
 *   24+ players → 4 groups (6+ per group)
 *
 * @param playerCount - Number of players to distribute
 * @returns Recommended group count (2, 3, or 4)
 */
export function recommendGroupCount(playerCount: number): number {
  if (playerCount >= 24) return MAX_GROUPS; // 4
  if (playerCount >= 16) return 3;
  return MIN_GROUPS; // 2
}

/**
 * Distributes players across groups by seeding using cyclic distribution.
 *
 * Per requirements.md §10.2:
 * - seed1→A, seed2→B, seed3→C, seed4→D, seed5→A, seed6→B...
 * - Players without seeding are placed at the end.
 *
 * @param players - Array of player-group assignments to redistribute
 * @param groupCount - Number of groups (2, 3, or 4)
 * @returns New array with seeding-based group assignments (does not mutate input)
 */
export function assignGroupsBySeeding(
  players: SetupPlayer[],
  groupCount: number,
): SetupPlayer[] {
  const safeCount = clampGroupCount(groupCount);
  const groups = GROUPS.slice(0, safeCount);
  /* Sort by seeding ascending; players without seeding go to end */
  const sorted = [...players].sort(
    (a, b) => (a.seeding == null ? Infinity : a.seeding) - (b.seeding == null ? Infinity : b.seeding),
  );
  return sorted.map((p, idx) => ({
    ...p,
    group: groups[idx % safeCount],
  }));
}

/**
 * Distributes players evenly across groups in random order.
 * Uses Fisher-Yates shuffle for unbiased randomization,
 * then round-robin assigns groups.
 *
 * @param players - Array of player-group assignments to redistribute
 * @param groupCount - Number of groups to distribute across (default: 3)
 * @returns New array with randomized group assignments (does not mutate input)
 */
export function randomlyAssignGroups(
  players: SetupPlayer[],
  groupCount: number = 3,
): SetupPlayer[] {
  const safeCount = clampGroupCount(groupCount);
  const groups = GROUPS.slice(0, safeCount);
  /* Fisher-Yates shuffle for unbiased random ordering */
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  /* Round-robin assignment across specified number of groups */
  return shuffled.map((p, idx) => ({
    ...p,
    group: groups[idx % safeCount],
  }));
}

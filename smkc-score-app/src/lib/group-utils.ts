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
    (a, b) => (a.seeding ?? Infinity) - (b.seeding ?? Infinity),
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

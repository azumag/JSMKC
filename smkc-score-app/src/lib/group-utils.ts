/**
 * Group assignment utilities for BM/MR/GP qualification modes.
 *
 * Pure functions for group management, extracted for testability.
 * These are used by the GroupSetupDialog component.
 */

/** Available qualification groups */
export const GROUPS = ["A", "B", "C"] as const;

/** Player-group assignment entry */
export interface SetupPlayer {
  playerId: string;
  group: string;
}

/**
 * Distributes players evenly across groups A, B, C in random order.
 * Uses Fisher-Yates shuffle for unbiased randomization,
 * then round-robin assigns groups.
 *
 * @param players - Array of player-group assignments to redistribute
 * @returns New array with randomized group assignments (does not mutate input)
 */
export function randomlyAssignGroups(players: SetupPlayer[]): SetupPlayer[] {
  /* Fisher-Yates shuffle for unbiased random ordering */
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  /* Round-robin assignment across groups */
  return shuffled.map((p, idx) => ({
    ...p,
    group: GROUPS[idx % GROUPS.length],
  }));
}

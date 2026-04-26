/**
 * Shared type definitions used across multiple tournament pages.
 */

/** Player data returned by the /api/players endpoint */
export interface Player {
  id: string;
  name: string;
  nickname: string;
  /** True when the player has no streaming camera; used to warn admins before TV# assignment. */
  noCamera?: boolean;
}

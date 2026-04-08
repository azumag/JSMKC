/**
 * Shared type definitions used across multiple tournament pages.
 */

/** Player data returned by the /api/players endpoint */
export interface Player {
  id: string;
  name: string;
  nickname: string;
}

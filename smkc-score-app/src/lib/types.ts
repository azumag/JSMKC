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
  /**
   * Stored country value (ISO 3166-1 alpha-2 code or legacy free-text name).
   * Sourced from PLAYER_PUBLIC_SELECT; rendered as an inline flag beside the
   * nickname via <CountryFlag>. Optional/nullable since it may be unset.
   */
  country?: string | null;
}

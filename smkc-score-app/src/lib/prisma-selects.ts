/**
 * Reusable Prisma `select` shapes.
 *
 * Centralizing these keeps query payloads predictable and makes it easy to
 * audit which fields leak through API responses. The previous codebase used
 * a wildcard player include everywhere, which fetched every column on
 * `Player` (createdAt/updatedAt/deletedAt/version/userId, plus the omitted
 * `password`) even though almost all consumers only ever read id/name/
 * nickname/country/noCamera. The wider rows cost both D1 bandwidth and
 * downstream JSON parsing — multiplied by polling, that adds up. Switching
 * to an explicit select shape trims the round-trip without touching any
 * read-site logic that already only references these fields.
 */

/**
 * The public-facing subset of Player fields used by tournament UI flows
 * (standings, brackets, match cards, overlays). Excludes timestamps,
 * deletedAt, version, userId, and the always-sensitive password column.
 */
export const PLAYER_PUBLIC_SELECT = {
  id: true,
  name: true,
  nickname: true,
  country: true,
  noCamera: true,
} as const;

/**
 * Variant that additionally exposes `userId` for endpoints that have to
 * cross-check the linked NextAuth user against the current session
 * (score-report authorisation, participant edit). The field is not safe
 * to surface in public API responses, so this select shape MUST stay
 * confined to authorisation-aware code paths and never be returned
 * verbatim to non-admin clients.
 */
export const PLAYER_AUTH_SELECT = {
  ...PLAYER_PUBLIC_SELECT,
  userId: true,
} as const;

type BmMrMatchLeanSelectRequiredField =
  'id' | 'tournamentId' | 'player1Id' | 'player2Id' | 'score1' | 'score2' | 'rounds' | 'completed' | 'isBye';

/**
 * Shared lean select for BM/MR qualification match score updates.
 *
 * The `satisfies` contract is intentionally the regression guard for this
 * field set. Route tests verify BM/MR both pass this shared object into Prisma;
 * this type contract prevents accidental removal of fields that the shared PUT
 * response and qualification recalculation path read immediately after update.
 * The `Record<BmMrMatchLeanSelectRequiredField, true>` part is the contract
 * for required fields; `Record<string, true>` additionally constrains all
 * entries to explicit `true` scalar-select values.
 */
export const BM_MR_MATCH_LEAN_SELECT = {
  id: true,
  tournamentId: true,
  player1Id: true,
  player2Id: true,
  score1: true,
  score2: true,
  rounds: true,
  completed: true,
  isBye: true,
} as const satisfies Record<BmMrMatchLeanSelectRequiredField, true> & Record<string, true>;

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

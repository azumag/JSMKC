/**
 * GP position formatting utility shared across admin, match-detail, and participant pages.
 *
 * Formats a 1-based position number as a localised ordinal string:
 *   ja: "1位", "2位", ...
 *   en: "1st", "2nd", "3rd", "4th", ...
 *
 * Special case: position 0 represents a "game over" result and returns the
 * caller-supplied label (derived from the common translation namespace).
 *
 * @param position      1-based finishing position (or 0 for game-over)
 * @param locale        Current locale string (e.g. "ja", "en")
 * @param gameOverLabel Localised label for position 0 (e.g. tCommon("gameOver"))
 */
export function formatGpPosition(position: number, locale: string, gameOverLabel: string): string {
  if (position === 0) return gameOverLabel;
  if (locale === "ja") return `${position}位`;

  // Standard English ordinal suffix (handles 11th/12th/13th edge cases)
  const mod10 = position % 10;
  const mod100 = position % 100;
  if (mod10 === 1 && mod100 !== 11) return `${position}st`;
  if (mod10 === 2 && mod100 !== 12) return `${position}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${position}rd`;
  return `${position}th`;
}

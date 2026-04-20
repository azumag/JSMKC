import prisma from "@/lib/prisma";

export const TOURNAMENT_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * UUID v4 pattern: 8-4-4-4-12 hex digits (uppercase allowed).
 * Allows UUID-format tournament IDs to pass validation fallback.
 */
const UUID_REGEX = /^[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}$/;

export function normalizeTournamentSlug(slug: unknown): string | null | undefined {
  if (slug === undefined) return undefined;
  if (slug === null) return null;
  if (typeof slug !== "string") return undefined;

  const normalized = slug.trim().toLowerCase();
  return normalized === "" ? null : normalized;
}

export function isValidTournamentSlug(slug: string): boolean {
  return TOURNAMENT_SLUG_REGEX.test(slug) || UUID_REGEX.test(slug);
}

export async function resolveTournamentId(identifier: string): Promise<string> {
  try {
    const tournament = await prisma.tournament.findFirst({
      where: {
        OR: [{ id: identifier }, { slug: identifier }],
      },
      select: { id: true },
    });

    return tournament?.id ?? identifier;
  } catch {
    // On DB error, validate identifier format before returning it.
    // Invalid identifiers could indicate injection attempts or malformed input.
    if (!isValidTournamentSlug(identifier)) {
      throw new Error(`Invalid tournament identifier: ${identifier}`);
    }
    return identifier;
  }
}

export function getTournamentUrlIdentifier(tournament: { id: string; slug?: string | null }): string {
  return tournament.slug || tournament.id;
}
import prisma from "@/lib/prisma";

export const TOURNAMENT_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeTournamentSlug(slug: unknown): string | null | undefined {
  if (slug === undefined) return undefined;
  if (slug === null) return null;
  if (typeof slug !== "string") return undefined;

  const normalized = slug.trim().toLowerCase();
  return normalized === "" ? null : normalized;
}

export function isValidTournamentSlug(slug: string): boolean {
  return TOURNAMENT_SLUG_REGEX.test(slug);
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
    return identifier;
  }
}

export function getTournamentUrlIdentifier(tournament: { id: string; slug?: string | null }): string {
  return tournament.slug || tournament.id;
}

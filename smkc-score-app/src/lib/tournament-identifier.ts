import type { Prisma } from "@prisma/client";
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

/**
 * Resolve a tournament by its URL identifier (id or slug) and pull whichever
 * fields the caller already needs in the same query.
 *
 * Most route handlers used to call `resolveTournamentId(id)` first (a
 * findFirst that only reads the id), then immediately re-fetch the same
 * row with `prisma.tournament.findUnique({ where: { id }, select: ... })`
 * to grab fields like `qualificationConfirmed`. Production logs showed
 * those two queries running back-to-back on every poll, doubling the D1
 * round-trip cost. Folding both into one findFirst eliminates the extra
 * trip — the resolution and the field projection happen in the same
 * statement.
 *
 * Returns null when no tournament matches; callers can decide whether to
 * 404 or fall back to the raw identifier.
 */
export async function resolveTournament<T extends Prisma.TournamentSelect>(
  identifier: string,
  select: T,
): Promise<Prisma.TournamentGetPayload<{ select: T }> | null> {
  // The select must include `id` so the caller can keep using the resolved
  // id for downstream queries — but we don't override the caller's intent
  // when they've already opted in.
  const finalSelect = ('id' in select ? select : { ...select, id: true }) as T;
  const tournament = await prisma.tournament.findFirst({
    where: { OR: [{ id: identifier }, { slug: identifier }] },
    select: finalSelect,
  });
  return tournament as Prisma.TournamentGetPayload<{ select: T }> | null;
}
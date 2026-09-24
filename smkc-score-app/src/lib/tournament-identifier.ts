import prisma from '@/lib/prisma';

export const TOURNAMENT_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Generic UUID-format fallback: 8-4-4-4-12 hex digits (uppercase allowed).
 * This intentionally accepts existing UUID-shaped tournament IDs regardless
 * of UUID version nibble; do not narrow it to v4-only validation.
 */
const UUID_REGEX = /^[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}$/;

export function normalizeTournamentSlug(slug: unknown): string | null | undefined {
  if (slug === undefined) return undefined;
  if (slug === null) return null;
  if (typeof slug !== 'string') return undefined;

  const normalized = slug.trim().toLowerCase();
  return normalized === '' ? null : normalized;
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

    if (tournament?.id) return tournament.id;
  } catch {
    // A database read failure may still fall back to a validated identifier so
    // callers retain the existing degraded-mode behavior.
  }

  // Whether the lookup missed normally or failed, never pass a malformed raw
  // identifier downstream. CUID-style ids, canonical slugs, and UUID-format
  // ids all satisfy the same validator used by the previous DB-error fallback.
  if (!isValidTournamentSlug(identifier)) {
    throw new Error(`Invalid tournament identifier: ${identifier}`);
  }
  return identifier;
}

export function getTournamentUrlIdentifier(tournament: { id: string; slug?: string | null }): string {
  const slug = tournament.slug;
  return typeof slug === 'string' && isValidTournamentSlug(slug) ? slug : tournament.id;
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
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function resolveTournament(identifier: string, select: Record<string, boolean>): Promise<any | null> {
  // The select must include `id` so the caller can keep using the resolved
  // id for downstream queries — but we don't override the caller's intent
  // when they've already opted in.
  const finalSelect = 'id' in select ? select : { ...select, id: true };
  const tournament = await prisma.tournament.findFirst({
    where: { OR: [{ id: identifier }, { slug: identifier }] },
    select: finalSelect,
  });
  return tournament;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

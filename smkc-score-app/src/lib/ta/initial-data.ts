/**
 * Server-side initial data fetcher for the TA qualification page.
 *
 * Called from the TA Server Component (app/tournaments/[id]/ta/page.tsx) to
 * pre-fetch the same payload that the client's usePolling would otherwise fetch
 * on first mount. Passing this as `initialData` to usePolling eliminates the
 * loading skeleton flash on first paint.
 *
 * The shape mirrors the return value of `fetchTournamentData` in page-client.tsx
 * so that usePolling can seed its state directly without any transformation.
 */

import prisma from '@/lib/prisma';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import { resolveTournament } from '@/lib/tournament-identifier';

/** Player fields exposed to the TA qualification UI. */
export interface TaPlayer {
  id: string;
  name: string;
  nickname: string;
  country: string | null;
  noCamera: boolean;
}

/**
 * Combined initial data shape that usePolling seeds from.
 * Must stay in sync with the return value of fetchTournamentData in page-client.tsx.
 */
export interface TaInitialData {
  entries: unknown[];
  allPlayers: TaPlayer[];
  qualificationRegistrationLocked: boolean;
  frozenStages: string[];
  taPlayerSelfEdit: boolean;
}

const KNOCKOUT_STAGES = ['phase1', 'phase2', 'phase3'] as const;

/** Returns true when at least one knockout-stage entry exists, locking registration. */
async function hasKnockoutStageStarted(tournamentId: string): Promise<boolean> {
  const entry = await prisma.tTEntry.findFirst({
    where: { tournamentId, stage: { in: [...KNOCKOUT_STAGES] } },
    select: { id: true },
  });
  return Boolean(entry);
}

/**
 * Pre-fetches TA qualification data for a tournament.
 *
 * Runs the same queries as GET /api/tournaments/[id]/ta plus the players list
 * in one parallel batch, returning the data shape expected by usePolling in the
 * TA client component.
 *
 * @param id Tournament ID or slug
 * @returns Initial data ready to pass as `initialData` to usePolling,
 *          or null on any error (the client falls back to its own first poll).
 */
export async function fetchTaInitialData(id: string): Promise<TaInitialData | null> {
  try {
    const tournament = await resolveTournament(id, { id: true, frozenStages: true, taPlayerSelfEdit: true });
    // Return null so the client falls back to its own first poll, same as qual-initial-data.ts.
    if (!tournament) return null;
    const tournamentId = tournament.id;

    const [entries, knockoutStarted, allPlayers] = await Promise.all([
      prisma.tTEntry.findMany({
        where: { tournamentId, stage: 'qualification' },
        include: { player: { select: PLAYER_PUBLIC_SELECT } },
        orderBy: [{ rank: 'asc' }, { totalTime: 'asc' }],
      }),
      hasKnockoutStageStarted(tournamentId),
      prisma.player.findMany({
        where: { id: { not: '__BREAK__' } },
        orderBy: { nickname: 'asc' },
        take: 100,
        select: PLAYER_PUBLIC_SELECT,
      }),
    ]);

    return {
      entries,
      allPlayers,
      qualificationRegistrationLocked: knockoutStarted,
      frozenStages: (tournament.frozenStages as string[]) ?? [],
      taPlayerSelfEdit: tournament.taPlayerSelfEdit ?? true,
    };
  } catch {
    // Intentionally swallowed: the client component handles data === null
    // gracefully by falling back to its own first poll.
    return null;
  }
}

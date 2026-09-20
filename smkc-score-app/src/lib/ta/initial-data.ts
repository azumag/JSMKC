/**
 * Server-side initial data fetcher for the TA qualification page.
 *
 * Called from the TA Server Component (app/tournaments/[id]/ta/page.tsx) to
 * pre-fetch the same tournament payload that the client's usePolling would
 * otherwise fetch on first mount. Passing this as `initialData` to usePolling
 * eliminates the loading skeleton flash on first paint.
 *
 * Player discovery intentionally does not live here. Setup/Edit Players uses
 * the bounded `/api/players` server-side search only while its admin dialog is
 * open, so the live qualification payload stays independent of roster size.
 */

import prisma from '@/lib/prisma';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import { resolveTournament } from '@/lib/tournament-identifier';

/**
 * Combined initial data shape that usePolling seeds from.
 * Must stay in sync with the return value of fetchTournamentData in page-client.tsx.
 */
export interface TaInitialData {
  entries: unknown[];
  qualificationRegistrationLocked: boolean;
  frozenStages: string[];
  taPlayerSelfEdit: boolean;
  taBattleRoyaleMode: boolean;
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
 * Runs the same tournament queries as GET /api/tournaments/[id]/ta in one
 * parallel batch. The global player list is deliberately excluded: the setup
 * dialog performs its own bounded server-side search when opened.
 *
 * @param id Tournament ID or slug
 * @returns Initial data ready to pass as `initialData` to usePolling,
 *          or null on any error (the client falls back to its own first poll).
 */
export async function fetchTaInitialData(id: string): Promise<TaInitialData | null> {
  try {
    const tournament = await resolveTournament(id, {
      id: true,
      frozenStages: true,
      taPlayerSelfEdit: true,
      taBattleRoyaleMode: true,
    });
    // Return null so the client falls back to its own first poll, same as qual-initial-data.ts.
    if (!tournament) return null;
    const tournamentId = tournament.id;

    const [entries, knockoutStarted] = await Promise.all([
      prisma.tTEntry.findMany({
        where: { tournamentId, stage: 'qualification' },
        include: { player: { select: PLAYER_PUBLIC_SELECT } },
        orderBy: [{ rank: 'asc' }, { totalTime: 'asc' }],
      }),
      hasKnockoutStageStarted(tournamentId),
    ]);

    return {
      entries,
      qualificationRegistrationLocked: knockoutStarted,
      frozenStages: (tournament.frozenStages as string[]) ?? [],
      taPlayerSelfEdit: tournament.taPlayerSelfEdit ?? true,
      taBattleRoyaleMode: tournament.taBattleRoyaleMode ?? false,
    };
  } catch {
    // Intentionally swallowed: the client component handles data === null
    // gracefully by falling back to its own first poll.
    return null;
  }
}

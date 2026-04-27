/**
 * Server-side initial data fetcher for BM / MR / GP qualification pages.
 *
 * Called from the respective Server Components to pre-fetch the same payload
 * that the client's usePolling would otherwise fetch on first mount.  Passing
 * this as `initialData` to usePolling eliminates the loading skeleton flash on
 * first paint for all three event types.
 *
 * The shape mirrors the return value of `fetchTournamentData` in each
 * page-client.tsx so that usePolling can seed its state directly.
 */

import prisma from '@/lib/prisma';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import { resolveTournament } from '@/lib/tournament-identifier';
import { computeQualificationRanks } from '@/lib/server-ranking';
import type { EventTypeConfig } from '@/lib/event-types/types';

/** Combined initial data shape that usePolling seeds from.
 *  Must stay in sync with the return value of fetchTournamentData in
 *  each bm/mr/gp page-client.tsx. */
export interface QualInitialData {
  qualifications: unknown[];
  matches: unknown[];
  allPlayers: unknown[];
  qualificationConfirmed: boolean;
}

type ModeQualField = 'bmQualificationConfirmed' | 'mrQualificationConfirmed' | 'gpQualificationConfirmed';

/**
 * Pre-fetches qualification data for a BM / MR / GP tournament.
 *
 * Runs the same Prisma queries as GET /api/tournaments/[id]/{bm,mr,gp}
 * plus the players list in one parallel batch.
 *
 * @param config EventTypeConfig for the mode (bmConfig, mrConfig, gpConfig)
 * @param id     Tournament ID or slug
 * @returns Initial data ready to pass as `initialData` to usePolling,
 *          or null on any error (client falls back to its own first poll).
 */
export async function fetchQualInitialData(
  config: EventTypeConfig,
  id: string,
): Promise<QualInitialData | null> {
  try {
    const modeField = `${config.eventTypeCode}QualificationConfirmed` as ModeQualField;
    const tournament = await resolveTournament(id, {
      id: true,
      bmQualificationConfirmed: true,
      mrQualificationConfirmed: true,
      gpQualificationConfirmed: true,
    });
    if (!tournament) return null;

    const tournamentId = tournament.id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qualModel = (p: any) => p[config.qualificationModel];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchModel = (p: any) => p[config.matchModel];

    const [qualifications, matches, allPlayers] = await Promise.all([
      qualModel(prisma).findMany({
        where: { tournamentId },
        include: { player: { select: PLAYER_PUBLIC_SELECT } },
        orderBy: config.qualificationOrderBy,
      }),
      matchModel(prisma).findMany({
        where: { tournamentId, stage: 'qualification' },
        include: {
          player1: { select: PLAYER_PUBLIC_SELECT },
          player2: { select: PLAYER_PUBLIC_SELECT },
        },
        orderBy: { matchNumber: 'asc' },
      }),
      prisma.player.findMany({
        where: { id: { not: '__BREAK__' } },
        orderBy: { nickname: 'asc' },
        take: 100,
        select: PLAYER_PUBLIC_SELECT,
      }),
    ]);

    const rankedQualifications = computeQualificationRanks(
      qualifications,
      config.qualificationOrderBy ?? [],
      matches,
      { matchScoreFields: config.matchScoreFields },
    );

    return {
      qualifications: rankedQualifications,
      matches,
      allPlayers,
      qualificationConfirmed: (tournament as Record<string, unknown>)[modeField] as boolean ?? false,
    };
  } catch {
    // Swallowed intentionally: client falls back to its own first poll.
    return null;
  }
}

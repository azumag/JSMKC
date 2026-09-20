/**
 * Server-side initial data fetcher for BM / MR / GP qualification pages.
 *
 * Called from the respective Server Components to pre-fetch the same mode data
 * that the client's usePolling would otherwise fetch on first mount. Passing
 * this as `initialData` to usePolling eliminates the loading skeleton flash on
 * first paint for all three event types.
 *
 * Setup-player discovery is owned by GroupSetupDialog's bounded server-side
 * search. The initial `allPlayers` seed therefore contains only players already
 * present in qualification assignments instead of querying the global roster.
 */

import prisma from '@/lib/prisma';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import { resolveTournament } from '@/lib/tournament-identifier';
import { computeQualificationRanks, type RankableMatch, type RankableQualification } from '@/lib/server-ranking';
import type { EventTypeConfig } from '@/lib/event-types/types';
import type { Player } from '@/lib/types';

/**
 * Combined initial data shape that usePolling seeds from.
 * Must stay in sync with the return value of fetchTournamentData in each bm/mr/gp page-client.tsx.
 *
 * `qualifications` and `matches` are mode-specific Prisma records (BM/MR/GP delegate payloads
 * augmented with computed rank fields). They remain `unknown[]` here because this interface is
 * shared across all three modes; each page-client casts to its concrete type.
 *
 * `allPlayers` is deliberately only the current qualification-assignment seed.
 * GroupSetupDialog supplements it with bounded server-side search while open.
 */
export interface QualInitialData {
  qualifications: unknown[];
  matches: unknown[];
  allPlayers: Player[];
  qualificationConfirmed: boolean;
}

type ModeQualField = 'bmQualificationConfirmed' | 'mrQualificationConfirmed' | 'gpQualificationConfirmed';

function collectQualificationPlayers(qualifications: RankableQualification[]): Player[] {
  const playersById = new Map<string, Player>();

  for (const qualification of qualifications) {
    const player = qualification.player as Player | undefined;
    if (player?.id) playersById.set(player.id, player);
  }

  return [...playersById.values()];
}

/**
 * Pre-fetches qualification data for a BM / MR / GP tournament.
 *
 * Runs the same qualification/match Prisma queries as
 * GET /api/tournaments/[id]/{bm,mr,gp}. It intentionally does not query the
 * global player registry: current assignment players are already included in
 * the qualification rows, and new-player discovery belongs to the setup
 * dialog's bounded `/api/players` search.
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
    // Cast to a minimal delegate type to avoid the union findMany signature
    // incompatibility: p[QualificationModelKey] produces a union of three Prisma
    // delegates whose findMany type parameters are mutually incompatible in TS.
    // Results are typed as unknown[] in QualInitialData so the cast is safe (#788).
    type FindManyDelegate<T> = { findMany: (args: Record<string, unknown>) => Promise<T[]> };
    const qualModel = prisma[config.qualificationModel] as unknown as FindManyDelegate<RankableQualification>;
    const matchModel = prisma[config.matchModel] as unknown as FindManyDelegate<RankableMatch>;

    const [qualifications, matches] = await Promise.all([
      qualModel.findMany({
        where: { tournamentId },
        include: { player: { select: PLAYER_PUBLIC_SELECT } },
        orderBy: config.qualificationOrderBy,
      }),
      matchModel.findMany({
        where: { tournamentId, stage: 'qualification' },
        include: {
          player1: { select: PLAYER_PUBLIC_SELECT },
          player2: { select: PLAYER_PUBLIC_SELECT },
        },
        orderBy: { matchNumber: 'asc' },
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
      allPlayers: collectQualificationPlayers(rankedQualifications),
      qualificationConfirmed: ((tournament as Record<string, unknown>)[modeField] as boolean) ?? false,
    };
  } catch {
    // Swallowed intentionally: client falls back to its own first poll.
    return null;
  }
}

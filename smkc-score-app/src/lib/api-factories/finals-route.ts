/**
 * Finals Route Factory
 *
 * Generates GET/POST/PUT handlers for double-elimination finals API routes.
 * Eliminates ~400 lines of duplicated bracket logic across BM, MR, and GP
 * finals while preserving each event type's unique response shape and
 * score field mapping.
 *
 * GET styles:
 *   - 'grouped' (BM): matches split into winners/losers/grandFinal arrays
 *   - 'simple'  (MR): flat matches array with bracket metadata
 *   - 'paginated' (GP): paginated matches with bracket metadata
 *
 * POST: Creates an 8-player double-elimination bracket from qualification standings.
 * PUT:  Updates a match score and auto-advances players through the bracket.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { generateBracketStructure, generatePlayoffStructure, roundNames } from '@/lib/double-elimination';
import { selectFinalsEntrantsByGroup } from '@/lib/finals-group-selection';
import { getMrFinalsMaxRounds, getMrFinalsTargetWins } from '@/lib/finals-target-wins';
import { paginate } from '@/lib/pagination';
import { sanitizeInput } from '@/lib/sanitize';
import { createLogger } from '@/lib/logger';
import { createErrorResponse, createSuccessResponse, handleValidationError, handleRateLimitError } from '@/lib/error-handling';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIdentifier } from '@/lib/request-utils';
import { resolveTournamentId } from '@/lib/tournament-identifier';
import { checkQualificationConfirmed } from '@/lib/qualification-confirmed-check';
import { COURSES, CUPS } from '@/lib/constants';

/**
 * Bracket size inference thresholds.
 * 8-player bracket = 17 matches, 16-player bracket = 31 matches.
 * Threshold of 20 distinguishes between the two (>20 means 16-player).
 */
const BRACKET_SIZE_THRESHOLD = 20;

/**
 * Pre-Bracket Playoff ("barrage") entrant count. Supports issue #454:
 * Top 24 qualifiers → Top 16 Upper Bracket, with 12 entrants from qualification
 * positions 13-24 competing for the 4 Upper-Bracket seats 13-16.
 */
const PLAYOFF_ENTRANT_COUNT = 12;

interface FinalsMatchResult {
  winnerId: string;
  loserId: string;
  updateData?: Record<string, unknown>;
}

interface FinalsMatchResultError {
  error: string;
  field?: string;
}

function fisherYatesShuffle<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getOrderedRounds(
  bracketStructure: Array<{ round: string }>,
): string[] {
  return [...new Set(bracketStructure.map((match) => match.round))];
}

function createMrRoundAssignments(
  bracketStructure: Array<{ round: string }>,
  stage: 'playoff' | 'finals',
): Map<string, string[]> {
  const shuffledCourses = fisherYatesShuffle(COURSES);
  const assignments = new Map<string, string[]>();
  let cursor = 0;

  for (const round of getOrderedRounds(bracketStructure)) {
    const roundsNeeded = getMrFinalsMaxRounds({ round, stage });
    const assignedCourses = Array.from({ length: roundsNeeded }, (_, index) =>
      shuffledCourses[(cursor + index) % shuffledCourses.length]
    );
    assignments.set(round, assignedCourses);
    cursor = (cursor + roundsNeeded) % shuffledCourses.length;
  }

  return assignments;
}

function createGpRoundAssignments(
  bracketStructure: Array<{ round: string }>,
): Map<string, string> {
  const shuffledCups = fisherYatesShuffle(CUPS);
  return new Map(
    getOrderedRounds(bracketStructure).map((round, index) => [
      round,
      shuffledCups[index % shuffledCups.length],
    ]),
  );
}

/**
 * Backfill per-round GP cup assignments for legacy matches that were created
 * before the per-round cup feature landed (those rows carry cup=null).
 *
 * Rule (#582 follow-up): within Playoff and Finals, every match in the same
 * round shares one cup. We pick one cup per round here, persist it, and from
 * that point on the admin score dialog always has a cup to render the race
 * table with — no dropdown, no random-on-each-open behaviour.
 *
 * Returns true when at least one row was updated, so the caller can re-fetch.
 */
async function backfillMissingCupsByRound(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelInstance: any,
  tournamentId: string,
  stage: 'finals' | 'playoff',
  matches: Array<{ cup?: string | null; round?: string | null }>,
): Promise<boolean> {
  const existingCupByRound = new Map<string, string>();
  const roundsNeedingCup = new Set<string>();

  for (const match of matches) {
    if (!match.round) continue;
    if (match.cup) {
      existingCupByRound.set(match.round, match.cup);
    } else {
      roundsNeedingCup.add(match.round);
    }
  }

  if (roundsNeedingCup.size === 0) return false;

  /* Reuse already-assigned cups for rounds where some matches have cups and
   * others don't (avoids the mixed-state case diverging). For rounds with no
   * existing cup, pick from a freshly shuffled CUPS list so assignments stay
   * random across tournaments while being fixed per round. */
  const shuffledCups = fisherYatesShuffle(CUPS);
  let cursor = 0;
  const assignments = new Map<string, string>();
  for (const round of roundsNeedingCup) {
    const existing = existingCupByRound.get(round);
    assignments.set(round, existing ?? shuffledCups[cursor++ % shuffledCups.length]);
  }

  for (const [round, cup] of assignments) {
    await modelInstance.updateMany({
      where: { tournamentId, stage, round, cup: null },
      data: { cup },
    });
  }

  return true;
}

/**
 * Configuration for a finals route handler set.
 *
 * Each event type (BM, MR, GP) supplies its own config to produce
 * handlers with the correct Prisma model, score fields, and response shape.
 */
export interface FinalsConfig {
  /** Prisma model name for match records (e.g. 'bMMatch') */
  matchModel: string;
  /** Prisma model name for qualification records (e.g. 'bMQualification') */
  qualificationModel: string;
  /** Logger service name for structured logging */
  loggerName: string;
  /** Ordering for qualification standings to determine seeding */
  qualificationOrderBy: Array<Record<string, 'asc' | 'desc'>>;
  /** GET response style: 'grouped' (BM), 'simple' (MR), 'paginated' (GP) */
  getStyle: 'grouped' | 'simple' | 'paginated';
  /** Database field names for score storage in PUT updates */
  putScoreFields: { dbField1: string; dbField2: string };
  /** Additional body fields to include in PUT update data (e.g. 'rounds' for MR) */
  putAdditionalFields?: string[];
  /** Number of wins required to complete a finals match. Defaults to 3. */
  targetWins?: number;
  /** Resolve number of wins required for a specific match. */
  getTargetWins?: (match: { round?: string | null; stage?: string | null }) => number;
  /** Error message returned when GET fails */
  getErrorMessage: string;
  /** Error message returned when POST fails */
  postErrorMessage: string;
  /** Whether POST endpoint requires admin authentication */
  postRequiresAuth?: boolean;
  /** Whether PUT endpoint requires admin authentication */
  putRequiresAuth?: boolean;
  /** Whether finals/playoff matches should receive shared MR course assignments */
  assignMrCoursesByRound?: boolean;
  /** Whether finals/playoff matches should receive shared GP cup assignments */
  assignGpCupByRound?: boolean;
  /** Optional custom winner/loser resolution for event-specific score rules. */
  resolveMatchResult?: (
    match: Record<string, unknown>,
    score1: number,
    score2: number,
    body: Record<string, unknown>,
  ) => FinalsMatchResult | FinalsMatchResultError;
}

/**
 * Create GET/POST/PUT handlers for a finals route from configuration.
 *
 * @param config - Event-type-specific finals configuration
 * @returns Object with GET, POST, PUT Next.js route handler functions
 */
export function createFinalsHandlers(config: FinalsConfig) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (p: any) => p[config.matchModel];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qualModel = (p: any) => p[config.qualificationModel];

  function getRoundAssignmentData(
    round: string,
    mrAssignments?: Map<string, string[]>,
    gpAssignments?: Map<string, string>,
  ): Record<string, unknown> {
    return {
      ...(config.assignMrCoursesByRound ? { assignedCourses: mrAssignments?.get(round) ?? [] } : {}),
      ...(config.assignGpCupByRound ? { cup: gpAssignments?.get(round) ?? null } : {}),
    };
  }

  /**
   * GET handler: Fetch finals bracket data for a tournament.
   * Response shape depends on config.getStyle.
   */
  async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const logger = createLogger(config.loggerName);
    const { id } = await params;
    const tournamentId = await resolveTournamentId(id);

    // Defensive: verify tournament exists before querying matches
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) {
      return createErrorResponse('Tournament not found', 404, 'NOT_FOUND');
    }

    try {
      /* Shared playoff data for all GET styles.
       * Playoff matches live in a distinct `stage='playoff'` row (issue #454).
       * When present, we also regenerate the bracket structure and reconstruct
       * seed-to-player mappings so the frontend can render the bracket without
       * relying on state from a previous POST response. */
      let playoffMatches = await model(prisma).findMany({
        where: { tournamentId, stage: 'playoff' },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });

      /* Backfill per-round cup assignments for legacy playoff rows (pre-#565).
       * Without this the admin score dialog has no cup and the race table
       * never renders — see #582/#583. */
      if (config.assignGpCupByRound && playoffMatches.length > 0) {
        const backfilled = await backfillMissingCupsByRound(
          model(prisma),
          tournamentId,
          'playoff',
          playoffMatches,
        );
        if (backfilled) {
          playoffMatches = await model(prisma).findMany({
            where: { tournamentId, stage: 'playoff' },
            include: { player1: true, player2: true },
            orderBy: { matchNumber: 'asc' },
          });
        }
      }

      const playoffStructure = playoffMatches.length > 0
        ? generatePlayoffStructure(PLAYOFF_ENTRANT_COUNT)
        : [];

      /* Reconstruct playoff seeded players from DB match data + structure.
       * R1 matches carry player1Seed (5-12) and player2Seed;
       * R2 matches carry player1Seed for BYE seeds (1-4).
       * player2Seed is null for R2 (opponent comes from R1 winner),
       * so we only map seeds from structure-defined positions. */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const playoffSeededPlayers: any[] = [];
      if (playoffMatches.length > 0) {
        const seedMap = new Map<number, { playerId: string; player: unknown }>();
        for (const bracketMatch of playoffStructure) {
          const dbMatch = playoffMatches.find(
            (m: { matchNumber: number }) => m.matchNumber === bracketMatch.matchNumber,
          );
          if (!dbMatch) continue;
          if (bracketMatch.player1Seed != null) {
            seedMap.set(bracketMatch.player1Seed, {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              playerId: (dbMatch as any).player1Id,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              player: (dbMatch as any).player1,
            });
          }
          if (bracketMatch.player2Seed != null) {
            seedMap.set(bracketMatch.player2Seed, {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              playerId: (dbMatch as any).player2Id,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              player: (dbMatch as any).player2,
            });
          }
        }
        for (const [seed, data] of [...seedMap.entries()].sort((a, b) => a[0] - b[0])) {
          playoffSeededPlayers.push({ seed, ...data });
        }
      }

      /* Compute playoff completion flag from DB data so the frontend
       * can show "Create Upper Bracket" even after a page refresh. */
      const playoffR2Matches = playoffMatches.filter(
        (m: { round?: string }) => m.round === 'playoff_r2',
      );
      const playoffComplete = playoffR2Matches.length === 4
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        && playoffR2Matches.every((m: any) => m.completed);

      /* Phase priority: when both playoff and finals exist (Phase-2 has run),
       * default to 'finals' so the UI lands on the Upper Bracket first.
       * The client can still switch to the playoff tab via the archived
       * playoffMatches returned below. */
      const hasFinals = await model(prisma).count({
        where: { tournamentId, stage: 'finals' },
      });
      const phase = hasFinals > 0 ? 'finals' as const
        : playoffMatches.length > 0 ? 'playoff' as const
        : 'finals' as const;

      /* Backfill per-round cup assignments for legacy finals rows before
       * paginating or simple/grouped fetches, so every branch sees the
       * backfilled state (see playoff branch above). */
      if (config.assignGpCupByRound) {
        const legacyFinals = await model(prisma).findMany({
          where: { tournamentId, stage: 'finals' },
          select: { id: true, round: true, cup: true },
        });
        if (legacyFinals.length > 0) {
          await backfillMissingCupsByRound(
            model(prisma),
            tournamentId,
            'finals',
            legacyFinals,
          );
        }
      }

      if (config.getStyle === 'paginated') {
        const { searchParams } = new URL(request.url);
        const page = Number(searchParams.get('page')) || 1;
        const limit = Number(searchParams.get('limit')) || 50;

        const modelInstance = model(prisma);
        const result = await paginate(
          {
            findMany: modelInstance.findMany.bind(modelInstance),
            count: modelInstance.count.bind(modelInstance),
          },
          { tournamentId, stage: 'finals' },
          { matchNumber: 'asc' },
          { page, limit, include: { player1: true, player2: true } },
        );

        /* Infer bracket size from total match count:
         * 8-player bracket = 17 matches, 16-player bracket = 31 matches.
         * Use count > 20 as threshold to distinguish.
         * Use result.meta.total from paginate() to avoid an extra count query. */
        const bracketSize = (result.meta.total ?? 0) > BRACKET_SIZE_THRESHOLD ? 16 : 8;

        const bracketStructure = result.data.length > 0
          ? generateBracketStructure(bracketSize)
          : [];

        return createSuccessResponse({
          ...result,
          bracketStructure,
          bracketSize,
          roundNames,
          qualificationConfirmed: tournament.qualificationConfirmed ?? false,
          phase,
          playoffMatches,
          playoffStructure,
          playoffSeededPlayers,
          playoffComplete,
        });
      }

      /* Shared fetch for 'grouped' and 'simple' styles */
      const matches = await model(prisma).findMany({
        where: { tournamentId, stage: 'finals' },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });

      const bracketSize = matches.length > BRACKET_SIZE_THRESHOLD ? 16 : 8;

      const bracketStructure = matches.length > 0
        ? generateBracketStructure(bracketSize)
        : [];

      if (config.getStyle === 'grouped') {
        const winnersMatches = matches.filter(
          (m: { round?: string }) => m.round?.startsWith('winners_') || false,
        );
        const losersMatches = matches.filter(
          (m: { round?: string }) => m.round?.startsWith('losers_') || false,
        );
        const grandFinalMatches = matches.filter(
          (m: { round?: string }) => m.round?.startsWith('grand_final') || false,
        );

        return createSuccessResponse({
          matches,
          winnersMatches,
          losersMatches,
          grandFinalMatches,
          playoffMatches,
          bracketStructure,
          bracketSize,
          roundNames,
          qualificationConfirmed: tournament.qualificationConfirmed ?? false,
          playoffStructure,
          playoffSeededPlayers,
          playoffComplete,
          phase,
        });
      }

      /* 'simple' style */
      return createSuccessResponse({
        matches,
        bracketStructure,
        bracketSize,
        roundNames,
        qualificationConfirmed: tournament.qualificationConfirmed ?? false,
        phase,
        playoffMatches,
        playoffStructure,
        playoffSeededPlayers,
        playoffComplete,
      });
    } catch (error) {
      logger.error(config.getErrorMessage, { error, tournamentId });
      return createErrorResponse(config.getErrorMessage, 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * POST handler: Create a double-elimination finals bracket from qualification standings.
   * Takes the top N players (default 8) and seeds them into the bracket.
   */
  async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const logger = createLogger(config.loggerName);

    /* Auth check for POST endpoint */
    if (config.postRequiresAuth) {
      const session = await auth();
      if (!session?.user || session.user.role !== 'admin') {
        return createErrorResponse('Forbidden', 403, 'FORBIDDEN');
      }
    }

    /* Rate limit: prevent abuse on bracket creation */
    const postClientIp = getClientIdentifier(request);
    const postRateResult = await checkRateLimit('general', postClientIp);
    if (!postRateResult.success) {
      return handleRateLimitError(postRateResult.retryAfter);
    }

    const { id } = await params;
    const tournamentId = await resolveTournamentId(id);

    try {
      /* Defense-in-depth: always sanitize user input */
      const body = sanitizeInput(await request.json());
      const { topN = 8, reset = false } = body;

      /* Hard reset: delete both playoff and finals rows so the admin can
       * start over from qualification. Triggered by a dedicated reset button
       * on the qualification page. */
      if (reset) {
        await model(prisma).deleteMany({
          where: { tournamentId, stage: { in: ['playoff', 'finals'] } },
        });
        return createSuccessResponse({
          message: 'Bracket reset',
          phase: 'finals',
        }, 'Bracket reset');
      }

      /* Supported bracket sizes:
       *   8  → 8-player double elimination
       *  16  → 16-player double elimination (§4.2)
       *  24  → 16-player Upper Bracket + 12-player Pre-Bracket Playoff (§4.2, issue #454).
       *        Two-phase: first POST call creates the playoff stage; a second
       *        call (once all playoff_r2 matches are complete) builds the
       *        Upper Bracket with the 4 playoff winners filling seeds 13-16. */
      if (topN !== 8 && topN !== 16 && topN !== 24) {
        return handleValidationError(
          'Only 8-player, 16-player, or 24-player (Top-16 + playoff) brackets are supported',
          'topN',
        );
      }

      if (topN === 24) {
        return handleTop24Post(model, qualModel, tournamentId, config);
      }

      const qualifications = await qualModel(prisma).findMany({
        where: { tournamentId },
        include: { player: true },
        orderBy: config.qualificationOrderBy,
        take: topN,
      });

      if (qualifications.length < topN) {
        return handleValidationError(
          `Not enough players qualified. Need ${topN}, found ${qualifications.length}`,
          'qualifications',
        );
      }

      const bracketStructure = generateBracketStructure(topN);

      /* Delete existing finals matches first to avoid unique-constraint violations
       * when recreating a bracket (e.g., "reset" scenario in TC-504).
       * If creation fails afterward the tournament will have no finals matches,
       * but this is unavoidable without a true transaction. */
      await model(prisma).deleteMany({
        where: { tournamentId, stage: 'finals' },
      });

      const seededPlayers = qualifications.map(
        (q: { playerId: string; player: unknown }, index: number) => ({
          seed: index + 1,
          playerId: q.playerId,
          player: q.player,
        }),
      );

      /*
       * Bulk-insert bracket matches (issue #420). Replaces a sequential
       * for-loop of N create() calls with a single createMany() — for an
       * 8-player bracket that's 17 round-trips collapsed into 1, and 31
       * for a 16-player bracket. createMany on D1 doesn't return the
       * inserted rows, so we re-fetch with includes after insertion to
       * preserve the existing response shape (player1/player2 relations).
       */
      const mrAssignments = config.assignMrCoursesByRound
        ? createMrRoundAssignments(bracketStructure, 'finals')
        : undefined;
      const gpAssignments = config.assignGpCupByRound
        ? createGpRoundAssignments(bracketStructure)
        : undefined;

      const matchPlans = bracketStructure.map((bracketMatch) => {
        const player1 = bracketMatch.player1Seed
          ? seededPlayers.find((p: { seed: number }) => p.seed === bracketMatch.player1Seed)
          : null;
        const player2 = bracketMatch.player2Seed
          ? seededPlayers.find((p: { seed: number }) => p.seed === bracketMatch.player2Seed)
          : null;
        return {
          bracketMatch,
          player1,
          player2,
          data: {
            tournamentId,
            matchNumber: bracketMatch.matchNumber,
            stage: 'finals',
            round: bracketMatch.round,
            player1Id: player1?.playerId || seededPlayers[0].playerId,
            player2Id: player2?.playerId || player1?.playerId || seededPlayers[0].playerId,
            completed: false,
            ...getRoundAssignmentData(bracketMatch.round, mrAssignments, gpAssignments),
          },
        };
      });

      await model(prisma).createMany({ data: matchPlans.map((p) => p.data) });

      const insertedMatches = await model(prisma).findMany({
        where: { tournamentId, stage: 'finals' },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });

      // Map by matchNumber so we can attach the bracket metadata that's not
      // stored in the DB (hasPlayer1/hasPlayer2/seed) to each fetched row.
      const insertedByNumber = new Map<number, (typeof insertedMatches)[number]>(
        insertedMatches.map((m: { matchNumber: number }) => [m.matchNumber, m]),
      );
      const createdMatches = matchPlans
        .map((p) => {
          const match = insertedByNumber.get(p.bracketMatch.matchNumber);
          if (!match) return null;
          return {
            ...match,
            hasPlayer1: !!p.player1,
            hasPlayer2: !!p.player2,
            player1Seed: p.bracketMatch.player1Seed,
            player2Seed: p.bracketMatch.player2Seed,
          };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null);

      return createSuccessResponse({
        message: 'Finals bracket created',
        matches: createdMatches,
        seededPlayers,
        bracketStructure,
      }, 'Finals bracket created', { status: 201 });
    } catch (error) {
      logger.error('Failed to create finals', { error, tournamentId });
      return createErrorResponse(config.postErrorMessage, 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Check whether all 4 playoff_r2 matches for a tournament are complete —
   * the readiness condition for Phase-2 POST that creates the Upper Bracket.
   */
  async function isPlayoffComplete(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    matchModel: (p: any) => any,
    tournamentId: string,
  ): Promise<boolean> {
    const r2Matches = await matchModel(prisma).findMany({
      where: { tournamentId, stage: 'playoff', round: 'playoff_r2' },
      select: { completed: true },
    });
    return r2Matches.length === 4 && r2Matches.every((m: { completed: boolean }) => m.completed);
  }

  /**
   * Handle POST with topN=24 — Top 16 bracket with Pre-Bracket Playoff (issue #454).
   *
   * Two-phase flow:
   *   Phase 1: No playoff matches exist → create 8 playoff matches (stage='playoff')
   *            from qualification positions 13-24. Return playoff structure.
   *   Phase 2: All 4 playoff_r2 matches complete → build 16-player Upper Bracket
   *            (stage='finals') using qual top 12 + 4 playoff winners for seeds 13-16.
   *
   * Intermediate state: Phase 2 call before playoff completes → 409 Conflict with
   * a remaining-matches hint so the caller knows why the transition is blocked.
   *
   * @returns Response with created matches for the current phase
   */
  async function handleTop24Post(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    matchModel: (p: any) => any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    qualificationModel: (p: any) => any,
    tournamentId: string,
    finalsConfig: FinalsConfig,
  ): Promise<NextResponse> {
    const logger = createLogger(finalsConfig.loggerName);

    try {
      /* Fetch ALL qualifiers (not just Top 24). Per issue #454 the direct/barrage
       * split is per-group (each group contributes perGroup=12/G direct and perGroup
       * barrage players), so we need every group's full ranking to pick Top-1..2*perGroup
       * from each. Caller's qualificationOrderBy is expected to put `group` first
       * (BM: [{ group: 'asc' }, { score: 'desc' }, ...]); within-group ordering by
       * score/points is preserved via stable insertion-order bucketing in
       * selectFinalsEntrantsByGroup. */
      const qualifications = await qualificationModel(prisma).findMany({
        where: { tournamentId },
        include: { player: true },
        orderBy: finalsConfig.qualificationOrderBy,
      });

      if (qualifications.length < 24) {
        return handleValidationError(
          `Not enough players qualified. Need 24, found ${qualifications.length}`,
          'qualifications',
        );
      }

      /* Per-group Top-N selection with interleaved seed assignment (#454).
       * Phase 1 and Phase 2 both re-derive the split; this relies on qualifications
       * being frozen between the two calls. If scores are edited after Phase 1
       * creates playoff rows, the Phase-2 direct/barrage computation can diverge
       * from what Phase 1 used — acceptable since the admin workflow freezes
       * qualification before finals. */
      let selection: ReturnType<typeof selectFinalsEntrantsByGroup>;
      try {
        selection = selectFinalsEntrantsByGroup(
          qualifications as Array<{ playerId: string; player: unknown; group: string }>,
        );
      } catch (err) {
        return handleValidationError(
          err instanceof Error ? err.message : 'Invalid group distribution',
          'qualifications',
        );
      }

      const existingPlayoff = await matchModel(prisma).findMany({
        where: { tournamentId, stage: 'playoff' },
        orderBy: { matchNumber: 'asc' },
      });
      const existingFinals = await matchModel(prisma).findMany({
        where: { tournamentId, stage: 'finals' },
      });

      /* --- PHASE 1: Create playoff matches ---
       * If finals already exist this is a reset: wipe both stages and
       * rebuild from scratch so barrage scores are cleared as well. */
      const isReset = existingFinals.length > 0;
      if (existingPlayoff.length === 0 || isReset) {
        if (isReset) {
          await matchModel(prisma).deleteMany({
            where: { tournamentId, stage: 'playoff' },
          });
          await matchModel(prisma).deleteMany({
            where: { tournamentId, stage: 'finals' },
          });
        }
        const playoffStructure = generatePlayoffStructure(PLAYOFF_ENTRANT_COUNT);
        const playoffMrAssignments = config.assignMrCoursesByRound
          ? createMrRoundAssignments(playoffStructure, 'playoff')
          : undefined;
        const playoffGpAssignments = config.assignGpCupByRound
          ? createGpRoundAssignments(playoffStructure)
          : undefined;

        /* Playoff-local seeds 1-12 are the barrage entrants, interleaved by group. */
        const playoffSeededPlayers = selection.barrage.map((q, index) => ({
          seed: index + 1,
          playerId: q.playerId,
          player: q.player,
        }));

        const createdPlayoffMatches = [];
        for (const bracketMatch of playoffStructure) {
          const player1 = bracketMatch.player1Seed
            ? playoffSeededPlayers.find((p: { seed: number }) => p.seed === bracketMatch.player1Seed)
            : null;
          const player2 = bracketMatch.player2Seed
            ? playoffSeededPlayers.find((p: { seed: number }) => p.seed === bracketMatch.player2Seed)
            : null;

          /* Fallback player IDs satisfy the NOT NULL constraint on player1Id/player2Id
           * for R2 matches whose player2 comes from an R1 winner (not known yet). */
          const match = await matchModel(prisma).create({
            data: {
              tournamentId,
              matchNumber: bracketMatch.matchNumber,
              stage: 'playoff',
              round: bracketMatch.round,
              player1Id: player1?.playerId || playoffSeededPlayers[0].playerId,
              player2Id: player2?.playerId || player1?.playerId || playoffSeededPlayers[0].playerId,
              completed: false,
              ...getRoundAssignmentData(bracketMatch.round, playoffMrAssignments, playoffGpAssignments),
            },
            include: { player1: true, player2: true },
          });

          createdPlayoffMatches.push({
            ...match,
            hasPlayer1: !!player1,
            hasPlayer2: !!player2,
            player1Seed: bracketMatch.player1Seed,
            player2Seed: bracketMatch.player2Seed,
            advancesToUpperSeed: bracketMatch.advancesToUpperSeed,
          });
        }

        return createSuccessResponse({
          message: 'Playoff bracket created',
          phase: 'playoff',
          playoffMatches: createdPlayoffMatches,
          playoffStructure,
          playoffSeededPlayers,
          /* Note: Upper Bracket seats 1-12 for qual top 12 are reserved; the
           * finals bracket will be created in Phase 2 after playoff completes. */
        }, 'Playoff bracket created', { status: 201 });
      }

      /* --- PHASE 2: Build Upper Bracket once playoff is complete --- */
      const r2Matches = existingPlayoff.filter(
        (m: { round?: string }) => m.round === 'playoff_r2',
      );
      const incompleteR2 = r2Matches.filter((m: { completed: boolean }) => !m.completed);

      if (incompleteR2.length > 0) {
        return createErrorResponse(
          `Playoff not complete: ${incompleteR2.length} R2 match(es) remaining`,
          409,
          'PLAYOFF_INCOMPLETE',
        );
      }

      /* Derive each playoff winner and map to its advancesToUpperSeed target. */
      const playoffStructure = generatePlayoffStructure(PLAYOFF_ENTRANT_COUNT);
      const upperSeedToPlayer = new Map<number, { playerId: string; player: unknown }>();

      for (const r2BracketMatch of playoffStructure.filter(m => m.round === 'playoff_r2')) {
        const dbMatch = r2Matches.find(
          (m: { matchNumber: number }) => m.matchNumber === r2BracketMatch.matchNumber,
        );
        if (!dbMatch || !r2BracketMatch.advancesToUpperSeed) continue;
        const winnerId = dbMatch.score1 >= dbMatch.score2 ? dbMatch.player1Id : dbMatch.player2Id;
        const winnerPlayer = dbMatch.player1Id === winnerId ? dbMatch.player1 : dbMatch.player2;
        upperSeedToPlayer.set(r2BracketMatch.advancesToUpperSeed, {
          playerId: winnerId,
          player: winnerPlayer,
        });
      }

      /* Build the 16 seeded players: 1-12 from per-group direct advancers
       * (interleaved by group rank, #454), 13-16 from playoff winners. */
      const directPlayers = selection.direct.map((q, index) => ({
        seed: index + 1,
        playerId: q.playerId,
        player: q.player,
      }));
      const playoffWinnerSeeds = [13, 14, 15, 16].map((upperSeed) => {
        const winner = upperSeedToPlayer.get(upperSeed);
        if (!winner) {
          throw new Error(`Playoff winner for Upper seed ${upperSeed} not resolved`);
        }
        return { seed: upperSeed, playerId: winner.playerId, player: winner.player };
      });
      const seededPlayers = [...directPlayers, ...playoffWinnerSeeds];

      const bracketStructure = generateBracketStructure(16);
      const finalsMrAssignments = config.assignMrCoursesByRound
        ? createMrRoundAssignments(bracketStructure, 'finals')
        : undefined;
      const finalsGpAssignments = config.assignGpCupByRound
        ? createGpRoundAssignments(bracketStructure)
        : undefined;

      /* Clean slate on any previous finals for reset scenarios.
       * Keep playoff stage rows intact so the admin can still view the
       * playoff (barrage) results after the Upper Bracket is created.
       * The UI switches via a tab instead of relying on phase deletion. */
      await matchModel(prisma).deleteMany({
        where: { tournamentId, stage: 'finals' },
      });

      const createdMatches = [];
      for (const bracketMatch of bracketStructure) {
        const player1 = bracketMatch.player1Seed
          ? seededPlayers.find(p => p.seed === bracketMatch.player1Seed)
          : null;
        const player2 = bracketMatch.player2Seed
          ? seededPlayers.find(p => p.seed === bracketMatch.player2Seed)
          : null;

        const match = await matchModel(prisma).create({
          data: {
            tournamentId,
            matchNumber: bracketMatch.matchNumber,
            stage: 'finals',
            round: bracketMatch.round,
            player1Id: player1?.playerId || seededPlayers[0].playerId,
            player2Id: player2?.playerId || player1?.playerId || seededPlayers[0].playerId,
            completed: false,
            ...getRoundAssignmentData(bracketMatch.round, finalsMrAssignments, finalsGpAssignments),
          },
          include: { player1: true, player2: true },
        });

        createdMatches.push({
          ...match,
          hasPlayer1: !!player1,
          hasPlayer2: !!player2,
          player1Seed: bracketMatch.player1Seed,
          player2Seed: bracketMatch.player2Seed,
        });
      }

      return createSuccessResponse({
        message: 'Finals bracket created from playoff results',
        phase: 'finals',
        matches: createdMatches,
        seededPlayers,
        bracketStructure,
      }, 'Finals bracket created', { status: 201 });
    } catch (error) {
      logger.error('Failed to create Top-24 finals', { error, tournamentId });
      return createErrorResponse(finalsConfig.postErrorMessage, 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * PUT handler: Update a finals match result and advance players through the bracket.
   * Handles winner/loser advancement, grand final reset logic, and tournament completion.
   */
  async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const logger = createLogger(config.loggerName);

    /* Auth check for PUT endpoint */
    if (config.putRequiresAuth) {
      const session = await auth();
      if (!session?.user || session.user.role !== 'admin') {
        return createErrorResponse('Forbidden', 403, 'FORBIDDEN');
      }
    }

    /* Rate limit: prevent abuse on finals score update */
    const putClientIp = getClientIdentifier(request);
    const putRateResult = await checkRateLimit('scoreInput', putClientIp);
    if (!putRateResult.success) {
      return handleRateLimitError(putRateResult.retryAfter);
    }

    const { id } = await params;
    const tournamentId = await resolveTournamentId(id);

    try {
      /* Defense-in-depth: always sanitize user input */
      const body = sanitizeInput(await request.json());
      const { matchId, score1, score2 } = body;

      if (!matchId || score1 === undefined || score2 === undefined) {
        return handleValidationError('matchId, score1, and score2 are required', 'request');
      }

      const match = await model(prisma).findUnique({
        where: { id: matchId, tournamentId },
        include: { player1: true, player2: true },
      });

      if (!match) {
        return createErrorResponse('Finals match not found', 404, 'NOT_FOUND');
      }

      /* Defensive: reject non-finals/non-playoff stage to prevent cross-stage
       * bracket mutation. Qualification matches should never trigger bracket
       * advancement logic; playoff matches use their own advancement path below. */
      if (match.stage !== 'finals' && match.stage !== 'playoff') {
        return createErrorResponse('Finals match not found', 404, 'NOT_FOUND');
      }

      let winnerId: string;
      let loserId: string;
      let resolvedUpdateData: Record<string, unknown> = {};

      if (config.resolveMatchResult) {
        const resolved = config.resolveMatchResult(
          match as Record<string, unknown>,
          score1,
          score2,
          body as Record<string, unknown>,
        );

        if ("error" in resolved) {
          return handleValidationError(resolved.error, resolved.field ?? 'score');
        }

        winnerId = resolved.winnerId;
        loserId = resolved.loserId;
        resolvedUpdateData = resolved.updateData ?? {};
      } else {
        const targetWins = config.getTargetWins?.(match) ?? config.targetWins ?? 3;
        const player1ReachedTarget = score1 === targetWins && score2 < targetWins;
        const player2ReachedTarget = score2 === targetWins && score1 < targetWins;

        if (player1ReachedTarget === player2ReachedTarget) {
          return handleValidationError(`Match must have a winner (first to ${targetWins})`, 'score');
        }

        winnerId = player1ReachedTarget ? match.player1Id : match.player2Id;
        loserId = player1ReachedTarget ? match.player2Id : match.player1Id;
      }

      /* Build update data with configurable score field names */
      const updateData: Record<string, unknown> = {
        ...resolvedUpdateData,
        [config.putScoreFields.dbField1]: score1,
        [config.putScoreFields.dbField2]: score2,
        completed: true,
      };

      if (config.putAdditionalFields) {
        for (const field of config.putAdditionalFields) {
          if (body[field] !== undefined) {
            updateData[field] = body[field] || null;
          }
        }
      }

      const updatedMatch = await model(prisma).update({
        where: { id: matchId },
        data: updateData,
        include: { player1: true, player2: true },
      });

      /* --- Playoff advancement path (issue #454) ---
       * Playoff matches are a separate stage; only playoff_r1 winners advance
       * within the playoff (to playoff_r2 as player 2). playoff_r2 winners
       * stay in the playoff stage — the Upper Bracket is materialised later
       * via a Phase-2 POST that reads completed playoff results. */
      if (match.stage === 'playoff') {
        const playoffStructure = generatePlayoffStructure(PLAYOFF_ENTRANT_COUNT);
        const matchNumber = Number(match.matchNumber ?? updatedMatch.matchNumber);
        const currentPlayoff = playoffStructure.find(b => b.matchNumber === matchNumber);

        if (currentPlayoff?.winnerGoesTo) {
          const position = currentPlayoff.position || 1;
          await model(prisma).updateMany({
            where: {
              tournamentId,
              stage: 'playoff',
              matchNumber: currentPlayoff.winnerGoesTo,
            },
            data: position === 1 ? { player1Id: winnerId } : { player2Id: winnerId },
          });
        }

        return createSuccessResponse({
          match: updatedMatch,
          winnerId,
          loserId,
          stage: 'playoff',
          /* Signal whether all playoff_r2 matches are complete so clients can
           * prompt the admin to trigger Phase-2 POST (finals bracket creation). */
          playoffComplete: await isPlayoffComplete(model, tournamentId),
        });
      }

      /* Infer bracket size from total finals match count:
       * 8-player bracket = 17 matches, 16-player bracket = 31 matches.
       * Threshold of 20 distinguishes between the two (>20 means 16-player).
       * This ensures correct bracket routing for both sizes in PUT handler. */
      const totalFinalsMatches = await model(prisma).count({
        where: { tournamentId, stage: 'finals' },
      });
      const bracketSize = totalFinalsMatches > BRACKET_SIZE_THRESHOLD ? 16 : 8;

      /* Warn when match count is in the ambiguous zone (17-20) where playoff
       * stage may have added extra matches that make inference unreliable.
       * This helps admins identify bracket routing anomalies. */
      const EIGHT_PLAYER_EXPECTED = 17;
      const SIXTEEN_PLAYER_EXPECTED = 31;
      const isAmbiguousCount =
        totalFinalsMatches > EIGHT_PLAYER_EXPECTED &&
        totalFinalsMatches <= BRACKET_SIZE_THRESHOLD;
      const isUnexpectedCount =
        totalFinalsMatches !== EIGHT_PLAYER_EXPECTED &&
        totalFinalsMatches !== SIXTEEN_PLAYER_EXPECTED;
      if (isAmbiguousCount || isUnexpectedCount) {
        logger.warn('Bracket size inference may be unreliable', {
          tournamentId,
          totalFinalsMatches,
          inferredBracketSize: bracketSize,
          expectedFor8Player: EIGHT_PLAYER_EXPECTED,
          expectedFor16Player: SIXTEEN_PLAYER_EXPECTED,
          isAmbiguous: isAmbiguousCount,
          isUnexpected: isUnexpectedCount,
        });
      }

      /* Bracket progression: advance winner and loser to next matches */
      const bracketStructure = generateBracketStructure(bracketSize);
      const matchNumber = Number(match.matchNumber ?? updatedMatch.matchNumber);
      const currentBracketMatch = bracketStructure.find(
        (b) => b.matchNumber === matchNumber,
      );

      if (!currentBracketMatch) {
        return createSuccessResponse({ match: updatedMatch });
      }

      const updateRoutedMatch = async (
        targetMatchNumber: number,
        position: 1 | 2,
        playerId: string,
      ) => {
        try {
          await model(prisma).updateMany({
            where: {
              tournamentId,
              matchNumber: targetMatchNumber,
              stage: 'finals',
            },
            data: position === 1 ? { player1Id: playerId } : { player2Id: playerId },
          });
        } catch {
          /* Missing future bracket slots are tolerated for partially generated brackets. */
        }
      };

      /* Advance winner to next match */
      if (currentBracketMatch.winnerGoesTo) {
        const nextWinnerMatch = await model(prisma).findFirst({
          where: {
            tournamentId,
            stage: 'finals',
            matchNumber: currentBracketMatch.winnerGoesTo,
          },
        });

        if (nextWinnerMatch) {
          const position = currentBracketMatch.position || 1;
          await model(prisma).update({
            where: { id: nextWinnerMatch.id },
            data:
              position === 1 ? { player1Id: winnerId } : { player2Id: winnerId },
          });
          await updateRoutedMatch(currentBracketMatch.winnerGoesTo, position, winnerId);
        } else {
          await updateRoutedMatch(currentBracketMatch.winnerGoesTo, currentBracketMatch.position || 1, winnerId);
        }
      }

      /* Move loser to losers bracket */
      if (currentBracketMatch.loserGoesTo && loserId) {
        const nextLoserMatch = await model(prisma).findFirst({
          where: {
            tournamentId,
            stage: 'finals',
            matchNumber: currentBracketMatch.loserGoesTo,
          },
        });

        let loserPosition: 1 | 2 = 1;
        if (currentBracketMatch.round === 'winners_qf') {
          /* 16-player: losers from QF enter L_R2 at position 2.
           * 8-player: uses parity-based calculation ((matchNumber-1)%2 + 1). */
          loserPosition = bracketSize === 16 ? 2 : (((matchNumber - 1) % 2) + 1) as 1 | 2;
        } else if (currentBracketMatch.round === 'winners_sf') {
          loserPosition = 1;
        } else if (currentBracketMatch.round === 'winners_final') {
          loserPosition = 2;
        }

        if (nextLoserMatch) {
          await model(prisma).update({
            where: { id: nextLoserMatch.id },
            data:
              loserPosition === 1
                ? { player1Id: loserId }
                : { player2Id: loserId },
          });
          await updateRoutedMatch(currentBracketMatch.loserGoesTo, loserPosition, loserId);
        } else {
          await updateRoutedMatch(currentBracketMatch.loserGoesTo, loserPosition, loserId);
        }
      }

      /* Grand Final: if losers champion wins, populate the reset match */
      if (currentBracketMatch.round === 'grand_final' && loserId) {
        const winnerFromLosers = match.player2Id === winnerId;

        if (winnerFromLosers) {
          const resetMatch = await model(prisma).findFirst({
            where: {
              tournamentId,
              stage: 'finals',
              round: 'grand_final_reset',
            },
          });

          if (resetMatch) {
            await model(prisma).update({
              where: { id: resetMatch.id },
              data: {
                player1Id: winnerId,
                player2Id: loserId,
              },
            });
          } else {
            await model(prisma).updateMany({
              where: {
                tournamentId,
                stage: 'finals',
                round: 'grand_final_reset',
              },
              data: {
                player1Id: winnerId,
                player2Id: loserId,
              },
            });
          }
        }
      }

      /* Check if the tournament is complete */
      let isComplete = false;
      let champion = null;

      if (currentBracketMatch.round === 'grand_final') {
        const winnerWasFromWinners = match.player1Id === winnerId;
        if (winnerWasFromWinners) {
          isComplete = true;
          champion = winnerId;
        }
      } else if (currentBracketMatch.round === 'grand_final_reset') {
        isComplete = true;
        champion = winnerId;
      }

      return createSuccessResponse({
        match: updatedMatch,
        winnerId,
        loserId,
        isComplete,
        champion,
      });
    } catch (error) {
      logger.error('Failed to update finals match', { error, tournamentId });
      return createErrorResponse('Failed to update match', 500, 'INTERNAL_ERROR');
    }
  }

  return { GET, POST, PUT };
}

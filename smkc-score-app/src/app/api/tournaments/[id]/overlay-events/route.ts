/**
 * GET /api/tournaments/[id]/overlay-events
 *
 * Public, unauthenticated read of recent tournament events for the OBS
 * browser-source overlay. Aggregates score entries, match completions,
 * status transitions and ranking updates into a single time-ordered list.
 *
 * Query params:
 *   - since: ISO 8601 timestamp (exclusive lower bound). Omitted on the
 *     very first poll; in that case the server limits the window to the
 *     last 30 seconds so the overlay doesn't replay the entire tournament
 *     history at startup.
 *
 * Response:
 *   { success: true, data: { serverTime, events: OverlayEvent[] } }
 *
 * Security:
 *   - No PII (ipAddress / userAgent / userId) is selected from the
 *     ScoreEntryLog table — we only read fields the overlay actually needs.
 *   - All data exposed here is already public on standings/match pages,
 *     so the timing alone is the only new signal; that is intentional for
 *     the broadcast use-case.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { resolveTournamentId } from "@/lib/tournament-identifier";
import { createSuccessResponse, createErrorResponse } from "@/lib/error-handling";
import { buildOverlayEvents } from "@/lib/overlay/events";
import type { OverlayMatchInput } from "@/lib/overlay/types";

/** Initial-poll window when no `since` is supplied. */
const INITIAL_WINDOW_MS = 30_000;

/** Maximum lookback even when `since` is supplied — guards against runaway clients. */
const MAX_LOOKBACK_MS = 10 * 60_000;

function parseSince(raw: string | null, now: Date): Date {
  if (!raw) return new Date(now.getTime() - INITIAL_WINDOW_MS);
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return new Date(now.getTime() - INITIAL_WINDOW_MS);
  const lowerBound = now.getTime() - MAX_LOOKBACK_MS;
  return new Date(Math.max(parsed, lowerBound));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const logger = createLogger("overlay-events-api");
  const { id } = await params;
  const tournamentId = await resolveTournamentId(id);
  const now = new Date();
  const since = parseSince(request.nextUrl.searchParams.get("since"), now);

  try {
    /* findUnique short-circuits all the relation queries below if the
       tournament doesn't exist. We deliberately don't gate on `publicModes`
       here — the overlay is meant to be visible whenever the tournament
       exists (the URL itself is the access token for the broadcast). */
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        qualificationConfirmedAt: true,
      },
    });
    if (!tournament) {
      return createErrorResponse("Tournament not found", 404);
    }

    const matchSelect = {
      id: true,
      matchNumber: true,
      stage: true,
      round: true,
      completed: true,
      updatedAt: true,
      createdAt: true,
      score1: true,
      score2: true,
      player1: { select: { nickname: true } },
      player2: { select: { nickname: true } },
    } as const;

    const gpMatchSelect = {
      id: true,
      matchNumber: true,
      stage: true,
      round: true,
      completed: true,
      updatedAt: true,
      createdAt: true,
      points1: true,
      points2: true,
      player1: { select: { nickname: true } },
      player2: { select: { nickname: true } },
    } as const;

    /* Run all reads in parallel — D1 has no inter-query state to share and
       these are independent. The route runs every 3s per overlay so latency
       matters more than per-query connection cost. */
    const [
      bmMatches,
      mrMatches,
      gpMatches,
      ttEntries,
      ttPhaseRounds,
      scoreLogs,
      earliestFinals,
      latestOverallRanking,
    ] = await Promise.all([
      prisma.bMMatch.findMany({
        where: { tournamentId, updatedAt: { gt: since } },
        select: matchSelect,
        orderBy: { updatedAt: "asc" },
      }),
      prisma.mRMatch.findMany({
        where: { tournamentId, updatedAt: { gt: since } },
        select: matchSelect,
        orderBy: { updatedAt: "asc" },
      }),
      prisma.gPMatch.findMany({
        where: { tournamentId, updatedAt: { gt: since } },
        select: gpMatchSelect,
        orderBy: { updatedAt: "asc" },
      }),
      prisma.tTEntry.findMany({
        where: { tournamentId, updatedAt: { gt: since } },
        select: {
          id: true,
          totalTime: true,
          rank: true,
          updatedAt: true,
          stage: true,
          lastRecordedCourse: true,
          lastRecordedTime: true,
          player: { select: { nickname: true } },
        },
        orderBy: { updatedAt: "asc" },
      }),
      prisma.tTPhaseRound.findMany({
        where: { tournamentId, createdAt: { gt: since } },
        select: {
          id: true,
          phase: true,
          roundNumber: true,
          course: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      /* IMPORTANT: only the columns needed for the overlay title — we never
         select ipAddress / userAgent. */
      prisma.scoreEntryLog.findMany({
        where: { tournamentId, timestamp: { gt: since } },
        select: {
          id: true,
          matchId: true,
          matchType: true,
          timestamp: true,
          player: { select: { nickname: true } },
        },
        orderBy: { timestamp: "asc" },
      }),
      /* findFirst across BM finals matches; ordered ascending so we get the
         "first" finals match (= bracket creation moment). */
      prisma.bMMatch.findFirst({
        where: { tournamentId, stage: "finals", createdAt: { gt: since } },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.tournamentPlayerScore.aggregate({
        where: { tournamentId, updatedAt: { gt: since } },
        _max: { updatedAt: true },
      }),
    ]);

    const events = buildOverlayEvents({
      since,
      tournament: {
        qualificationConfirmedAt: tournament.qualificationConfirmedAt,
        earliestFinalsCreatedAt: earliestFinals?.createdAt ?? null,
        latestOverallRankingUpdatedAt: latestOverallRanking._max.updatedAt ?? null,
      },
      bmMatches: bmMatches as unknown as OverlayMatchInput[],
      mrMatches: mrMatches as unknown as OverlayMatchInput[],
      /* GP uses points1/points2 instead of score1/score2 — remap so the pure
         aggregator can stay mode-agnostic. */
      gpMatches: gpMatches.map((m) => ({
        ...m,
        score1: m.points1,
        score2: m.points2,
      })) as unknown as OverlayMatchInput[],
      ttEntries,
      ttPhaseRounds,
      scoreLogs,
    });

    const response = createSuccessResponse({
      serverTime: now.toISOString(),
      events,
    });

    /* Disable any intermediate caching: the response is time-sensitive and
       changes every poll. Cloudflare adds its own edge cache headers; this
       prevents browser/proxy reuse. */
    if (response instanceof NextResponse) {
      response.headers.set("Cache-Control", "no-store");
    }
    return response;
  } catch (error) {
    logger.error("Failed to build overlay events", { error, tournamentId });
    return createErrorResponse("Failed to build overlay events", 500);
  }
}

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
import { computeCurrentPhase, computeCurrentPhaseFormat } from "@/lib/overlay/phase";
import type { OverlayMatchInput, OverlayMode } from "@/lib/overlay/types";

/** Initial-poll window when no `since` is supplied. */
const INITIAL_WINDOW_MS = 30_000;

/** Maximum lookback even when `since` is supplied — guards against runaway clients. */
const MAX_LOOKBACK_MS = 10 * 60_000;

/**
 * Lookback used when `?initial=1` is supplied (dashboard first-load case).
 * The dashboard wants a populated panel even after long quiet stretches, so
 * we trade a wider window for the cap-by-count enforced via `slice(-100)` on
 * the merged event list further down.
 */
const INITIAL_BACKFILL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Hard cap on backfilled events (per dashboard contract). */
const INITIAL_BACKFILL_LIMIT = 100;

function parseSince(raw: string | null, now: Date, initial: boolean): Date {
  if (initial) return new Date(now.getTime() - INITIAL_BACKFILL_MS);
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
  const initial = request.nextUrl.searchParams.get("initial") === "1";
  const since = parseSince(request.nextUrl.searchParams.get("since"), now, initial);

  try {
    /* findUnique short-circuits all the relation queries below if the
       tournament doesn't exist. We deliberately don't gate on `publicModes`
       here — the overlay is meant to be visible whenever the tournament
       exists (the URL itself is the access token for the broadcast). */
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        qualificationConfirmed: true,
        qualificationConfirmedAt: true,
        overlayPlayer1Name: true,
        overlayPlayer2Name: true,
        overlayMatchLabel: true,
        overlayPlayer1Wins: true,
        overlayPlayer2Wins: true,
        overlayMatchFt: true,
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
      // BM/MR pre-assigned courses, surfaced on match_completed events so
      // the dashboard scoreboard can show which courses the match used.
      assignedCourses: true,
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
      // GP cup label ("Mushroom" / "Flower" / ...), shown on the dashboard
      // scoreboard so viewers can identify which cup the match was on.
      cup: true,
      player1: { select: { nickname: true } },
      player2: { select: { nickname: true } },
    } as const;

    /* Run all reads in parallel — D1 has no inter-query state to share and
       these are independent. The route runs every 3s per overlay so latency
       matters more than per-query connection cost. The phase-state lookups
       (last 9) feed the dashboard footer and are unaffected by `since`. */
    const [
      bmMatches,
      mrMatches,
      gpMatches,
      ttEntries,
      ttPhaseRounds,
      scoreLogs,
      earliestFinals,
      latestOverallRanking,
      bmLatestFinals,
      mrLatestFinals,
      gpLatestFinals,
      taPhase1Entry,
      taPhase2Entry,
      taPhase3Entry,
      taPhase1LatestRound,
      taPhase2LatestRound,
      taPhase3LatestRound,
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
      /* Footer phase state: the most recently created finals match per
         mode (round != null), plus TA phase existence and latest round
         number per phase. None of these depend on `since` — they describe
         the current tournament state, not a delta. */
      prisma.bMMatch.findFirst({
        where: { tournamentId, stage: "finals", round: { not: null } },
        select: { round: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.mRMatch.findFirst({
        where: { tournamentId, stage: "finals", round: { not: null } },
        select: { round: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.gPMatch.findFirst({
        where: { tournamentId, stage: "finals", round: { not: null } },
        select: { round: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.tTEntry.findFirst({
        where: { tournamentId, stage: "phase1" },
        select: { id: true },
      }),
      prisma.tTEntry.findFirst({
        where: { tournamentId, stage: "phase2" },
        select: { id: true },
      }),
      prisma.tTEntry.findFirst({
        where: { tournamentId, stage: "phase3" },
        select: { id: true },
      }),
      prisma.tTPhaseRound.findFirst({
        where: { tournamentId, phase: "phase1" },
        select: { roundNumber: true },
        orderBy: { roundNumber: "desc" },
      }),
      prisma.tTPhaseRound.findFirst({
        where: { tournamentId, phase: "phase2" },
        select: { roundNumber: true },
        orderBy: { roundNumber: "desc" },
      }),
      prisma.tTPhaseRound.findFirst({
        where: { tournamentId, phase: "phase3" },
        select: { roundNumber: true },
        orderBy: { roundNumber: "desc" },
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

    /* Initial dashboard load: cap to the most-recent N events. The window
       is wide (7d) so this trim keeps the response from blowing up on busy
       tournaments. Newest entries (end of the array — buildOverlayEvents
       sorts ascending) are preserved. */
    const cappedEvents = initial
      ? events.slice(-INITIAL_BACKFILL_LIMIT)
      : events;

    /* Pick the latest finals round across the three 2P modes by createdAt;
       if no mode has a finals match yet, this is null. The mode tag rides
       along so the format resolver can map the round to its FT value
       (BM/MR → FT5; GP → null). */
    const latestFinals = (
      [
        bmLatestFinals && { ...bmLatestFinals, mode: "bm" as OverlayMode },
        mrLatestFinals && { ...mrLatestFinals, mode: "mr" as OverlayMode },
        gpLatestFinals && { ...gpLatestFinals, mode: "gp" as OverlayMode },
      ] as Array<{ round: string | null; createdAt: Date; mode: OverlayMode } | null>
    )
      .filter((m): m is { round: string | null; createdAt: Date; mode: OverlayMode } => m !== null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    /* Resolve TA phase from the existence checks. We descend from phase3
       so the most-progressed phase wins even when earlier phases still
       have stale entries. */
    let taCurrentPhase: "qualification" | "phase1" | "phase2" | "phase3" =
      "qualification";
    let taLatestPhaseRoundNumber: number | null = null;
    if (taPhase3Entry) {
      taCurrentPhase = "phase3";
      taLatestPhaseRoundNumber = taPhase3LatestRound?.roundNumber ?? null;
    } else if (taPhase2Entry) {
      taCurrentPhase = "phase2";
      taLatestPhaseRoundNumber = taPhase2LatestRound?.roundNumber ?? null;
    } else if (taPhase1Entry) {
      taCurrentPhase = "phase1";
      taLatestPhaseRoundNumber = taPhase1LatestRound?.roundNumber ?? null;
    }

    const phaseInput = {
      qualificationConfirmed: tournament.qualificationConfirmed,
      taCurrentPhase,
      taLatestPhaseRoundNumber,
      latestFinalsRound: latestFinals?.round ?? null,
      latestFinalsMode: latestFinals?.mode ?? null,
    };
    const currentPhase = computeCurrentPhase(phaseInput);
    const currentPhaseFormat = computeCurrentPhaseFormat(phaseInput);

    const response = createSuccessResponse({
      serverTime: now.toISOString(),
      events: cappedEvents,
      currentPhase,
      currentPhaseFormat,
      /* Broadcast player names for the overlay name display (配信に反映) */
      overlayPlayer1Name: tournament.overlayPlayer1Name ?? "",
      overlayPlayer2Name: tournament.overlayPlayer2Name ?? "",
      /* Match info set by "配信に反映" for footer label and score display */
      overlayMatchLabel: tournament.overlayMatchLabel ?? null,
      overlayPlayer1Wins: tournament.overlayPlayer1Wins ?? null,
      overlayPlayer2Wins: tournament.overlayPlayer2Wins ?? null,
      overlayMatchFt: tournament.overlayMatchFt ?? null,
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

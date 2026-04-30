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
import { resolveTournament } from "@/lib/tournament-identifier";
import { createSuccessResponse, createErrorResponse } from "@/lib/error-handling";
import { buildOverlayEvents } from "@/lib/overlay/events";
import { withApiTiming } from "@/lib/perf/api-timing";
import {
  computeCurrentPhase,
  computeCurrentPhaseFormat,
  type ComputeCurrentPhaseInput,
} from "@/lib/overlay/phase";
import type {
  OverlayMatchInput,
  OverlayMode,
  OverlayTaChampionStanding,
} from "@/lib/overlay/types";

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

/**
 * Per-tournament early-return cache.
 *
 * Records the timestamp of the most recent change observed across every
 * table this route reads. The next poll within `LATEST_PROBE_TTL_MS` skips
 * the seven aggregate queries entirely when its `since` is at or after the
 * cached value — there is provably no new event to surface. The TTL is
 * short (1s) so a write that lands while the cache is warm is observed by
 * the next polling cycle, not after a multi-second blackout.
 *
 * The cache is intentionally small and bounded: tournaments rotate, so a
 * 32-entry LRU is plenty.
 */
interface LatestChangeProbe {
  /** Newest updatedAt/timestamp observed across every event-source table. */
  latest: number;
  /** Wall-clock time the probe was recorded; entries past TTL are recomputed. */
  observedAt: number;
}
const LATEST_PROBE_TTL_MS = 1_000;
const LATEST_PROBE_MAX_SIZE = 32;
const latestProbeCache = new Map<string, LatestChangeProbe>();

function readProbe(tournamentId: string): LatestChangeProbe | undefined {
  const entry = latestProbeCache.get(tournamentId);
  if (!entry) return undefined;
  if (Date.now() - entry.observedAt > LATEST_PROBE_TTL_MS) {
    latestProbeCache.delete(tournamentId);
    return undefined;
  }
  // LRU bump: re-insert to push to most-recently-used end.
  latestProbeCache.delete(tournamentId);
  latestProbeCache.set(tournamentId, entry);
  return entry;
}

function writeProbe(tournamentId: string, latest: number): void {
  if (latestProbeCache.has(tournamentId)) {
    latestProbeCache.delete(tournamentId);
  }
  latestProbeCache.set(tournamentId, { latest, observedAt: Date.now() });
  while (latestProbeCache.size > LATEST_PROBE_MAX_SIZE) {
    const oldest = latestProbeCache.keys().next().value;
    if (oldest === undefined) break;
    latestProbeCache.delete(oldest);
  }
}

/** Internal: invalidate when a write path knows the cache will become stale. */
export function invalidateOverlayProbe(tournamentId: string): void {
  latestProbeCache.delete(tournamentId);
}

function jsonStringArray(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === "string")
    : [];
}

function timeMsByPlayer(raw: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!Array.isArray(raw)) return out;
  for (const result of raw) {
    if (typeof result !== "object" || result === null) continue;
    const playerId = (result as { playerId?: unknown }).playerId;
    const timeMs = (result as { timeMs?: unknown }).timeMs;
    if (typeof playerId === "string" && typeof timeMs === "number") {
      out.set(playerId, timeMs);
    }
  }
  return out;
}

async function readCurrentPhaseInput(
  tournamentId: string,
  qualificationConfirmed: boolean,
): Promise<ComputeCurrentPhaseInput> {
  const [
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

  const latestFinals = (
    [
      bmLatestFinals && { ...bmLatestFinals, mode: "bm" as OverlayMode },
      mrLatestFinals && { ...mrLatestFinals, mode: "mr" as OverlayMode },
      gpLatestFinals && { ...gpLatestFinals, mode: "gp" as OverlayMode },
    ] as Array<{ round: string | null; createdAt: Date; mode: OverlayMode } | null>
  )
    .filter((m): m is { round: string | null; createdAt: Date; mode: OverlayMode } => m !== null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

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

  return {
    qualificationConfirmed,
    taCurrentPhase,
    taLatestPhaseRoundNumber,
    latestFinalsRound: latestFinals?.round ?? null,
    latestFinalsMode: latestFinals?.mode ?? null,
  };
}

function parseSince(raw: string | null, now: Date, initial: boolean): Date {
  if (initial) return new Date(now.getTime() - INITIAL_BACKFILL_MS);
  if (!raw) return new Date(now.getTime() - INITIAL_WINDOW_MS);
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return new Date(now.getTime() - INITIAL_WINDOW_MS);
  const lowerBound = now.getTime() - MAX_LOOKBACK_MS;
  return new Date(Math.max(parsed, lowerBound));
}

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const logger = createLogger("overlay-events-api");
  const { id } = await params;
  const now = new Date();
  const initial = request.nextUrl.searchParams.get("initial") === "1";
  const since = parseSince(request.nextUrl.searchParams.get("since"), now, initial);

  try {
    /* Single query: resolve slug/id AND fetch overlay fields (#692).
       Previously resolveTournamentId + findUnique = 2 sequential D1 round-trips. */
    const tournament = await resolveTournament(id, {
      // Per-mode flags (issue #696); OR of all three = "any qual confirmed" for phase display
      bmQualificationConfirmed: true,
      mrQualificationConfirmed: true,
      gpQualificationConfirmed: true,
      qualificationConfirmedAt: true,
      overlayPlayer1Name: true,
      overlayPlayer2Name: true,
      overlayMatchLabel: true,
      overlayPlayer1Wins: true,
      overlayPlayer2Wins: true,
      overlayMatchFt: true,
      id: true,
    });
    if (!tournament) {
      return createErrorResponse("Tournament not found", 404);
    }
    const tournamentId = tournament.id;
    const qualificationConfirmed =
      tournament.bmQualificationConfirmed ||
      tournament.mrQualificationConfirmed ||
      tournament.gpQualificationConfirmed;

    /*
     * Early-return path.
     *
     * The dashboard polls this route every 3s, but tournament tables only
     * change when an admin enters a score. The vast majority of polls have
     * no new events. Detect that with a single round of `_max(updatedAt)`
     * aggregates (one per source table, run in parallel) and skip the 17
     * detail queries when nothing happened since the caller's `since`.
     *
     * The `latestProbe` cache memoises the aggregate result for 1s. Many
     * viewers polling the same tournament land on the same cached probe
     * and pay zero D1 cost beyond the initial poll's aggregates.
     *
     * Skipped on the `initial=1` first-load path: the dashboard expects a
     * filled-in event list there even when there was no recent activity,
     * so the full event build has to run.
     */
    let latestChange: number | null = null;
    if (!initial) {
      const cached = readProbe(tournamentId);
      if (cached) {
        latestChange = cached.latest;
      } else {
        const [bmMax, mrMax, gpMax, ttMax, ttPhaseMax, ttPhaseSubmittedMax, scoreMax, tpsMax] = await Promise.all([
          prisma.bMMatch.aggregate({ where: { tournamentId }, _max: { updatedAt: true } }),
          prisma.mRMatch.aggregate({ where: { tournamentId }, _max: { updatedAt: true } }),
          prisma.gPMatch.aggregate({ where: { tournamentId }, _max: { updatedAt: true } }),
          prisma.tTEntry.aggregate({ where: { tournamentId }, _max: { updatedAt: true } }),
          prisma.tTPhaseRound.aggregate({ where: { tournamentId }, _max: { createdAt: true } }),
          prisma.tTPhaseRound.aggregate({ where: { tournamentId }, _max: { submittedAt: true } }),
          prisma.scoreEntryLog.aggregate({ where: { tournamentId }, _max: { timestamp: true } }),
          prisma.tournamentPlayerScore.aggregate({ where: { tournamentId }, _max: { updatedAt: true } }),
        ]);
        const candidates = [
          bmMax._max.updatedAt,
          mrMax._max.updatedAt,
          gpMax._max.updatedAt,
          ttMax._max.updatedAt,
          ttPhaseMax._max.createdAt,
          ttPhaseSubmittedMax._max.submittedAt,
          scoreMax._max.timestamp,
          tpsMax._max.updatedAt,
        ];
        latestChange = candidates.reduce<number>((acc, d) => {
          const t = d?.getTime() ?? 0;
          return t > acc ? t : acc;
        }, 0);
        writeProbe(tournamentId, latestChange);
      }

      if (latestChange <= since.getTime()) {
        // Nothing changed since the caller's last poll. Build a small
        // response with `events: []` so the merge-on-client step is a no-op,
        // but still refresh footer state: "配信に反映" and phase labels are
        // persistent overlay state, not just event-stream deltas.
        const phaseInput = await readCurrentPhaseInput(tournamentId, qualificationConfirmed);
        const currentPhase = computeCurrentPhase(phaseInput);
        const currentPhaseFormat = computeCurrentPhaseFormat(phaseInput);
        const response = createSuccessResponse({
          serverTime: now.toISOString(),
          events: [],
          currentPhase,
          currentPhaseFormat,
          overlayPlayer1Name: tournament.overlayPlayer1Name ?? "",
          overlayPlayer2Name: tournament.overlayPlayer2Name ?? "",
          overlayMatchLabel: tournament.overlayMatchLabel ?? null,
          overlayPlayer1Wins: tournament.overlayPlayer1Wins ?? null,
          overlayPlayer2Wins: tournament.overlayPlayer2Wins ?? null,
          overlayMatchFt: tournament.overlayMatchFt ?? null,
        });
        if (response instanceof NextResponse) {
          response.headers.set("Cache-Control", "no-store");
        }
        return response;
      }
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
      taActiveEntries,
      taPhase3SubmittedRounds,
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
        where: {
          tournamentId,
          OR: [
            { createdAt: { gt: since } },
            { submittedAt: { gt: since } },
          ],
        },
        select: {
          id: true,
          phase: true,
          roundNumber: true,
          course: true,
          createdAt: true,
          submittedAt: true,
          results: true,
          eliminatedIds: true,
          livesReset: true,
        },
        orderBy: [{ createdAt: "asc" }, { roundNumber: "asc" }],
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
      prisma.tTEntry.findMany({
        where: {
          tournamentId,
          stage: { in: ["phase1", "phase2", "phase3"] },
          deletedAt: null,
        },
        select: {
          playerId: true,
          stage: true,
          lives: true,
          rank: true,
          eliminated: true,
          player: { select: { nickname: true } },
        },
        orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
      }),
      prisma.tTPhaseRound.findMany({
        where: {
          tournamentId,
          phase: "phase3",
          submittedAt: { not: null },
        },
        select: {
          id: true,
          roundNumber: true,
          submittedAt: true,
          results: true,
          eliminatedIds: true,
        },
        orderBy: [{ submittedAt: "desc" }, { roundNumber: "desc" }],
      }),
    ]);

    const taParticipantsByPhase = new Map<
      string,
      Array<{ player: string; lives: number; rank: number | null }>
    >();
    const taPlayerNamesByPhase = new Map<string, Record<string, string>>();
    for (const entry of taActiveEntries) {
      const playerNames = taPlayerNamesByPhase.get(entry.stage) ?? {};
      playerNames[entry.playerId] = entry.player.nickname;
      taPlayerNamesByPhase.set(entry.stage, playerNames);
      if (entry.eliminated) continue;
      const participants = taParticipantsByPhase.get(entry.stage) ?? [];
      participants.push({
        player: entry.player.nickname,
        lives: entry.lives,
        rank: entry.rank ?? null,
      });
      taParticipantsByPhase.set(entry.stage, participants);
    }

    const phase3Entries = taActiveEntries.filter((entry) => entry.stage === "phase3");
    const phase3ActiveEntries = phase3Entries.filter((entry) => !entry.eliminated);
    const phase3FinalRound = taPhase3SubmittedRounds[0] ?? null;
    let championRoundId: string | null = null;
    let taChampionStandings: OverlayTaChampionStanding[] | undefined;
    if (phase3ActiveEntries.length === 1 && phase3FinalRound) {
      championRoundId = phase3FinalRound.id;
      const namesById = taPlayerNamesByPhase.get("phase3") ?? {};
      const seen = new Set<string>();
      const champion = phase3ActiveEntries[0];
      seen.add(champion.playerId);
      taChampionStandings = [
        { rank: 1, player: champion.player.nickname },
      ];

      for (const round of taPhase3SubmittedRounds) {
        const eliminatedIds = jsonStringArray(round.eliminatedIds);
        if (eliminatedIds.length === 0) continue;
        const times = timeMsByPlayer(round.results);
        const orderedEliminated = eliminatedIds
          .filter((playerId) => !seen.has(playerId))
          .sort(
            (a, b) =>
              (times.get(a) ?? Number.POSITIVE_INFINITY) -
              (times.get(b) ?? Number.POSITIVE_INFINITY),
          );
        for (const playerId of orderedEliminated) {
          const nextRank = taChampionStandings.length + 1;
          if (nextRank > 3) break;
          seen.add(playerId);
          taChampionStandings.push({
            rank: nextRank as 2 | 3,
            player: namesById[playerId] ?? playerId,
          });
        }
        if (taChampionStandings.length >= 3) break;
      }
    }

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
      ttPhaseRounds: ttPhaseRounds.map((round) => ({
        ...round,
        participants: taParticipantsByPhase.get(round.phase) ?? [],
        playerNamesById: taPlayerNamesByPhase.get(round.phase) ?? {},
        championStandings:
          round.id === championRoundId ? taChampionStandings : undefined,
      })),
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
       along so the format resolver can map the round to its match-format
       value (Battle Mode / Match Race → First to 5; Grand Prix → null). */
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
      // Any mode being confirmed = "qualification confirmed" for overlay phase display (#696)
      qualificationConfirmed,
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
    logger.error("Failed to build overlay events", { error, tournamentId: id });
    return createErrorResponse("Failed to build overlay events", 500);
  }
}

export const GET = (
  ...args: Parameters<typeof handleGET>
): ReturnType<typeof handleGET> =>
  withApiTiming('overlay-events.GET', () => handleGET(...args));

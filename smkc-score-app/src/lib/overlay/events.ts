/**
 * Pure aggregator that converts pre-fetched DB rows into a sorted list of
 * overlay events. Kept DB-free so it can be unit tested without Prisma.
 *
 * The route handler is responsible for all I/O (Prisma queries, time bounds);
 * this module only does the shape transformation and broadcast title rendering.
 */

import { COURSE_INFO } from "@/lib/constants";
import { msToDisplayTime } from "@/lib/ta/time-utils";
import type {
  BuildOverlayEventsInput,
  OverlayEvent,
  OverlayMatchInput,
  OverlayMode,
  OverlayTaChampionStanding,
  OverlayTaPhaseResult,
  OverlayTaTimeRecord,
} from "./types";

const NICKNAME_PLACEHOLDER = "BYE";

function nick(player: { nickname: string } | null | undefined): string {
  return player?.nickname ?? NICKNAME_PLACEHOLDER;
}

/**
 * Human-readable phase labels for TA. These intentionally do not use the
 * Battle Mode / Match Race-style bracket labels because TA phases are
 * sequential survival phases, not a bracket.
 */
const TA_STAGE_LABEL: Record<string, string> = {
  qualification: "Qualification",
  phase1: "Phase 1",
  phase2: "Phase 2",
  phase3: "Phase 3",
};

function courseName(abbr: string): string {
  return COURSE_INFO.find((course) => course.abbr === abbr)?.name ?? abbr;
}

function taPhaseResults(
  raw: unknown,
  eliminatedIds: Set<string>,
  playerNamesById: Record<string, string> | undefined,
): OverlayTaPhaseResult[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((result): Array<OverlayTaPhaseResult & { timeMs: number }> => {
      if (
        typeof result !== "object" ||
        result === null ||
        !("playerId" in result) ||
        !("timeMs" in result)
      ) {
        return [];
      }
      const playerId = (result as { playerId?: unknown }).playerId;
      const timeMs = (result as { timeMs?: unknown }).timeMs;
      if (typeof playerId !== "string" || typeof timeMs !== "number") return [];
      const isRetry = (result as { isRetry?: unknown }).isRetry === true;
      return [
        {
          player: playerNamesById?.[playerId] ?? playerId,
          timeFormatted: msToDisplayTime(timeMs),
          isRetry,
          eliminated: eliminatedIds.has(playerId),
          timeMs,
        },
      ];
    })
    .sort((a, b) => {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      return a.timeMs - b.timeMs;
    })
    .map(({ timeMs: _timeMs, ...result }) => result);
}

function jsonStringArray(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === "string")
    : [];
}

/**
 * Coerce a raw `assignedCourses` JSON value into a `string[]` of non-empty
 * course abbreviations. The DB column is `Json?` so the value may be null,
 * an array, or (in legacy / corrupted rows) an arbitrary shape — we defend
 * against all three and drop anything that isn't a usable string.
 *
 * Returns `undefined` when no usable courses remain so the resulting
 * `matchResult` payload simply omits the field instead of carrying an
 * empty array (which the dashboard would otherwise render as a stray
 * empty row).
 */
function normalizeCourses(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const courses = raw.filter(
    (c): c is string => typeof c === "string" && c.length > 0,
  );
  return courses.length > 0 ? courses : undefined;
}

function matchStageLabel(stage: string): string {
  if (stage === "finals") return "Finals";
  if (stage === "playoff") return "Playoff";
  return "Qualification";
}

function modeName(mode: OverlayMode): string {
  if (mode === "bm") return "Battle Mode";
  if (mode === "mr") return "Match Race";
  if (mode === "gp") return "Grand Prix";
  return "Time Attack";
}

function winnerLoser(match: OverlayMatchInput): {
  winner: { nickname: string } | null;
  loser: { nickname: string } | null;
} {
  if (match.score1 === match.score2) return { winner: null, loser: null };
  return match.score1 > match.score2
    ? { winner: match.player1, loser: match.player2 }
    : { winner: match.player2, loser: match.player1 };
}

function modeChampionStandings(
  matches: OverlayMatchInput[],
  decidingMatch: OverlayMatchInput,
): OverlayTaChampionStanding[] | null {
  const isGrandFinal = decidingMatch.round === "grand_final";
  const isReset = decidingMatch.round === "grand_final_reset";
  if (!isGrandFinal && !isReset) return null;
  if (isGrandFinal && decidingMatch.score1 <= decidingMatch.score2) return null;

  const { winner, loser } = winnerLoser(decidingMatch);
  if (!winner || !loser) return null;

  const standings: OverlayTaChampionStanding[] = [
    { rank: 1, player: nick(winner) },
    { rank: 2, player: nick(loser) },
  ];

  const losersFinal = matches.find(
    (match) => match.round === "losers_final" && match.completed,
  );
  if (losersFinal) {
    const third = winnerLoser(losersFinal).loser;
    if (third) standings.push({ rank: 3, player: nick(third) });
  }

  return standings;
}

function matchEvents(
  matches: OverlayMatchInput[],
  mode: OverlayMode,
  since: Date,
): OverlayEvent[] {
  const out: OverlayEvent[] = [];
  for (const m of matches) {
    if (!m.completed) continue;
    if (m.updatedAt.getTime() <= since.getTime()) continue;
    const stageLabel = matchStageLabel(m.stage);
    const scoreLabel = `${m.score1}-${m.score2}`;
    // BM/MR carry `assignedCourses`; GP carries a single `cup`. Build both
    // the structured payload and the subtitle suffix so the legacy toast
    // overlay (which only reads `subtitle`) shows the new context too.
    const courses = mode === "gp" ? undefined : normalizeCourses(m.assignedCourses);
    const cup =
      mode === "gp" && typeof m.cup === "string" && m.cup.length > 0
        ? m.cup
        : undefined;
    const contextSuffix = cup
      ? ` [${cup}]`
      : courses
        ? ` [${courses.join(", ")}]`
        : "";
    const matchEvent: OverlayEvent = {
      // Deterministic id ties the event to the underlying row so repeated
      // polls (or `since` overlap) collapse to the same event.
      id: `match_completed:${mode}:${m.id}:${m.updatedAt.getTime()}`,
      type: "match_completed",
      timestamp: m.updatedAt.toISOString(),
      mode,
      title: `${stageLabel} Match #${m.matchNumber} Completed`,
      subtitle: `${nick(m.player1)} ${scoreLabel} ${nick(m.player2)}${contextSuffix}`,
      // Structured payload for the dashboard scoreboard renderer. Keeping
      // `subtitle` populated alongside means consumers that don't know
      // about `matchResult` (e.g. the legacy toast overlay) still work.
      matchResult: {
        player1: nick(m.player1),
        player2: nick(m.player2),
        score1: m.score1,
        score2: m.score2,
        ...(courses ? { courses } : {}),
        ...(cup ? { cup } : {}),
      },
    };
    out.push(matchEvent);

    const championStandings = modeChampionStandings(matches, m);
    if (championStandings) {
      out.push({
        id: `mode_champion_decided:${mode}:${m.id}:${m.updatedAt.getTime()}`,
        type: "mode_champion_decided",
        timestamp: new Date(m.updatedAt.getTime() + 2).toISOString(),
        mode,
        title: `${modeName(mode)} Champion Decided`,
        subtitle: `Champion: ${championStandings[0].player}`,
        modeChampion: { standings: championStandings },
      });
    }
  }
  return out;
}

/**
 * Build a chronologically sorted (ascending) array of overlay events from
 * the provided inputs. `since` is exclusive — events with timestamp equal to
 * or before `since` are dropped, which matches how the route paginates.
 */
export function buildOverlayEvents(input: BuildOverlayEventsInput): OverlayEvent[] {
  const { since, tournament, scoreLogs, ttEntries, ttPhaseRounds } = input;
  const sinceMs = since.getTime();
  const events: OverlayEvent[] = [];

  events.push(...matchEvents(input.bmMatches, "bm", since));
  events.push(...matchEvents(input.mrMatches, "mr", since));
  events.push(...matchEvents(input.gpMatches, "gp", since));

  for (const log of scoreLogs) {
    if (log.timestamp.getTime() <= sinceMs) continue;
    const modeKey = log.matchType.toLowerCase();
    const mode: OverlayMode | undefined =
      modeKey === "bm" || modeKey === "mr" || modeKey === "gp" || modeKey === "ta"
        ? (modeKey as OverlayMode)
        : undefined;
    events.push({
      id: `score_reported:${log.id}`,
      type: "score_reported",
      timestamp: log.timestamp.toISOString(),
      mode,
      title: "Score Reported",
      subtitle: `${nick(log.player)} reported a result`,
    });
  }

  for (const e of ttEntries) {
    if (e.updatedAt.getTime() <= sinceMs) continue;
    const stageLabel = TA_STAGE_LABEL[e.stage] ?? "";
    const prefix = stageLabel ? `[${stageLabel}] ` : "";
    const playerName = nick(e.player);

    let title: string;
    let taTimeRecord: OverlayTaTimeRecord;
    let eventId: string;

    if (e.stage === "qualification") {
      // Qualification fires a single notification once all 20 courses are in
      // (totalTime becomes non-null). This collapses what used to be 20
      // per-course toasts per player into one summary card.
      //
      // Important: `recalculateRanks` (rank-calculation.ts) writes to *every*
      // TTEntry row in the stage on every PUT, which bumps every completed
      // player's `updatedAt`. If the event id were keyed on `updatedAt`, that
      // would re-fire the completion toast for every previously-completed
      // player whenever any other player edits a course. Keying on `totalTime`
      // instead makes the id content-addressable: same totalTime → same id →
      // client-side `seenRef` dedupe (see overlay/page.tsx + dashboard/page.tsx)
      // suppresses the duplicate. A genuine correction (totalTime changes by
      // even 10ms) produces a fresh id and re-fires intentionally.
      if (e.totalTime == null) continue;
      const totalTimeFormatted = msToDisplayTime(e.totalTime);
      const rankPart = e.rank ? `, Rank #${e.rank}` : "";
      title = `${prefix}${playerName} completed Qualification (${totalTimeFormatted}${rankPart})`;
      taTimeRecord = {
        player: playerName,
        phaseLabel: stageLabel || undefined,
        rank: e.rank ?? null,
        totalTimeMs: e.totalTime,
        totalTimeFormatted,
      };
      eventId = `ta_time_recorded:qualification:${e.id}:${e.totalTime}`;
    } else {
      // Phase rounds (phase1/2/3) are single-course; per-course notification
      // remains the right granularity. Skip until lastRecorded* is populated.
      if (!e.lastRecordedCourse || !e.lastRecordedTime) continue;
      const rankSuffix = e.rank ? ` (Rank #${e.rank})` : "";
      title = `${prefix}${playerName} recorded ${e.lastRecordedTime} on ${e.lastRecordedCourse}${rankSuffix}`;
      taTimeRecord = {
        player: playerName,
        course: e.lastRecordedCourse,
        time: e.lastRecordedTime,
        phaseLabel: stageLabel || undefined,
        rank: e.rank ?? null,
      };
      eventId = `ta_time_recorded:${e.id}:${e.updatedAt.getTime()}`;
    }

    events.push({
      id: eventId,
      type: "ta_time_recorded",
      timestamp: e.updatedAt.toISOString(),
      mode: "ta",
      title,
      // Subtitle stays undefined: the dashboard's TA card consumes the
      // structured payload directly, and falling back to title would render
      // a redundant sentence.
      taTimeRecord,
    });
  }

  for (const r of ttPhaseRounds) {
    const stageLabel = TA_STAGE_LABEL[r.phase] ?? "";
    const prefix = stageLabel ? `${stageLabel} ` : `${r.phase} `;
    const displayCourse = courseName(r.course);
    if (r.createdAt.getTime() > sinceMs) {
      events.push({
        id: `ta_phase_advanced:${r.id}`,
        type: "ta_phase_advanced",
        timestamp: r.createdAt.toISOString(),
        mode: "ta",
        title: `Time Attack ${prefix}Round ${r.roundNumber} Started`,
        subtitle: `Course: ${displayCourse}`,
        taPhaseRound: {
          phase: r.phase,
          phaseLabel: stageLabel || undefined,
          roundNumber: r.roundNumber,
          course: r.course,
          courseName: displayCourse,
          participants: r.participants ?? [],
        },
      });
    }

    if (r.submittedAt && r.submittedAt.getTime() > sinceMs) {
      const eliminatedIds = new Set(jsonStringArray(r.eliminatedIds));
      const results = taPhaseResults(r.results, eliminatedIds, r.playerNamesById);
      const eliminatedPlayers = jsonStringArray(r.eliminatedIds).map(
        (playerId) => r.playerNamesById?.[playerId] ?? playerId,
      );
      events.push({
        id: `ta_phase_completed:${r.id}:${r.submittedAt.getTime()}`,
        type: "ta_phase_completed",
        timestamp: r.submittedAt.toISOString(),
        mode: "ta",
        title: `Time Attack ${prefix}Round ${r.roundNumber} Completed`,
        subtitle:
          eliminatedPlayers.length > 0
            ? `Eliminated: ${eliminatedPlayers.join(", ")}`
            : "No eliminations",
        taPhaseCompleted: {
          phase: r.phase,
          phaseLabel: stageLabel || undefined,
          roundNumber: r.roundNumber,
          course: r.course,
          courseName: displayCourse,
          results,
          eliminatedPlayers,
          livesReset: r.livesReset ?? false,
        },
      });

      if (r.livesReset) {
        const remainingCount = Math.max(0, results.length - eliminatedPlayers.length);
        const remainingLabel =
          remainingCount === 1 ? "1 player remains" : `${remainingCount} players remain`;
        events.push({
          id: `ta_lives_reset:${r.id}:${r.submittedAt.getTime()}`,
          type: "ta_lives_reset",
          timestamp: new Date(r.submittedAt.getTime() + 1).toISOString(),
          mode: "ta",
          title: "Time Attack Lives Reset",
          subtitle: `${prefix}Round ${r.roundNumber}: ${remainingLabel}`,
        });
      }

      if (r.championStandings && r.championStandings.length > 0) {
        const champion = r.championStandings[0];
        events.push({
          id: `ta_champion_decided:${r.id}:${r.submittedAt.getTime()}`,
          type: "ta_champion_decided",
          timestamp: new Date(r.submittedAt.getTime() + 2).toISOString(),
          mode: "ta",
          title: "Time Attack Champion Decided",
          subtitle: champion ? `Champion: ${champion.player}` : undefined,
          taChampion: {
            roundNumber: r.roundNumber,
            standings: r.championStandings,
          },
        });
      }
    }
  }

  if (
    tournament.qualificationConfirmedAt &&
    tournament.qualificationConfirmedAt.getTime() > sinceMs
  ) {
    events.push({
      id: `qualification_confirmed:${tournament.qualificationConfirmedAt.getTime()}`,
      type: "qualification_confirmed",
      timestamp: tournament.qualificationConfirmedAt.toISOString(),
      title: "Qualification Locked",
      subtitle: "Proceeding to finals",
    });
  }

  if (
    tournament.earliestFinalsCreatedAt &&
    tournament.earliestFinalsCreatedAt.getTime() > sinceMs
  ) {
    events.push({
      id: `finals_started:${tournament.earliestFinalsCreatedAt.getTime()}`,
      type: "finals_started",
      timestamp: tournament.earliestFinalsCreatedAt.toISOString(),
      title: "Finals Bracket Generated",
      subtitle: "Finals bracket has started",
    });
  }

  if (
    tournament.latestOverallRankingUpdatedAt &&
    tournament.latestOverallRankingUpdatedAt.getTime() > sinceMs
  ) {
    events.push({
      id: `overall_ranking_updated:${tournament.latestOverallRankingUpdatedAt.getTime()}`,
      type: "overall_ranking_updated",
      timestamp: tournament.latestOverallRankingUpdatedAt.toISOString(),
      title: "Overall Ranking Updated",
      subtitle: "All-mode standings have been updated",
    });
  }

  events.sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id),
  );
  return events;
}

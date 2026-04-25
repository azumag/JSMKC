/**
 * Pure aggregator that converts pre-fetched DB rows into a sorted list of
 * overlay events. Kept DB-free so it can be unit tested without Prisma.
 *
 * The route handler is responsible for all I/O (Prisma queries, time bounds);
 * this module only does the shape transformation and Japanese title rendering.
 */

import type {
  BuildOverlayEventsInput,
  OverlayEvent,
  OverlayMatchInput,
  OverlayMode,
} from "./types";

const NICKNAME_PLACEHOLDER = "BYE";

function nick(player: { nickname: string } | null | undefined): string {
  return player?.nickname ?? NICKNAME_PLACEHOLDER;
}

const MODE_LABEL: Record<OverlayMode, string> = {
  ta: "TA",
  bm: "BM",
  mr: "MR",
  gp: "GP",
};

function matchEvents(
  matches: OverlayMatchInput[],
  mode: OverlayMode,
  since: Date,
): OverlayEvent[] {
  const out: OverlayEvent[] = [];
  for (const m of matches) {
    if (!m.completed) continue;
    if (m.updatedAt.getTime() <= since.getTime()) continue;
    const stageLabel = m.stage === "finals" ? "決勝" : "予選";
    const scoreLabel = `${m.score1}-${m.score2}`;
    out.push({
      // Deterministic id ties the event to the underlying row so repeated
      // polls (or `since` overlap) collapse to the same event.
      id: `match_completed:${mode}:${m.id}:${m.updatedAt.getTime()}`,
      type: "match_completed",
      timestamp: m.updatedAt.toISOString(),
      mode,
      title: `${MODE_LABEL[mode]} ${stageLabel} 試合 #${m.matchNumber} 終了`,
      subtitle: `${nick(m.player1)} ${scoreLabel} ${nick(m.player2)}`,
    });
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
      title: `${mode ? MODE_LABEL[mode] : ""} スコア申告`.trim(),
      subtitle: `${nick(log.player)} が結果を申告しました`,
    });
  }

  for (const e of ttEntries) {
    if (e.updatedAt.getTime() <= sinceMs) continue;
    if (e.totalTime === null) continue;
    events.push({
      id: `ta_time_recorded:${e.id}:${e.updatedAt.getTime()}`,
      type: "ta_time_recorded",
      timestamp: e.updatedAt.toISOString(),
      mode: "ta",
      title: "TA タイム更新",
      subtitle: `${nick(e.player)}${e.rank ? ` (現在 ${e.rank} 位)` : ""}`,
    });
  }

  for (const r of ttPhaseRounds) {
    if (r.createdAt.getTime() <= sinceMs) continue;
    events.push({
      id: `ta_phase_advanced:${r.id}`,
      type: "ta_phase_advanced",
      timestamp: r.createdAt.toISOString(),
      mode: "ta",
      title: `TA ${r.phase} R${r.roundNumber} 開始`,
      subtitle: `コース: ${r.course}`,
    });
  }

  if (
    tournament.qualificationConfirmedAt &&
    tournament.qualificationConfirmedAt.getTime() > sinceMs
  ) {
    events.push({
      id: `qualification_confirmed:${tournament.qualificationConfirmedAt.getTime()}`,
      type: "qualification_confirmed",
      timestamp: tournament.qualificationConfirmedAt.toISOString(),
      title: "予選確定",
      subtitle: "決勝トーナメントへ進みます",
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
      title: "決勝ブラケット生成",
      subtitle: "決勝トーナメントが開始しました",
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
      title: "総合ランキング更新",
      subtitle: "全モードの集計が更新されました",
    });
  }

  events.sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id),
  );
  return events;
}

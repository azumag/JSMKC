/**
 * Timeline view for the OBS dashboard browser source.
 *
 * Renders a vertical stack of cards. Two card variants:
 *   - Match results (`event.matchResult` populated): graphical scoreboard —
 *     player names with big tabular score digits, winner highlighted.
 *     Roughly 2× the height of a regular card so the broadcast viewer can
 *     read the result at a glance.
 *   - Everything else: compact title + optional subtitle.
 *
 * Cards are visually separated by a wider gap and a stronger ring/border
 * (no rail line, no per-mode side stripe) so each entry reads as its
 * own self-contained item. Newest events sit at the top; the parent page
 * owns polling, dedupe and capping.
 */

"use client";

import type { OverlayEvent } from "@/lib/overlay/types";

/** Inline JP relative-time formatter — same pattern as `update-indicator`. */
function formatTimeAgo(now: number, iso: string): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  return `${Math.floor(hr / 24)}日前`;
}

/* Card visual treatment: solid border + drop shadow so each card stands
   off the transparent OBS canvas as a distinct block. The previous
   `ring-1 ring-white/10` was almost invisible on a dark broadcast. */
const CARD_BASE =
  "rounded-lg border border-white/25 text-white shadow-[0_4px_12px_rgba(0,0,0,0.45)]";
const CARD_BG = "rgba(0, 0, 0, 0.78)";

interface DashboardTimelineProps {
  /** Events oldest-first (matches the API response order). */
  events: OverlayEvent[];
  /** Current wall clock for relative-time labels. */
  now: number;
  /**
   * IDs of events that were just added this poll cycle.
   * These entries receive a slide-in animation (#646) on their first render.
   * The parent is responsible for clearing this set once the animation is done.
   */
  newEventIds?: ReadonlySet<string>;
}

export function DashboardTimeline({ events, now, newEventIds }: DashboardTimelineProps) {
  /* Reverse so newest renders at the top. Don't mutate the prop — callers
     reuse the same array reference across renders for diffing. */
  const ordered = [...events].reverse();

  return (
    <div
      className="h-full overflow-y-auto pr-4"
      style={{ scrollbarWidth: "none" }}
      data-testid="dashboard-timeline"
    >
      {/* gap-4 gives ~16px breathing room between cards so the bordered look
          reads as separated blocks rather than a continuous list. */}
      <div className="flex flex-col gap-4">
        {ordered.map((event) => {
          const isMatch =
            event.type === "match_completed" && !!event.matchResult;
          const isTaTime =
            event.type === "ta_time_recorded" && !!event.taTimeRecord;
          /* New entries slide in from the right (#646). The class is removed
             after the animation completes to keep the DOM clean. */
          const isNew = newEventIds?.has(event.id) ?? false;
          return (
            <div
              key={event.id}
              className={isNew ? "timeline-slide-in" : undefined}
              data-testid="dashboard-timeline-entry"
              data-event-id={event.id}
            >
              {isMatch ? (
                <MatchScoreboardCard event={event} now={now} />
              ) : isTaTime ? (
                <TaTimeCard event={event} now={now} />
              ) : (
                <CompactCard event={event} now={now} />
              )}
            </div>
          );
        })}

        {ordered.length === 0 && (
          <div className="py-6 text-center text-sm text-white/40">
            イベント待機中…
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Standard card for non-match events (TA times, score reports, phase
 * transitions, etc.). Title + optional subtitle, kept compact so the
 * timeline stays scannable.
 */
function CompactCard({ event, now }: { event: OverlayEvent; now: number }) {
  return (
    <div
      className={`${CARD_BASE} px-4 py-3`}
      style={{ backgroundColor: CARD_BG }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-base font-semibold leading-snug">
          {event.title}
        </span>
        <span className="shrink-0 text-xs text-white/55 tabular-nums">
          {formatTimeAgo(now, event.timestamp)}
        </span>
      </div>
      {event.subtitle && (
        <div className="mt-1 text-sm leading-snug text-white/85">
          {event.subtitle}
        </div>
      )}
    </div>
  );
}

/**
 * Tall card for completed matches: header strip with the mode/round
 * context, then two rows showing player + score. Winning row gets a
 * yellow accent + bullet, losing row dims; ties show neither bullet
 * and add a "引き分け" footnote so the viewer doesn't second-guess.
 */
function MatchScoreboardCard({
  event,
  now,
}: {
  event: OverlayEvent;
  now: number;
}) {
  const r = event.matchResult!;
  const p1Wins = r.score1 > r.score2;
  const p2Wins = r.score2 > r.score1;
  return (
    <div
      className={`${CARD_BASE} px-4 py-3`}
      style={{ backgroundColor: CARD_BG }}
      data-testid="dashboard-timeline-scoreboard"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="truncate text-base font-bold text-white">
          {event.title.replace(/\s*終了\s*$/, "")}
        </span>
        <span className="shrink-0 text-xs text-white/55 tabular-nums">
          {formatTimeAgo(now, event.timestamp)}
        </span>
      </div>

      <PlayerScoreRow name={r.player1} score={r.score1} winner={p1Wins} />
      <div className="my-1 h-px bg-white/10" />
      <PlayerScoreRow name={r.player2} score={r.score2} winner={p2Wins} />

      {/* Course/cup row: BM/MR show a chip per assigned course; GP shows the
          cup name as a single chip. Source-of-truth is the aggregator — we
          render whichever field is populated and skip the row entirely when
          neither is, so legacy rows without context don't get a stray gap. */}
      {(r.courses?.length || r.cup) && (
        <div
          className="mt-2 flex flex-wrap items-center gap-1.5"
          data-testid="dashboard-timeline-context"
        >
          {r.cup && (
            <span className="rounded bg-white/10 px-2 py-0.5 text-sm font-medium text-white/85">
              {r.cup}
            </span>
          )}
          {r.courses?.map((course) => (
            <span
              key={course}
              className="rounded bg-white/10 px-2 py-0.5 text-sm font-medium text-white/85"
            >
              {course}
            </span>
          ))}
        </div>
      )}

      {!p1Wins && !p2Wins && (
        <div className="mt-1 text-center text-xs text-white/50">引き分け</div>
      )}
    </div>
  );
}

/**
 * Rich card for a recorded TA time. Same overall sizing as the match
 * scoreboard so both event types feel like first-class entries on the
 * timeline. Top row: phase + relative timestamp. Middle row: player name
 * with rank chip. Bottom row: course label + the time itself rendered
 * large enough to read from across the room.
 */
function TaTimeCard({ event, now }: { event: OverlayEvent; now: number }) {
  const t = event.taTimeRecord!;
  return (
    <div
      className={`${CARD_BASE} px-4 py-3`}
      style={{ backgroundColor: CARD_BG }}
      data-testid="dashboard-timeline-ta-time"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="truncate text-base font-bold text-white">
          {t.phaseLabel ? `[${t.phaseLabel}] ` : ""}TA タイム更新
        </span>
        <span className="shrink-0 text-xs text-white/55 tabular-nums">
          {formatTimeAgo(now, event.timestamp)}
        </span>
      </div>

      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-base font-medium text-white/90">
          {t.player}
        </span>
        {t.rank != null && (
          <span className="shrink-0 rounded bg-yellow-400/20 px-2 py-0.5 text-sm font-semibold text-yellow-300">
            現在 {t.rank} 位
          </span>
        )}
      </div>

      <div className="my-1 h-px bg-white/10" />

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="rounded bg-white/10 px-2 py-0.5 text-sm font-medium text-white/85">
          {t.course}
        </span>
        <span className="text-3xl font-bold tabular-nums text-yellow-400">
          {t.time}
        </span>
      </div>
    </div>
  );
}

function PlayerScoreRow({
  name,
  score,
  winner,
}: {
  name: string;
  score: number;
  winner: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${
        winner ? "" : "opacity-60"
      }`}
    >
      <span
        className={`min-w-0 flex-1 truncate text-base ${
          winner ? "font-bold text-yellow-400" : "font-medium text-white/85"
        }`}
      >
        {winner ? "▶ " : ""}
        {name}
      </span>
      <span
        className={`shrink-0 tabular-nums ${
          winner
            ? "text-3xl font-bold text-yellow-400"
            : "text-2xl font-semibold text-white/70"
        }`}
      >
        {score}
      </span>
    </div>
  );
}

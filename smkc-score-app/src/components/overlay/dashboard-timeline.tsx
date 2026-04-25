/**
 * Timeline view for the OBS dashboard browser source.
 *
 * Renders a vertical timeline with a single rail line and mode-colored
 * dot markers. Two card variants:
 *   - Match results (`event.matchResult` populated): graphical scoreboard
 *     row — player names with big tabular score digits, winner highlighted.
 *     Roughly 2× the height of a regular card so the broadcast viewer can
 *     read the result at a glance.
 *   - Everything else: compact title + optional subtitle.
 *
 * Newest events are pinned at the top; the parent page owns polling,
 * dedupe and capping.
 */

"use client";

import type { OverlayEvent, OverlayMode } from "@/lib/overlay/types";

const MODE_COLOR: Record<OverlayMode, string> = {
  ta: "bg-yellow-400",
  bm: "bg-red-500",
  mr: "bg-blue-500",
  gp: "bg-green-500",
};

const NEUTRAL_ACCENT = "bg-white";

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

interface DashboardTimelineProps {
  /** Events oldest-first (matches the API response order). */
  events: OverlayEvent[];
  /** Current wall clock for relative-time labels. */
  now: number;
}

export function DashboardTimeline({ events, now }: DashboardTimelineProps) {
  /* Reverse so newest renders at the top. Don't mutate the prop — callers
     reuse the same array reference across renders for diffing. */
  const ordered = [...events].reverse();

  return (
    <div
      className="h-full overflow-y-auto pr-4"
      style={{ scrollbarWidth: "none" }}
      data-testid="dashboard-timeline"
    >
      <div>
        {ordered.map((event) => {
          const isMatch = event.type === "match_completed" && !!event.matchResult;
          return (
            <div
              key={event.id}
              className="mb-3 last:mb-0"
              data-testid="dashboard-timeline-entry"
              data-event-id={event.id}
            >
              {isMatch ? (
                <MatchScoreboardCard event={event} now={now} />
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
      className="rounded-md px-4 py-3 text-white shadow-md ring-1 ring-white/10"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
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
 *
 * The underlying mode color of the dot is also reused as the left
 * accent stripe so the card visually ties back to its rail marker.
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
  const accent = event.mode ? MODE_COLOR[event.mode] : NEUTRAL_ACCENT;
  return (
    <div
      className="overflow-hidden rounded-md text-white shadow-md ring-1 ring-white/10"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.75)" }}
      data-testid="dashboard-timeline-scoreboard"
    >
      <div className="flex">
        {/* Mode accent stripe — links the card visually to its rail dot. */}
        <div className={`w-1 shrink-0 ${accent}`} />
        <div className="flex-1 px-4 py-3">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            {/* Title rendered in full-strength white + bold so it reads
                clearly as the card heading. The previous dimmed/uppercase
                "label" treatment made it look like meta-text rather than
                the headline. */}
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

          {!p1Wins && !p2Wins && (
            <div className="mt-1 text-center text-xs text-white/50">
              引き分け
            </div>
          )}
        </div>
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

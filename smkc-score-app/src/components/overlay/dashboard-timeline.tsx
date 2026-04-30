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

/** Inline relative-time formatter — same pattern as `update-indicator`. */
function formatTimeAgo(now: number, iso: string): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "now";
  const sec = Math.floor(ms / 1000);
  if (sec < 5) return "now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
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
          const isTaPhase =
            event.type === "ta_phase_advanced" && !!event.taPhaseRound;
          const isTaPhaseCompleted =
            event.type === "ta_phase_completed" && !!event.taPhaseCompleted;
          const isTaLivesReset = event.type === "ta_lives_reset";
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
              ) : isTaPhase ? (
                <TaPhaseRoundCard event={event} now={now} />
              ) : isTaPhaseCompleted ? (
                <TaPhaseCompletedCard event={event} now={now} />
              ) : isTaLivesReset ? (
                <TaLivesResetCard event={event} now={now} />
              ) : (
                <CompactCard event={event} now={now} />
              )}
            </div>
          );
        })}

        {ordered.length === 0 && (
          <div className="py-6 text-center text-sm text-white/40">
            Waiting for events...
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
 * and add a "Draw" footnote so the viewer doesn't second-guess.
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
          {event.title.replace(/\s*Completed\s*$/, "")}
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
      {((r.courses && r.courses.length > 0) || r.cup) && (
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
        <div className="mt-1 text-center text-xs text-white/50">Draw</div>
      )}
    </div>
  );
}

/**
 * Rich card for a TA event. Two flavors:
 *
 *  - Qualification completion (`totalTimeFormatted` set): heading reads
 *    "Time Attack Qualification Complete", bottom row shows the total time prominently. No
 *    course chip because qualification is 20 courses' worth of time
 *    aggregated.
 *  - Phase round (per-course `course` + `time`): unchanged — course chip
 *    + course time digits.
 *
 * Same overall sizing as the match scoreboard so both event types feel
 * like first-class timeline entries.
 */
function TaTimeCard({ event, now }: { event: OverlayEvent; now: number }) {
  // Defensive: an in-flight overlay event without a structured payload
  // would otherwise crash the dashboard timeline. We render nothing so
  // the surrounding card list keeps working.
  if (!event.taTimeRecord) return null;
  const t = event.taTimeRecord;
  // Discriminate the two payload flavors strictly: both totalTimeMs (raw)
  // and a non-empty totalTimeFormatted (rendered) must be present, so a
  // malformed qualification payload can't silently render a blank digit
  // row, and a phase-round payload that happens to carry a stray
  // formatted string can't accidentally route to the qualification branch.
  const isQualificationTotal =
    typeof t.totalTimeMs === "number" &&
    typeof t.totalTimeFormatted === "string" &&
    t.totalTimeFormatted.length > 0;
  const heading = isQualificationTotal
    ? `${t.phaseLabel ? `[${t.phaseLabel}] ` : ""}Time Attack Qualification Complete`
    : `${t.phaseLabel ? `[${t.phaseLabel}] ` : ""}Time Attack Time Updated`;

  return (
    <div
      className={`${CARD_BASE} px-4 py-3`}
      style={{ backgroundColor: CARD_BG }}
      data-testid="dashboard-timeline-ta-time"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="truncate text-base font-bold text-white">
          {heading}
        </span>
        <span className="shrink-0 text-xs text-white/55 tabular-nums">
          {formatTimeAgo(now, event.timestamp)}
        </span>
      </div>

      <div
        className={`mb-2 flex items-center justify-between ${
          isQualificationTotal ? "gap-3" : "gap-2"
        }`}
      >
        <span
          className={`min-w-0 flex-1 font-medium text-white/90 ${
            isQualificationTotal
              ? "line-clamp-2 break-words text-3xl leading-tight"
              : "truncate text-base"
          }`}
          data-testid="dashboard-timeline-ta-player"
        >
          {t.player}
        </span>
        {t.rank != null && !isQualificationTotal && (
          <span
            className="shrink-0 rounded bg-yellow-400/20 px-2 py-0.5 text-sm font-semibold text-yellow-300"
            data-testid="dashboard-timeline-ta-rank"
          >
            Rank #{t.rank}
          </span>
        )}
      </div>

      <div className="my-1 h-px bg-white/10" />

      {isQualificationTotal ? (
        <div className="mt-2 flex items-baseline justify-between gap-3">
          {t.rank != null ? (
            <span
              className="shrink-0 rounded bg-yellow-400/20 px-2.5 py-1 text-2xl font-semibold leading-tight text-yellow-300"
              data-testid="dashboard-timeline-ta-rank"
            >
              Rank #{t.rank}
            </span>
          ) : null}
          <div className="min-w-0 flex items-baseline text-right">
            <span
              className="text-3xl font-bold tabular-nums text-yellow-400"
              data-testid="dashboard-timeline-ta-total"
            >
              {t.totalTimeFormatted}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <span className="rounded bg-white/10 px-2 py-0.5 text-sm font-medium text-white/85">
            {t.course}
          </span>
          <span className="text-3xl font-bold tabular-nums text-yellow-400">
            {t.time}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Rich card for a TA phase-round start. Shows the selected course plus the
 * active entrants at the moment the overlay event was built, including their
 * current life count for finals visibility.
 */
function TaPhaseRoundCard({ event, now }: { event: OverlayEvent; now: number }) {
  if (!event.taPhaseRound) return null;
  const r = event.taPhaseRound;
  const phaseLabel = r.phaseLabel ?? r.phase;
  const showLives = r.phase === "phase3";
  const denseParticipants = showLives && r.participants.length > 12;

  return (
    <div
      className={`${CARD_BASE} px-4 py-3`}
      style={{ backgroundColor: CARD_BG }}
      data-testid="dashboard-timeline-ta-phase-round"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="truncate text-base font-bold text-white">
          {phaseLabel} Round {r.roundNumber}
        </span>
        <span className="shrink-0 text-xs text-white/55 tabular-nums">
          {formatTimeAgo(now, event.timestamp)}
        </span>
      </div>

      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-white/70">Course</span>
        <span
          className="min-w-0 flex-1 text-right text-3xl font-bold text-yellow-400"
          data-testid="dashboard-timeline-ta-phase-course"
        >
          {r.courseName}
        </span>
      </div>

      {r.participants.length > 0 && (
        <div
          className={`grid ${
            denseParticipants ? "grid-cols-2 gap-1" : "grid-cols-1 gap-1.5"
          }`}
          data-testid="dashboard-timeline-ta-phase-participants"
        >
          {r.participants.map((participant) => (
            <div
              key={`${participant.player}:${participant.rank ?? "none"}`}
              className={`flex items-center justify-between rounded bg-white/10 ${
                denseParticipants ? "gap-1 px-1.5 py-0.5" : "gap-2 px-2 py-1"
              }`}
            >
              <div className="min-w-0 flex items-center gap-2">
                {denseParticipants ? (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-green-300"
                    aria-label="Active"
                  />
                ) : (
                  <span className="rounded bg-green-400/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-green-300">
                    Active
                  </span>
                )}
                <span className="truncate text-base font-semibold text-white">
                  {participant.player}
                </span>
              </div>
              {showLives && (
                <span
                  className={`shrink-0 rounded bg-red-400/15 font-bold tabular-nums text-red-300 ${
                    denseParticipants ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-sm"
                  }`}
                >
                  Life {participant.lives}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaLivesResetCard({ event, now }: { event: OverlayEvent; now: number }) {
  return (
    <div
      className={`${CARD_BASE} border-blue-300/60 px-4 py-3`}
      style={{ backgroundColor: "rgba(15, 23, 42, 0.88)" }}
      data-testid="dashboard-timeline-ta-lives-reset"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-lg font-bold text-blue-200">
          {event.title}
        </span>
        <span className="shrink-0 text-xs text-white/55 tabular-nums">
          {formatTimeAgo(now, event.timestamp)}
        </span>
      </div>
      {event.subtitle && (
        <div className="mt-1 text-base font-semibold leading-snug text-white">
          {event.subtitle}
        </div>
      )}
      <div className="mt-2 rounded bg-blue-400/15 px-2 py-1 text-center text-sm font-bold text-blue-100">
        All remaining players return to Life 3
      </div>
    </div>
  );
}

function TaPhaseCompletedCard({ event, now }: { event: OverlayEvent; now: number }) {
  if (!event.taPhaseCompleted) return null;
  const r = event.taPhaseCompleted;
  const phaseLabel = r.phaseLabel ?? r.phase;
  const denseResults = r.phase === "phase3" && r.results.length > 12;

  return (
    <div
      className={`${CARD_BASE} px-4 py-3`}
      style={{ backgroundColor: CARD_BG }}
      data-testid="dashboard-timeline-ta-phase-completed"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="truncate text-base font-bold text-white">
          {phaseLabel} Round {r.roundNumber}
        </span>
        <span className="shrink-0 text-xs text-white/55 tabular-nums">
          {formatTimeAgo(now, event.timestamp)}
        </span>
      </div>

      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-white/70">{r.courseName}</span>
        {r.eliminatedPlayers.length > 0 && (
          <span
            className="shrink-0 rounded bg-red-400/15 px-2 py-0.5 text-sm font-bold text-red-300"
            data-testid="dashboard-timeline-ta-phase-eliminated"
          >
            Eliminated {r.eliminatedPlayers.join(", ")}
          </span>
        )}
      </div>

      <div
        className={`grid ${denseResults ? "grid-cols-2 gap-1" : "grid-cols-1 gap-1.5"}`}
        data-testid="dashboard-timeline-ta-phase-results"
      >
        {r.results.map((result, index) => (
          <div
            key={`${result.player}:${result.timeFormatted}:${index}`}
            className={`flex items-center justify-between rounded ${
              denseResults ? "gap-1 px-1.5 py-0.5" : "gap-2 px-2 py-1"
            } ${
              result.eliminated ? "bg-red-400/10" : "bg-white/10"
            }`}
          >
            <span
              className={`line-clamp-2 min-w-0 flex-1 break-words font-semibold leading-tight ${
                denseResults ? "text-sm" : "text-base"
              } ${
                result.eliminated ? "text-red-200" : "text-white"
              }`}
            >
              {result.player}
              {result.eliminated ? " / Eliminated" : ""}
            </span>
            <span
              className={`shrink-0 font-bold tabular-nums text-yellow-400 ${
                denseResults ? "text-base" : "text-xl"
              }`}
            >
              {result.timeFormatted}
              {result.isRetry ? " Retry" : ""}
            </span>
          </div>
        ))}
      </div>

      {r.livesReset && (
        <div className="mt-2 text-center text-xs font-semibold text-blue-200">
          Lives Reset
        </div>
      )}
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

/**
 * Single overlay toast notification.
 *
 * The overlay is rendered inside an OBS browser source where the host has no
 * mouse / keyboard, so this component is purely presentational — no buttons,
 * no dismiss affordance. The mode-colored accent bar lets the broadcaster
 * see at a glance which game mode the event came from.
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

function championTitle(event: OverlayEvent): string {
  if (event.type === "ta_champion_decided") return "Time Attack Champion";
  if (event.mode === "bm") return "Battle Mode Champion";
  if (event.mode === "mr") return "Match Race Champion";
  if (event.mode === "gp") return "Grand Prix Champion";
  return "Champion";
}

export function OverlayToast({ event, leaving }: { event: OverlayEvent; leaving: boolean }) {
  const accent = event.mode ? MODE_COLOR[event.mode] : NEUTRAL_ACCENT;
  const champion = event.taChampion ?? event.modeChampion;
  const isChampion =
    (event.type === "ta_champion_decided" || event.type === "mode_champion_decided") &&
    !!champion;
  const isMatch = event.type === "match_completed" && !!event.matchResult;

  return (
    <div
      className={[
        "flex max-w-[90vw] overflow-hidden rounded-lg shadow-2xl ring-1 ring-white/10 backdrop-blur-md",
        isChampion || isMatch ? "w-[40rem]" : "w-[28rem]",
        "transition-all duration-300 ease-out will-change-transform",
        leaving ? "translate-x-full opacity-0" : "translate-x-0 opacity-100",
      ].join(" ")}
      style={{ backgroundColor: isChampion ? "rgba(24, 18, 5, 0.92)" : "rgba(15, 23, 42, 0.85)" }}
      data-testid="overlay-toast"
      data-event-id={event.id}
    >
      <div className={`w-2 shrink-0 ${accent}`} />
      {/* Title and subtitle render at the same large size — broadcasters
          asked for a single visual weight rather than a "title + body" split. */}
      <div className="flex-1 px-5 py-4 text-white">
        {isChampion ? (
          <div data-testid="overlay-toast-ta-champion">
            <div className="text-2xl font-bold leading-tight text-yellow-100">
              {championTitle(event)}
            </div>
            <div className="mt-1 line-clamp-2 break-words text-5xl font-black leading-none text-yellow-300">
              {champion?.standings[0]?.player}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              {champion?.standings.slice(1, 3).map((standing) => (
                <div key={standing.rank} className="rounded bg-white/10 px-3 py-2">
                  <div className="text-xs font-bold text-white/60">
                    {standing.rank === 2 ? "2nd" : "3rd"}
                  </div>
                  <div className="truncate text-xl font-bold text-white">
                    {standing.player}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : isMatch ? (
          <div data-testid="overlay-toast-match-completed">
            <div className="text-lg font-bold leading-tight text-white/80">
              {event.title.replace(/\s*Completed\s*$/, "")}
            </div>
            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div
                className={`line-clamp-2 break-words text-4xl font-black leading-none ${
                  event.matchResult!.score1 > event.matchResult!.score2
                    ? "text-yellow-300"
                    : "text-white"
                }`}
              >
                {event.matchResult!.player1}
              </div>
              <div className="text-3xl font-black tabular-nums text-white">
                {event.matchResult!.score1}-{event.matchResult!.score2}
              </div>
              <div
                className={`line-clamp-2 break-words text-right text-4xl font-black leading-none ${
                  event.matchResult!.score2 > event.matchResult!.score1
                    ? "text-yellow-300"
                    : "text-white"
                }`}
              >
                {event.matchResult!.player2}
              </div>
            </div>
            {((event.matchResult!.courses && event.matchResult!.courses.length > 0) ||
              event.matchResult!.cup) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {event.matchResult!.cup && (
                  <span className="rounded bg-white/10 px-2 py-0.5 text-sm font-semibold text-white/85">
                    {event.matchResult!.cup}
                  </span>
                )}
                {event.matchResult!.courses?.map((course) => (
                  <span
                    key={course}
                    className="rounded bg-white/10 px-2 py-0.5 text-sm font-semibold text-white/85"
                  >
                    {course}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="text-xl font-semibold leading-snug tracking-tight">{event.title}</div>
            {event.subtitle && (
              <div className="mt-1 text-xl font-semibold leading-snug tracking-tight">
                {event.subtitle}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

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

export function OverlayToast({ event, leaving }: { event: OverlayEvent; leaving: boolean }) {
  const accent = event.mode ? MODE_COLOR[event.mode] : NEUTRAL_ACCENT;
  const isChampion = event.type === "ta_champion_decided" && !!event.taChampion;

  return (
    <div
      className={[
        "flex max-w-[90vw] overflow-hidden rounded-lg shadow-2xl ring-1 ring-white/10 backdrop-blur-md",
        isChampion ? "w-[40rem]" : "w-[28rem]",
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
              Time Attack Champion
            </div>
            <div className="mt-1 line-clamp-2 break-words text-5xl font-black leading-none text-yellow-300">
              {event.taChampion?.standings[0]?.player}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              {event.taChampion?.standings.slice(1, 3).map((standing) => (
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

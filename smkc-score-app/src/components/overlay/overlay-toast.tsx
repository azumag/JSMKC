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

  return (
    <div
      className={[
        "flex w-80 overflow-hidden rounded-lg shadow-2xl ring-1 ring-white/10 backdrop-blur-md",
        "transition-all duration-300 ease-out will-change-transform",
        leaving ? "translate-x-full opacity-0" : "translate-x-0 opacity-100",
      ].join(" ")}
      style={{ backgroundColor: "rgba(15, 23, 42, 0.85)" }}
      data-testid="overlay-toast"
      data-event-id={event.id}
    >
      <div className={`w-1.5 shrink-0 ${accent}`} />
      <div className="flex-1 px-4 py-3 text-white">
        <div className="text-sm font-semibold leading-tight tracking-tight">{event.title}</div>
        {event.subtitle && (
          <div className="mt-0.5 text-xs leading-snug text-white/80">{event.subtitle}</div>
        )}
      </div>
    </div>
  );
}

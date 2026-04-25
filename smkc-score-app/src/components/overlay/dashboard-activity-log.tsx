/**
 * Vertical activity-log column for the OBS dashboard browser source.
 *
 * Renders the same `OverlayEvent` stream the toast overlay consumes, but as
 * a persistent scrolling history (no auto-dismiss) — newest at top. Designed
 * to live inside the right-edge slot of a 1920×1080 broadcast scene; sizing
 * is owned by the parent page so the column can be re-positioned in one
 * place when the broadcast layout shifts.
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

/**
 * Lightweight relative-time formatter — same shape as
 * `src/components/ui/update-indicator.tsx` but localized to Japanese
 * abbreviations so the dashboard reads natively on a JP broadcast.
 */
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

interface DashboardActivityLogProps {
  /** Events oldest-first (matches the API response order). */
  events: OverlayEvent[];
  /** Current wall clock for relative-time labels — passed in for testability. */
  now: number;
}

export function DashboardActivityLog({ events, now }: DashboardActivityLogProps) {
  /* Reverse so the newest event renders at the top. We avoid mutating the
     prop (callers reuse the same array across renders for diffing). */
  const ordered = [...events].reverse();

  return (
    <div
      className="flex h-full w-full flex-col gap-2 overflow-y-auto pr-1"
      style={{ scrollbarWidth: "none" }}
      data-testid="dashboard-activity-log"
    >
      {ordered.map((event) => {
        const accent = event.mode ? MODE_COLOR[event.mode] : NEUTRAL_ACCENT;
        return (
          <div
            key={event.id}
            className="flex overflow-hidden rounded-lg shadow-2xl ring-1 ring-white/10"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
            data-testid="dashboard-activity-log-entry"
            data-event-id={event.id}
          >
            <div className={`w-2 shrink-0 ${accent}`} />
            <div className="flex-1 px-4 py-3 text-white">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-lg font-semibold leading-snug tracking-tight">
                  {event.title}
                </div>
                <div className="shrink-0 text-xs text-white/60 tabular-nums">
                  {formatTimeAgo(now, event.timestamp)}
                </div>
              </div>
              {event.subtitle && (
                <div className="mt-1 text-lg font-semibold leading-snug tracking-tight">
                  {event.subtitle}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

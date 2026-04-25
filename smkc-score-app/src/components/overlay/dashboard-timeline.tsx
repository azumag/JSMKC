/**
 * Timeline view for the OBS dashboard browser source.
 *
 * Replaces the old card-stack activity log with a vertical timeline:
 * a single rail line with mode-colored dot markers and inline event text.
 * Newest entries pinned at the top so the viewer's eye stays on what
 * just happened. The component is purely presentational — the parent
 * page owns polling + dedupe + capping.
 */

"use client";

import type { OverlayEvent, OverlayMode } from "@/lib/overlay/types";

const MODE_COLOR: Record<OverlayMode, string> = {
  ta: "bg-yellow-400",
  bm: "bg-red-500",
  mr: "bg-blue-500",
  gp: "bg-green-500",
};

const NEUTRAL_DOT = "bg-white";

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
      className="h-full overflow-y-auto pr-3"
      style={{ scrollbarWidth: "none" }}
      data-testid="dashboard-timeline"
    >
      <div className="relative pl-10">
        {/* Vertical rail. Sits behind the dots and stretches full height.
            Rail x-center (~21px) intentionally aligns with the dot center
            below — keep the offsets in sync if pl-* changes. */}
        <div className="pointer-events-none absolute bottom-1 left-[20px] top-1 w-px bg-white/15" />

        {ordered.map((event) => {
          const dot = event.mode ? MODE_COLOR[event.mode] : NEUTRAL_DOT;
          return (
            <div
              key={event.id}
              className="relative mb-3 last:mb-0"
              data-testid="dashboard-timeline-entry"
              data-event-id={event.id}
            >
              {/* Dot marker on the rail. With pl-10 (40) and dot width 14,
                  left:-26 puts the dot center at 40 - 26 + 7 = 21 — matches
                  the rail above. */}
              <div
                className={`absolute left-[-26px] top-[8px] h-3.5 w-3.5 rounded-full ring-2 ring-black/60 ${dot}`}
              />

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

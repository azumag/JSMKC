/**
 * Update Indicator Component
 *
 * A real-time status indicator that shows whether data polling is active
 * and how recently the data was last refreshed. This provides crucial
 * feedback in the JSMKC tournament management interface where scores
 * and rankings need to be updated in near-real-time during live events.
 *
 * Not marked as "use client" explicitly because it uses React hooks
 * (useState, useEffect) which implicitly require client-side execution.
 * The parent component importing this must be a client component.
 *
 * Visual states:
 * - Live (polling active): Green badge with animated spinner icon
 * - Paused (polling inactive): Gray badge with clock icon
 * - Time since last update: Text showing "Xs ago", "Xm ago", or "Xh ago"
 *
 * The time display updates every second via setInterval to provide
 * continuous feedback even when no new data arrives.
 */
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Clock, Loader2 } from "lucide-react";

/**
 * Props for the UpdateIndicator component.
 *
 * @property lastUpdated - The timestamp of the most recent data update.
 *   When null, no time-ago text is displayed (initial state before first fetch).
 * @property isPolling - Whether automatic data polling is currently active.
 *   Controls the visual state (Live vs Paused badge).
 */
interface UpdateIndicatorProps {
  lastUpdated: Date | null;
  isPolling: boolean;
}

/**
 * Real-time update status indicator.
 *
 * Displays a badge showing the current polling state (Live/Paused)
 * and a relative time display showing how long ago the data was
 * last refreshed.
 *
 * The secondsAgo counter updates every 1000ms to provide a live
 * "time since last update" display. This helps tournament operators
 * know if the data is fresh and if polling is functioning correctly.
 *
 * The "Last updated" text and state labels are hidden on small screens
 * (sm:inline) to conserve horizontal space in mobile layouts, while
 * the badge icon remains visible as a minimal status indicator.
 */
export function UpdateIndicator({
  lastUpdated,
  isPolling,
}: UpdateIndicatorProps) {
  /**
   * Track seconds since last update, initialized from the lastUpdated prop.
   * Uses a factory initializer to compute the initial value synchronously
   * without causing a re-render on mount.
   */
  const [secondsAgo, setSecondsAgo] = useState(() => {
    if (!lastUpdated) return 0;
    return Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
  });

  /**
   * Effect: Updates the secondsAgo counter every second.
   * Re-runs when lastUpdated changes (new data arrives), resetting
   * the counter. Cleans up the interval on unmount or dependency change
   * to prevent memory leaks.
   */
  useEffect(() => {
    if (!lastUpdated) return;

    const interval = setInterval(() => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);
      setSecondsAgo(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [lastUpdated]);

  /**
   * Formats a seconds value into a human-readable relative time string.
   * Uses progressive units: seconds -> minutes -> hours.
   * This simple formatter avoids external dependencies (e.g., date-fns)
   * for this lightweight display-only use case.
   */
  const formatTimeAgo = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <div className="flex items-center gap-2">
      {/* Polling status badge: Live (spinning icon) or Paused (clock icon) */}
      {isPolling ? (
        <Badge variant="default" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          {/* Label text hidden on mobile to save space */}
          <span className="hidden sm:inline">Live</span>
        </Badge>
      ) : (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" />
          {/* Label text hidden on mobile to save space */}
          <span className="hidden sm:inline">Paused</span>
        </Badge>
      )}
      {/* Relative time display, only shown when data has been fetched at least once.
          Hidden on mobile (sm:inline) to conserve horizontal space. */}
      {lastUpdated && (
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Last updated: {formatTimeAgo(secondsAgo)}
        </span>
      )}
    </div>
  );
}

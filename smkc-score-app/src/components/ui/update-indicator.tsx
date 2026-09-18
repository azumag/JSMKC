/**
 * Update Indicator Component
 *
 * A real-time status indicator that shows whether data polling is active
 * and how recently the data was last refreshed. This provides crucial
 * feedback in the JSMKC tournament management interface where scores
 * and rankings need to be updated in near-real-time during live events.
 *
 * This module declares an explicit client boundary because it owns React
 * state/effects and next-intl's client translation hook. Callers can import
 * the component without relying on an ancestor to establish that boundary.
 *
 * Visual states:
 * - Live (polling active): Green badge with animated spinner icon
 * - Paused (polling inactive): Gray badge with clock icon
 * - Time since last update: Localized relative-time text
 *
 * The time display updates every second via setInterval to provide
 * continuous feedback even when no new data arrives.
 */
'use client';

import { Clock, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';

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

function secondsSince(lastUpdated: Date | null): number {
  if (!lastUpdated) return 0;
  return Math.max(0, Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
}

/**
 * Real-time update status indicator.
 *
 * Displays a badge showing the current polling state and a localized
 * relative time display showing how long ago the data was last refreshed.
 *
 * A one-second clock tick triggers re-renders while a timestamp is present.
 * The displayed age itself is derived from the current `lastUpdated` prop on
 * every render, so fresh data resets the label immediately instead of waiting
 * for the next timer tick.
 *
 * The status text and relative time are visually hidden on small screens
 * (`sr-only`) to conserve horizontal space in mobile layouts while remaining
 * available to assistive technology. They become visible again at `sm`.
 */
export function UpdateIndicator({ lastUpdated, isPolling }: UpdateIndicatorProps) {
  const t = useTranslations('updateIndicator');
  const [, setClockTick] = useState(0);

  /**
   * Trigger a render every second while a timestamp is visible. The relative
   * age is derived below so lastUpdated prop changes do not need effect-driven
   * state synchronization. Cleanup prevents stale intervals after prop changes
   * or unmount.
   */
  useEffect(() => {
    if (!lastUpdated) return;

    const interval = setInterval(() => {
      setClockTick((tick) => tick + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [lastUpdated]);

  const secondsAgo = secondsSince(lastUpdated);

  /**
   * Formats a seconds value into a localized relative time string.
   * Uses progressive units: seconds -> minutes -> hours.
   */
  const formatTimeAgo = (seconds: number): string => {
    if (seconds < 60) return t('secondsAgo', { count: seconds });
    if (seconds < 3600) return t('minutesAgo', { count: Math.floor(seconds / 60) });
    return t('hoursAgo', { count: Math.floor(seconds / 3600) });
  };

  return (
    <div className="flex items-center gap-2">
      {/* Polling status badge: live (spinning icon) or paused (clock icon) */}
      {isPolling ? (
        <Badge variant="default" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          {/* Keep the localized label available to screen readers on mobile. */}
          <span className="sr-only sm:not-sr-only">{t('live')}</span>
        </Badge>
      ) : (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" />
          {/* Keep the localized label available to screen readers on mobile. */}
          <span className="sr-only sm:not-sr-only">{t('paused')}</span>
        </Badge>
      )}
      {/* Relative time stays readable by assistive technology on mobile while
          becoming visibly inline at the same breakpoint as before. */}
      {lastUpdated && (
        <span className="sr-only text-xs text-muted-foreground sm:not-sr-only">
          {t('lastUpdated', { time: formatTimeAgo(secondsAgo) })}
        </span>
      )}
    </div>
  );
}

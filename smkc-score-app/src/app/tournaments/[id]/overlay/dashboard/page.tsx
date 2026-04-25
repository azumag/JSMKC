/**
 * OBS dashboard browser source.
 *
 * Companion to `/tournaments/[id]/overlay` (the ephemeral toast page).
 * This route renders a *persistent* activity log on the right edge of a
 * 1920×1080 broadcast canvas plus a phase footer in the bottom-left strip,
 * sized to fit the JSMKC broadcast scene's existing slots:
 *   - Activity log column @ top: 96px, right: 20px, w: 440px, h: 900px
 *   - Phase footer       @ bottom: 0,  left: 80px, w: 1140px, h: 82px
 *
 * The right portion of the bottom strip is reserved for the broadcaster's
 * 解説 / Discord overlay and is left untouched. Coordinates are encoded as
 * Tailwind arbitrary values right here so layout changes are a one-file
 * tweak when the scene shifts.
 *
 * No authentication — same model as the toast overlay (the URL is the
 * broadcast token).
 */

"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { DashboardFooter } from "@/components/overlay/dashboard-footer";
import { DashboardProgressBar } from "@/components/overlay/dashboard-progress-bar";
import { DashboardTimeline } from "@/components/overlay/dashboard-timeline";
import type { OverlayEvent, OverlayEventsResponse } from "@/lib/overlay/types";
import { POLLING_INTERVAL } from "@/lib/constants";

/** Cap matches the server-side INITIAL_BACKFILL_LIMIT — keeps the column tight. */
const MAX_EVENTS = 100;

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
}

export default function DashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [events, setEvents] = useState<OverlayEvent[]>([]);
  const [currentPhase, setCurrentPhase] = useState<string>("");
  const [now, setNow] = useState<number>(() => Date.now());

  /* `since` advances each poll. First call uses `?initial=1` (no since)
     to backfill recent history; subsequent calls echo back `serverTime`. */
  const sinceRef = useRef<string | null>(null);
  /* Dedupe overlapping `since` windows the same way the toast page does. */
  const seenRef = useRef<Set<string>>(new Set());

  /* Tick a wall-clock state every second so relative-time labels update
     without re-fetching. The poll loop runs every 3s for new data. */
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, []);

  const poll = useCallback(async () => {
    try {
      const url = new URL(
        `/api/tournaments/${encodeURIComponent(id)}/overlay-events`,
        window.location.origin,
      );
      const isFirst = sinceRef.current === null;
      if (isFirst) {
        url.searchParams.set("initial", "1");
      } else {
        url.searchParams.set("since", sinceRef.current!);
      }
      const res = await fetch(url.toString(), {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      const json = (await res.json()) as ApiEnvelope<OverlayEventsResponse>;
      const payload = json.data ?? (json as unknown as OverlayEventsResponse);
      if (!payload) return;

      sinceRef.current = payload.serverTime;
      if (payload.currentPhase) setCurrentPhase(payload.currentPhase);

      const fresh = payload.events.filter((e) => {
        if (seenRef.current.has(e.id)) return false;
        seenRef.current.add(e.id);
        return true;
      });
      if (fresh.length === 0) return;

      setEvents((prev) => {
        /* Append new events and trim from the BOTTOM (oldest) so the
           viewer's eye stays on the freshest entries pinned at the top. */
        const merged = [...prev, ...fresh];
        return merged.slice(-MAX_EVENTS);
      });
    } catch {
      /* Swallow transient errors; the next tick retries. */
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void poll();
    const interval = setInterval(poll, POLLING_INTERVAL);
    return () => clearInterval(interval);
  }, [poll]);

  return (
    <div
      className="relative h-screen w-screen"
      style={{ background: "transparent" }}
      data-testid="dashboard-root"
    >
      {/* Right-edge dashboard panel: progress bar at the top + scrolling
          event timeline below. Anchored at (1525, 156) per the broadcast
          scene's reserved slot, sized 380×800. */}
      <div
        className="pointer-events-none fixed flex flex-col gap-3"
        style={{ left: 1525, top: 156, width: 380, height: 800 }}
      >
        <DashboardProgressBar currentPhase={currentPhase} />
        {/* min-h-0 lets the inner scroll container shrink to fit; without
            it flex children inflate to content height and overflow the box. */}
        <div className="min-h-0 flex-1">
          <DashboardTimeline events={events} now={now} />
        </div>
      </div>

      {/* Phase footer in the existing bottom-left strip. Width-bounded so
          the right portion (解説 / Discord) stays visible. */}
      <div
        className="pointer-events-none fixed"
        style={{ bottom: 0, left: 170, width: 1050, height: 82 }}
      >
        <DashboardFooter currentPhase={currentPhase} />
      </div>
    </div>
  );
}

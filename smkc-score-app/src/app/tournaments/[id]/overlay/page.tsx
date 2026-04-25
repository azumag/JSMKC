/**
 * OBS browser-source overlay page.
 *
 * Renders a transparent-background page that polls
 * /api/tournaments/[id]/overlay-events every 3s and shows a stack of toast
 * notifications for fresh events. Designed to be embedded as a Browser
 * Source in OBS Studio:
 *   URL    : https://<host>/tournaments/<id>/overlay
 *   Width  : 1920
 *   Height : 1080
 *   Custom CSS: body { background: transparent !important; }
 *
 * No authentication is required — the URL itself is the broadcast token.
 */

"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { OverlayToastStack } from "@/components/overlay/overlay-toast-stack";
import type { OverlayEvent, OverlayEventsResponse } from "@/lib/overlay/types";
import { POLLING_INTERVAL } from "@/lib/constants";

/** How long a toast stays fully opaque before starting its fade-out. */
const VISIBLE_DURATION_MS = 6_000;
/** Fade-out duration; matches the CSS transition on `OverlayToast`. */
const FADE_DURATION_MS = 300;
/** Cap the stack depth to keep the screen readable on a busy tournament. */
const MAX_VISIBLE = 5;

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
}

export default function OverlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [events, setEvents] = useState<OverlayEvent[]>([]);
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set());
  /* `since` advances each poll. We seed it with `null` and rely on the
     server's "last 30s" fallback for the very first request, then echo
     back `serverTime` from each response. Storing in a ref (not state)
     avoids re-running the polling effect on every update. */
  const sinceRef = useRef<string | null>(null);
  /* Track ids we've already shown so overlapping `since` windows don't
     flash the same toast twice. */
  const seenRef = useRef<Set<string>>(new Set());

  const dropEvent = useCallback((eventId: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    setLeaving((prev) => {
      if (!prev.has(eventId)) return prev;
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
  }, []);

  const queueDismiss = useCallback(
    (eventId: string) => {
      const startFade = setTimeout(() => {
        setLeaving((prev) => {
          const next = new Set(prev);
          next.add(eventId);
          return next;
        });
        const removeAfterFade = setTimeout(() => {
          dropEvent(eventId);
        }, FADE_DURATION_MS);
        // Best-effort cleanup: if the page unmounts mid-fade, clearing the
        // outer timer suppresses the inner one as well via closure GC.
        timers.current.add(removeAfterFade);
      }, VISIBLE_DURATION_MS);
      timers.current.add(startFade);
    },
    [dropEvent],
  );

  // Track outstanding setTimeout handles for unmount cleanup
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  /*
   * Mark <body> with `overlay-mode` so globals.css can strip the root
   * layout's solid `bg-background` wrapper, global header, and main-area
   * padding. Without this the overlay renders inside the standard chrome
   * and OBS sees a white/dark frame instead of a transparent canvas.
   * Cleanup runs on unmount so navigating away restores normal layout.
   */
  useEffect(() => {
    document.body.classList.add('overlay-mode');
    return () => {
      document.body.classList.remove('overlay-mode');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const url = new URL(
          `/api/tournaments/${encodeURIComponent(id)}/overlay-events`,
          window.location.origin,
        );
        if (sinceRef.current) url.searchParams.set("since", sinceRef.current);
        const res = await fetch(url.toString(), {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const json = (await res.json()) as ApiEnvelope<OverlayEventsResponse>;
        const payload = json.data ?? (json as unknown as OverlayEventsResponse);
        if (!payload || cancelled) return;

        sinceRef.current = payload.serverTime;
        const fresh = payload.events.filter((e) => {
          if (seenRef.current.has(e.id)) return false;
          seenRef.current.add(e.id);
          return true;
        });
        if (fresh.length === 0) return;

        setEvents((prev) => {
          /* Merge then cap from the bottom — older entries fall off first. */
          const merged = [...prev, ...fresh];
          return merged.slice(-MAX_VISIBLE);
        });
        for (const e of fresh) queueDismiss(e.id);
      } catch {
        // Swallow transient errors; the next tick retries.
      }
    };

    void poll();
    const interval = setInterval(poll, POLLING_INTERVAL);
    /* Capture the timer set into a local so React doesn't warn about
       stale ref access during cleanup. */
    const pendingTimers = timers.current;
    return () => {
      cancelled = true;
      clearInterval(interval);
      for (const t of pendingTimers) clearTimeout(t);
      pendingTimers.clear();
    };
  }, [id, queueDismiss]);

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "transparent" }}
      data-testid="overlay-root"
    >
      <OverlayToastStack events={events} leaving={leaving} />
    </div>
  );
}

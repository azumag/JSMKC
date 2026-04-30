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
  /* IDs of events that arrived in the latest poll — used for slide-in animation (#646).
     Cleared after 500ms so the animation CSS class is no longer needed. */
  const [newEventIds, setNewEventIds] = useState<ReadonlySet<string>>(new Set());
  const [currentPhase, setCurrentPhase] = useState<string>("");
  const [currentPhaseFormat, setCurrentPhaseFormat] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  /* Broadcast player names from "配信に反映" / 配信管理 page */
  const [overlayPlayer1Name, setOverlayPlayer1Name] = useState<string>("");
  const [overlayPlayer2Name, setOverlayPlayer2Name] = useState<string>("");
  const [overlayPlayer1NoCamera, setOverlayPlayer1NoCamera] = useState(false);
  const [overlayPlayer2NoCamera, setOverlayPlayer2NoCamera] = useState(false);
  /* Match info set by "配信に反映" for footer label and score display (#644/#645/#649) */
  const [overlayMatchLabel, setOverlayMatchLabel] = useState<string | null>(null);
  const [overlayPlayer1Wins, setOverlayPlayer1Wins] = useState<number | null>(null);
  const [overlayPlayer2Wins, setOverlayPlayer2Wins] = useState<number | null>(null);
  const [overlayMatchFt, setOverlayMatchFt] = useState<number | null>(null);

  /* `since` advances each poll. First call uses `?initial=1` (no since)
     to backfill recent history; subsequent calls echo back `serverTime`. */
  const sinceRef = useRef<string | null>(null);
  /* Dedupe overlapping `since` windows the same way the toast page does. */
  const seenRef = useRef<Set<string>>(new Set());
  /* Timer ref for the slide-in animation clearance — cleaned up on unmount
     so we never call setState after the component unmounts (#646). */
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      /* currentPhaseFormat may be null (no FT for this phase) — always update */
      if ("currentPhaseFormat" in payload) setCurrentPhaseFormat(payload.currentPhaseFormat ?? null);
      /* Broadcast names and match info — always update (may change between polls) */
      if (payload.overlayPlayer1Name !== undefined) setOverlayPlayer1Name(payload.overlayPlayer1Name);
      if (payload.overlayPlayer2Name !== undefined) setOverlayPlayer2Name(payload.overlayPlayer2Name);
      if ("overlayPlayer1NoCamera" in payload) setOverlayPlayer1NoCamera(payload.overlayPlayer1NoCamera === true);
      if ("overlayPlayer2NoCamera" in payload) setOverlayPlayer2NoCamera(payload.overlayPlayer2NoCamera === true);
      if ("overlayMatchLabel" in payload) setOverlayMatchLabel(payload.overlayMatchLabel ?? null);
      if ("overlayPlayer1Wins" in payload) setOverlayPlayer1Wins(payload.overlayPlayer1Wins ?? null);
      if ("overlayPlayer2Wins" in payload) setOverlayPlayer2Wins(payload.overlayPlayer2Wins ?? null);
      if ("overlayMatchFt" in payload) setOverlayMatchFt(payload.overlayMatchFt ?? null);

      const fresh = payload.events.filter((e) => {
        if (seenRef.current.has(e.id)) return false;
        seenRef.current.add(e.id);
        return true;
      });
      if (fresh.length === 0) return;

      /* Mark new events for the slide-in animation. Clear after 500ms
         (longer than the 400ms animation) so the class doesn't linger.
         Cancel any previous pending clear so rapid polls don't fight. */
      const freshIds = new Set(fresh.map((e) => e.id));
      setNewEventIds(freshIds);
      if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
      animationTimerRef.current = setTimeout(() => setNewEventIds(new Set()), 500);

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
    return () => {
      clearInterval(interval);
      /* Prevent setState-after-unmount from the slide-in animation timer. */
      if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    };
  }, [poll]);

  return (
    <div
      className="relative h-screen w-screen"
      style={{ background: "transparent" }}
      data-testid="dashboard-root"
    >
      {/* Right-edge dashboard panel: progress bar at the top + scrolling
          event timeline below. Anchored at (1525, 166) per the broadcast
          scene's reserved slot, sized 380×746. paddingRight pulls both
          children (progress bar and timeline) inward by 8px so neither hugs
          the broadcast frame's right edge. */}
      <div
        className="pointer-events-none fixed flex flex-col gap-3"
        style={{ left: 1525, top: 166, width: 380, height: 746, paddingRight: 8 }}
      >
        {/* pr-4 mirrors DashboardTimeline's internal pr-4 so the progress
            bar's right edge aligns with the timeline cards underneath. */}
        <div className="pr-4">
          <DashboardProgressBar currentPhase={currentPhase} />
        </div>
        {/* min-h-0 lets the inner scroll container shrink to fit; without
            it flex children inflate to content height and overflow the box. */}
        <div className="min-h-0 flex-1">
          <DashboardTimeline events={events} now={now} newEventIds={newEventIds} />
        </div>
      </div>

      {/* Phase footer in the existing bottom-left strip. Width-bounded so
          the right portion (解説 / Discord) stays visible. */}
      <div
        className="pointer-events-none fixed"
        style={{ bottom: 0, left: 170, width: 1050, height: 82 }}
      >
        <DashboardFooter
          currentPhase={currentPhase}
          currentPhaseFormat={overlayMatchFt !== null ? `FT${overlayMatchFt}` : currentPhaseFormat}
          overlayMatchLabel={overlayMatchLabel}
        />
      </div>

      {/* 1P name display: x:80, y:480, w:230px, h:48px (「配信に反映」設定値)
          Shows player name + current wins when match score is available (#645) */}
      {overlayPlayer1Name && (
        <div
          className="pointer-events-none fixed flex flex-col items-center justify-center"
          style={{ left: 80, top: 485, width: 230, height: 48, overflow: "hidden" }}
        >
          <span
            className="text-white font-bold text-[1.65rem] leading-none truncate w-full text-center"
            style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.8)" }}
          >
            {overlayPlayer1Name}
          </span>
          {overlayPlayer1Wins !== null && (
            <span
              className="text-yellow-300 font-bold text-xl leading-none tabular-nums"
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}
              data-testid="overlay-p1-score"
            >
              {overlayMatchFt !== null
                ? `${overlayPlayer1Wins} / ${overlayMatchFt}`
                : `${overlayPlayer1Wins}`}
            </span>
          )}
        </div>
      )}

      {overlayPlayer1NoCamera && (
        <img
          src="/overlay/no-camera.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none fixed"
          style={{ left: 24, top: 152, width: 356, height: 328 }}
        />
      )}

      {/* 2P name display: x:80, y:870, w:230px, h:48px (「配信に反映」設定値)
          Shows player name + current wins when match score is available (#645) */}
      {overlayPlayer2Name && (
        <div
          className="pointer-events-none fixed flex flex-col items-center justify-center"
          style={{ left: 80, top: 879, width: 230, height: 48, overflow: "hidden" }}
        >
          <span
            className="text-white font-bold text-[1.65rem] leading-none truncate w-full text-center"
            style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.8)" }}
          >
            {overlayPlayer2Name}
          </span>
          {overlayPlayer2Wins !== null && (
            <span
              className="text-yellow-300 font-bold text-xl leading-none tabular-nums"
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}
              data-testid="overlay-p2-score"
            >
              {overlayMatchFt !== null
                ? `${overlayPlayer2Wins} / ${overlayMatchFt}`
                : `${overlayPlayer2Wins}`}
            </span>
          )}
        </div>
      )}

      {overlayPlayer2NoCamera && (
        <img
          src="/overlay/no-camera.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none fixed"
          style={{ left: 24, top: 547, width: 356, height: 328 }}
        />
      )}
    </div>
  );
}

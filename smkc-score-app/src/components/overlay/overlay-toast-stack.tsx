/**
 * Renders the active stack of overlay toasts.
 *
 * The parent page is in charge of fetching events; this component just
 * displays the items it's given and animates entry/exit. Newest event
 * sits at the top of the stack so the broadcaster's eye is drawn to it
 * without being covered by older toasts.
 */

"use client";

import { OverlayToast } from "./overlay-toast";
import type { OverlayEvent } from "@/lib/overlay/types";

interface OverlayToastStackProps {
  /** Currently visible events, oldest first. */
  events: OverlayEvent[];
  /** Set of event ids that are mid-fade-out. */
  leaving: ReadonlySet<string>;
}

export function OverlayToastStack({ events, leaving }: OverlayToastStackProps) {
  return (
    <div
      className="pointer-events-none fixed bottom-6 right-6 flex flex-col-reverse gap-2"
      data-testid="overlay-toast-stack"
    >
      {events.map((event) => (
        <OverlayToast key={event.id} event={event} leaving={leaving.has(event.id)} />
      ))}
    </div>
  );
}

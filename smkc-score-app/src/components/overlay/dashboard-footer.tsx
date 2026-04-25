/**
 * Bottom-strip phase footer for the OBS dashboard browser source.
 *
 * Slot dimensions and screen position are owned by the parent page — this
 * component only paints text into the rectangle it's given. The right side
 * of the canvas is reserved for the broadcaster's 解説 / Discord overlay,
 * so the footer container is intentionally width-bounded by its parent
 * (no full-width assumptions baked in here).
 */

"use client";

interface DashboardFooterProps {
  /** Pre-computed Japanese phase label from the overlay-events API. */
  currentPhase: string;
}

export function DashboardFooter({ currentPhase }: DashboardFooterProps) {
  return (
    <div
      className="flex h-full w-full items-center px-6 text-blue-900"
      data-testid="dashboard-footer"
    >
      {/* Lift the label 30px above the strip's vertical center so it sits
          flush with the broadcast scene's text baseline (the underlying OBS
          chrome puts its title text higher than this footer's mid-line). */}
      <span className="-translate-y-[30px] text-5xl font-bold tracking-tight">
        {currentPhase}
      </span>
    </div>
  );
}

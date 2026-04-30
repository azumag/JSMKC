/**
 * Bottom-strip phase footer for the OBS dashboard browser source.
 *
 * Shows the current tournament phase label and, when available, the match format
 * badge (e.g., "First to 5"). When an admin has pressed "配信に反映" for a specific
 * match, `overlayMatchLabel` overrides the auto-computed `currentPhase` so the
 * footer reflects exactly what's on-air (issue #649). FT format is always shown
 * for Battle Mode / Match Race bracket finals (issue #644).
 *
 * Slot dimensions and screen position are owned by the parent page — this
 * component only paints text into the rectangle it's given. The right side
 * of the canvas is reserved for the broadcaster's 解説 / Discord overlay,
 * so the footer container is intentionally width-bounded by its parent.
 */

"use client";

interface DashboardFooterProps {
  /** Pre-computed phase label from the overlay-events API. */
  currentPhase: string;
  /** Match format string (e.g., "First to 5") — null/undefined when not applicable. */
  currentPhaseFormat?: string | null;
  /**
   * Round label set by the last "配信に反映" click
   * (e.g., "Battle Mode Finals Winners Quarter Final").
   * When non-empty, overrides `currentPhase` so the footer shows exactly
   * which match is on-air rather than the auto-computed phase.
   */
  overlayMatchLabel?: string | null;
}

export function DashboardFooter({
  currentPhase,
  currentPhaseFormat,
  overlayMatchLabel,
}: DashboardFooterProps) {
  /* Prefer the admin-set label from "配信に反映" when available. */
  const label = overlayMatchLabel || currentPhase;

  return (
    <div
      className="flex h-full w-full items-center gap-3 px-6 text-blue-900"
      data-testid="dashboard-footer"
    >
      {/* Lift the label 30px above the strip's vertical center so it sits
          flush with the broadcast scene's text baseline. */}
      <span className="-translate-y-[30px] text-5xl font-bold tracking-tight">
        {label}
      </span>
      {currentPhaseFormat && (
        /* Match-format badge — same vertical offset as the phase label so they
           form a single visual unit on the broadcast canvas. */
        <span
          className="-translate-y-[30px] rounded-md bg-blue-900 px-3 py-1 text-2xl font-bold tracking-tight text-white"
          data-testid="dashboard-footer-ft"
        >
          {currentPhaseFormat}
        </span>
      )}
    </div>
  );
}

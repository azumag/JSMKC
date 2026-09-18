/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { DashboardTimeline } from "@/components/overlay/dashboard-timeline";
import type { OverlayEvent } from "@/lib/overlay/types";

const NOW = Date.parse("2026-04-25T10:00:01.000Z");

function densePhase3Event(): OverlayEvent {
  return {
    id: "ta_phase_advanced:dense-active",
    type: "ta_phase_advanced",
    timestamp: "2026-04-25T10:00:00.000Z",
    mode: "ta",
    title: "Time Attack Phase 3 Round 1 Started",
    subtitle: "Course: Koopa Beach 1",
    taPhaseRound: {
      phase: "phase3",
      phaseLabel: "Phase 3",
      roundNumber: 1,
      course: "KB1",
      courseName: "Koopa Beach 1",
      participants: Array.from({ length: 13 }, (_, index) => ({
        player: `Player ${index + 1}`,
        lives: 3,
        rank: index + 1,
      })),
    },
  };
}

describe("DashboardTimeline dense TA participant accessibility", () => {
  it("exposes each compact Active dot as a named image without restoring visible Active text", () => {
    render(<DashboardTimeline events={[densePhase3Event()]} now={NOW} />);

    expect(screen.getAllByRole("img", { name: "Active" })).toHaveLength(13);

    const participants = screen.getByTestId("dashboard-timeline-ta-phase-participants");
    expect(participants).toHaveClass("grid-cols-2");
    expect(participants).not.toHaveTextContent("Active");
  });
});

/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { OverlayToast } from "@/components/overlay/overlay-toast";
import type { OverlayEvent } from "@/lib/overlay/types";

function matchEvent(overrides: Partial<OverlayEvent> = {}): OverlayEvent {
  return {
    id: "match_completed:bm:m1:1",
    type: "match_completed",
    timestamp: "2026-04-25T10:00:00.000Z",
    mode: "bm",
    title: "Battle Mode Qualification Match #1 Completed",
    subtitle: "Alice 4-0 Bob",
    matchResult: {
      player1: "Alice Longname",
      player2: "Bob Longname",
      score1: 4,
      score2: 0,
      courses: ["MC1", "DP1"],
    },
    ...overrides,
  };
}

describe("OverlayToast match completed", () => {
  it("renders BM/MR/GP qualification names as large structured text", () => {
    render(<OverlayToast event={matchEvent()} leaving={false} />);

    const toast = screen.getByTestId("overlay-toast");
    expect(toast).toHaveClass("w-[40rem]");
    const match = screen.getByTestId("overlay-toast-match-completed");
    expect(match).toHaveTextContent("Alice Longname");
    expect(match).toHaveTextContent("4-0");
    expect(match).toHaveTextContent("Bob Longname");
    expect(match).toHaveTextContent("MC1");
    expect(match).toHaveTextContent("DP1");
  });
});

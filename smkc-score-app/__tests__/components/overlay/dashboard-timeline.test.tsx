/**
 * @jest-environment jsdom
 */

/**
 * Tests for DashboardTimeline rendering of match scoreboard cards.
 *
 * The match scoreboard card must surface the course list (BM/MR) and cup
 * label (GP) so the broadcast viewer can identify *which* courses/cup the
 * result came from. These tests cover only the card rendering — the source
 * fields on `OverlayEvent.matchResult` are populated by the aggregator
 * (covered in __tests__/lib/overlay/events.test.ts).
 */

import { render, screen } from "@testing-library/react";
import { DashboardTimeline } from "@/components/overlay/dashboard-timeline";
import type { OverlayEvent } from "@/lib/overlay/types";

function matchEvent(overrides: Partial<OverlayEvent> = {}): OverlayEvent {
  return {
    id: "match_completed:bm:m1:1",
    type: "match_completed",
    timestamp: "2026-04-25T10:00:00.000Z",
    mode: "bm",
    title: "BM 予選 試合 #1 終了",
    subtitle: "Alice 4-0 Bob",
    matchResult: {
      player1: "Alice",
      player2: "Bob",
      score1: 4,
      score2: 0,
    },
    ...overrides,
  };
}

const NOW = Date.parse("2026-04-25T10:00:01.000Z");

describe("DashboardTimeline match scoreboard card", () => {
  it("renders BM/MR course chips when matchResult.courses is set", () => {
    const event = matchEvent({
      matchResult: {
        player1: "Alice",
        player2: "Bob",
        score1: 4,
        score2: 0,
        courses: ["MC1", "DP1", "GV1", "BC1"],
      },
    });
    render(<DashboardTimeline events={[event]} now={NOW} />);
    const card = screen.getByTestId("dashboard-timeline-scoreboard");
    for (const c of ["MC1", "DP1", "GV1", "BC1"]) {
      expect(card).toHaveTextContent(c);
    }
  });

  it("renders GP cup label when matchResult.cup is set", () => {
    const event = matchEvent({
      id: "match_completed:gp:m1:1",
      mode: "gp",
      title: "GP 予選 試合 #1 終了",
      subtitle: "Alice 45-0 Bob",
      matchResult: {
        player1: "Alice",
        player2: "Bob",
        score1: 45,
        score2: 0,
        cup: "Mushroom",
      },
    });
    render(<DashboardTimeline events={[event]} now={NOW} />);
    const card = screen.getByTestId("dashboard-timeline-scoreboard");
    expect(card).toHaveTextContent("Mushroom");
  });

  it("does not render a course/cup row when both are absent", () => {
    const event = matchEvent();
    render(<DashboardTimeline events={[event]} now={NOW} />);
    const card = screen.getByTestId("dashboard-timeline-scoreboard");
    // No SMK course abbreviations and no cup name should appear in the card.
    expect(card.textContent).not.toMatch(/MC\d|DP\d|GV\d|BC\d|CI\d|KB\d|VL\d|RR\b/);
    expect(card.textContent).not.toMatch(/Mushroom|Flower|Star|Special/);
  });
});

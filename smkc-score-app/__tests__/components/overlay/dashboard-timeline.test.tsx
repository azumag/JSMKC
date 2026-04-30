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
    title: "Battle Mode Qualification Match #1 Completed",
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

function taEvent(overrides: Partial<OverlayEvent> = {}): OverlayEvent {
  return {
    id: "ta_time_recorded:qualification:tt1:90000",
    type: "ta_time_recorded",
    timestamp: "2026-04-25T10:00:00.000Z",
    mode: "ta",
    title: "Time Attack Qualification Complete",
    taTimeRecord: {
      player: "Eve",
      phaseLabel: "Qualification",
      rank: 3,
      totalTimeMs: 90_000,
      totalTimeFormatted: "1:30.00",
    },
    ...overrides,
  };
}

function taPhaseRoundEvent(overrides: Partial<OverlayEvent> = {}): OverlayEvent {
  return {
    id: "ta_phase_advanced:r1",
    type: "ta_phase_advanced",
    timestamp: "2026-04-25T10:00:00.000Z",
    mode: "ta",
    title: "Time Attack Phase 3 Round 3 Started",
    subtitle: "Course: Koopa Beach 1",
    taPhaseRound: {
      phase: "phase3",
      phaseLabel: "Phase 3",
      roundNumber: 3,
      course: "KB1",
      courseName: "Koopa Beach 1",
      participants: [
        { player: "Alice", lives: 3, rank: 1 },
        { player: "Bob", lives: 1, rank: 2 },
      ],
    },
    ...overrides,
  };
}

function taPhaseCompletedEvent(overrides: Partial<OverlayEvent> = {}): OverlayEvent {
  return {
    id: "ta_phase_completed:r1:1",
    type: "ta_phase_completed",
    timestamp: "2026-04-25T10:00:00.000Z",
    mode: "ta",
    title: "Time Attack Phase 1 Round 1 Completed",
    subtitle: "Eliminated: Bob",
    taPhaseCompleted: {
      phase: "phase1",
      phaseLabel: "Phase 1",
      roundNumber: 1,
      course: "KB1",
      courseName: "Koopa Beach 1",
      results: [
        { player: "Alice", timeFormatted: "1:14.56", isRetry: false, eliminated: false },
        { player: "Bob", timeFormatted: "1:22.34", isRetry: true, eliminated: true },
      ],
      eliminatedPlayers: ["Bob"],
      livesReset: false,
    },
    ...overrides,
  };
}

function taLivesResetEvent(overrides: Partial<OverlayEvent> = {}): OverlayEvent {
  return {
    id: "ta_lives_reset:r1:1",
    type: "ta_lives_reset",
    timestamp: "2026-04-25T10:00:00.001Z",
    mode: "ta",
    title: "Time Attack Lives Reset",
    subtitle: "Phase 3 Round 7: 8 players remain",
    ...overrides,
  };
}

function taChampionEvent(overrides: Partial<OverlayEvent> = {}): OverlayEvent {
  return {
    id: "ta_champion_decided:r1:1",
    type: "ta_champion_decided",
    timestamp: "2026-04-25T10:00:00.002Z",
    mode: "ta",
    title: "Time Attack Champion Decided",
    subtitle: "Champion: Alice",
    taChampion: {
      roundNumber: 12,
      standings: [
        { rank: 1, player: "Alice" },
        { rank: 2, player: "Bob" },
        { rank: 3, player: "Carol" },
      ],
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

  it("renders BM/MR/GP qualification player names larger in the scoreboard", () => {
    render(<DashboardTimeline events={[matchEvent()]} now={NOW} />);

    const players = screen.getAllByTestId("dashboard-timeline-scoreboard-player");
    expect(players).toHaveLength(2);
    for (const player of players) {
      expect(player).toHaveClass("text-2xl");
      expect(player).toHaveClass("line-clamp-2");
      expect(player).not.toHaveClass("truncate");
    }
  });

  it("renders GP cup label when matchResult.cup is set", () => {
    const event = matchEvent({
      id: "match_completed:gp:m1:1",
      mode: "gp",
      title: "Grand Prix Qualification Match #1 Completed",
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

describe("DashboardTimeline TA time card", () => {
  it("renders qualification player name wide and moves rank beside the total time", () => {
    render(<DashboardTimeline events={[taEvent()]} now={NOW} />);

    expect(screen.getByTestId("dashboard-timeline-ta-player")).toHaveClass("text-3xl");
    expect(screen.getByTestId("dashboard-timeline-ta-player")).toHaveClass("line-clamp-2");
    expect(screen.getByTestId("dashboard-timeline-ta-player")).not.toHaveClass("truncate");
    expect(screen.getByTestId("dashboard-timeline-ta-rank")).toHaveClass("text-2xl");
    expect(screen.queryByText("Total Time")).not.toBeInTheDocument();
    expect(screen.getByTestId("dashboard-timeline-ta-total")).toHaveClass("text-3xl");
    expect(screen.getByTestId("dashboard-timeline-ta-rank").parentElement).toBe(
      screen.getByTestId("dashboard-timeline-ta-total").parentElement?.parentElement,
    );
  });

  it("keeps phase-round player name and rank compact", () => {
    render(
      <DashboardTimeline
        events={[
          taEvent({
            id: "ta_time_recorded:tt-phase1:1",
            title: "Time Attack Time Updated",
            taTimeRecord: {
              player: "Frank",
              course: "MC1",
              time: "1:23.45",
              phaseLabel: "Phase 1",
              rank: 2,
            },
          }),
        ]}
        now={NOW}
      />,
    );

    expect(screen.getByTestId("dashboard-timeline-ta-player")).toHaveClass("text-base");
    expect(screen.getByTestId("dashboard-timeline-ta-player")).toHaveClass("truncate");
    expect(screen.getByTestId("dashboard-timeline-ta-rank")).toHaveClass("text-sm");
  });
});

describe("DashboardTimeline TA phase round card", () => {
  it("renders the selected course and phase3 active participants with lives", () => {
    render(<DashboardTimeline events={[taPhaseRoundEvent()]} now={NOW} />);

    expect(screen.getByTestId("dashboard-timeline-ta-phase-round")).toHaveTextContent(
      "Phase 3 Round 3",
    );
    expect(screen.getByTestId("dashboard-timeline-ta-phase-course")).toHaveTextContent(
      "Koopa Beach 1",
    );

    const participants = screen.getByTestId("dashboard-timeline-ta-phase-participants");
    expect(participants).toHaveTextContent("Active");
    expect(participants).toHaveTextContent("Alice");
    expect(participants).toHaveTextContent("Life 3");
    expect(participants).toHaveTextContent("Bob");
    expect(participants).toHaveTextContent("Life 1");
  });

  it("omits lives before phase3", () => {
    render(
      <DashboardTimeline
        events={[
          taPhaseRoundEvent({
            title: "Time Attack Phase 1 Round 1 Started",
            taPhaseRound: {
              phase: "phase1",
              phaseLabel: "Phase 1",
              roundNumber: 1,
              course: "KB1",
              courseName: "Koopa Beach 1",
              participants: [
                { player: "Alice", lives: 3, rank: 1 },
                { player: "Bob", lives: 3, rank: 2 },
              ],
            },
          }),
        ]}
        now={NOW}
      />,
    );

    const participants = screen.getByTestId("dashboard-timeline-ta-phase-participants");
    expect(participants).toHaveTextContent("Alice");
    expect(participants).toHaveTextContent("Bob");
    expect(participants).not.toHaveTextContent("Life");
  });

  it("uses a compact two-column participant list while phase3 has more than 12 active players", () => {
    render(
      <DashboardTimeline
        events={[
          taPhaseRoundEvent({
            taPhaseRound: {
              phase: "phase3",
              phaseLabel: "Phase 3",
              roundNumber: 1,
              course: "KB1",
              courseName: "Koopa Beach 1",
              participants: Array.from({ length: 13 }, (_, i) => ({
                player: `Player ${i + 1}`,
                lives: 3,
                rank: i + 1,
              })),
            },
          }),
        ]}
        now={NOW}
      />,
    );

    const participants = screen.getByTestId("dashboard-timeline-ta-phase-participants");
    expect(participants).toHaveClass("grid-cols-2");
    expect(participants).toHaveTextContent("Player 13");
    expect(participants).toHaveTextContent("Life 3");
    expect(participants).not.toHaveTextContent("Active");
  });

  it("keeps phase3 participant list in one column once 12 or fewer players remain", () => {
    render(
      <DashboardTimeline
        events={[
          taPhaseRoundEvent({
            taPhaseRound: {
              phase: "phase3",
              phaseLabel: "Phase 3",
              roundNumber: 1,
              course: "KB1",
              courseName: "Koopa Beach 1",
              participants: Array.from({ length: 12 }, (_, i) => ({
                player: `Player ${i + 1}`,
                lives: 2,
                rank: i + 1,
              })),
            },
          }),
        ]}
        now={NOW}
      />,
    );

    const participants = screen.getByTestId("dashboard-timeline-ta-phase-participants");
    expect(participants).toHaveClass("grid-cols-1");
    expect(participants).toHaveTextContent("Active");
  });
});

describe("DashboardTimeline TA phase completed card", () => {
  it("renders player times and eliminated players", () => {
    render(<DashboardTimeline events={[taPhaseCompletedEvent()]} now={NOW} />);

    const card = screen.getByTestId("dashboard-timeline-ta-phase-completed");
    expect(card).toHaveTextContent("Phase 1 Round 1");
    expect(card).toHaveTextContent("Koopa Beach 1");
    expect(screen.getByTestId("dashboard-timeline-ta-phase-eliminated")).toHaveTextContent(
      "Eliminated Bob",
    );

    const results = screen.getByTestId("dashboard-timeline-ta-phase-results");
    expect(results).toHaveTextContent("Alice");
    expect(results).toHaveTextContent("1:14.56");
    expect(results).toHaveTextContent("Bob / Eliminated");
    expect(results).toHaveTextContent("1:22.34 Retry");
  });

  it("uses a compact two-column result list while phase3 has more than 12 players", () => {
    render(
      <DashboardTimeline
        events={[
          taPhaseCompletedEvent({
            taPhaseCompleted: {
              phase: "phase3",
              phaseLabel: "Phase 3",
              roundNumber: 4,
              course: "KB1",
              courseName: "Koopa Beach 1",
              results: Array.from({ length: 13 }, (_, i) => ({
                player: `Player ${i + 1}`,
                timeFormatted: `1:${String(10 + i).padStart(2, "0")}.00`,
                isRetry: false,
                eliminated: i === 12,
              })),
              eliminatedPlayers: ["Player 13"],
              livesReset: false,
            },
          }),
        ]}
        now={NOW}
      />,
    );

    const results = screen.getByTestId("dashboard-timeline-ta-phase-results");
    expect(results).toHaveClass("grid-cols-2");
    expect(results).toHaveTextContent("Player 13 / Eliminated");
    expect(results).toHaveTextContent("1:22.00");
  });

  it("keeps phase3 result list in one column once 12 or fewer players remain", () => {
    render(
      <DashboardTimeline
        events={[
          taPhaseCompletedEvent({
            taPhaseCompleted: {
              phase: "phase3",
              phaseLabel: "Phase 3",
              roundNumber: 5,
              course: "KB1",
              courseName: "Koopa Beach 1",
              results: Array.from({ length: 12 }, (_, i) => ({
                player: `Player ${i + 1}`,
                timeFormatted: `1:${String(10 + i).padStart(2, "0")}.00`,
                isRetry: false,
                eliminated: false,
              })),
              eliminatedPlayers: [],
              livesReset: false,
            },
          }),
        ]}
        now={NOW}
      />,
    );

    expect(screen.getByTestId("dashboard-timeline-ta-phase-results")).toHaveClass(
      "grid-cols-1",
    );
  });
});

describe("DashboardTimeline TA lives reset card", () => {
  it("renders a prominent lives reset notification", () => {
    render(<DashboardTimeline events={[taLivesResetEvent()]} now={NOW} />);

    const card = screen.getByTestId("dashboard-timeline-ta-lives-reset");
    expect(card).toHaveTextContent("Time Attack Lives Reset");
    expect(card).toHaveTextContent("Phase 3 Round 7: 8 players remain");
    expect(card).toHaveTextContent("All remaining players return to Life 3");
  });
});

describe("DashboardTimeline TA champion card", () => {
  it("renders a prominent top-three podium", () => {
    render(<DashboardTimeline events={[taChampionEvent()]} now={NOW} />);

    const card = screen.getByTestId("dashboard-timeline-ta-champion");
    expect(card).toHaveTextContent("Time Attack Champion");
    expect(card).toHaveTextContent("Alice");
    expect(card).toHaveTextContent("2nd");
    expect(card).toHaveTextContent("Bob");
    expect(card).toHaveTextContent("3rd");
    expect(card).toHaveTextContent("Carol");
  });
});

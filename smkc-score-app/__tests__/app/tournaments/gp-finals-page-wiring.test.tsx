/**
 * @jest-environment jsdom
 */

import { render, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import GrandPrixFinals from "@/app/tournaments/[id]/gp/finals/page";

const mockDoubleBracketProps: Record<string, unknown>[] = [];
const mockPlayoffBracketProps: Record<string, unknown>[] = [];

const legacyWinnerMatch = {
  id: "m1",
  matchNumber: 1,
  round: "grand_final",
  stage: "finals",
  player1Id: "p1",
  player2Id: "p2",
  points1: 2,
  points2: 2,
  score1: 2,
  score2: 2,
  completed: true,
  cup: "Mushroom",
  assignedCups: ["Mushroom", "Flower", "Star"],
  tvNumber: null,
  player1: { id: "p1", name: "Player 1", nickname: "Player 1" },
  player2: { id: "p2", name: "Player 2", nickname: "Player 2" },
  suddenDeathWinnerId: "p2",
};

let mockPollData = {
  matches: [legacyWinnerMatch],
  playoffMatches: [],
  bracketStructure: [
    { matchNumber: 1, round: "grand_final", bracket: "grand_final" },
  ],
  playoffStructure: [],
  roundNames: { grand_final: "Grand Final" },
  qualificationConfirmed: true,
  phase: "finals",
  seededPlayers: [],
  playoffSeededPlayers: [],
  playoffComplete: false,
};

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role: "admin" } } }),
}));

jest.mock("react", () => {
  const actual = jest.requireActual("react");
  return {
    ...actual,
    use: () => ({ id: "t1" }),
  };
});

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    warning: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock("@/lib/hooks/usePolling", () => ({
  usePolling: () => ({
    data: mockPollData,
    isLoading: false,
    lastUpdated: new Date("2026-01-01T00:00:00.000Z"),
    isPolling: false,
    refetch: jest.fn(),
  }),
}));

jest.mock("@/components/tournament/double-elimination-bracket", () => ({
  DoubleEliminationBracket: (props: Record<string, unknown>) => {
    mockDoubleBracketProps.push(props);
    return <div data-testid="mock-double-elimination-bracket" />;
  },
}));

jest.mock("@/components/tournament/playoff-bracket", () => ({
  PlayoffBracket: (props: Record<string, unknown>) => {
    mockPlayoffBracketProps.push(props);
    return <div data-testid="mock-playoff-bracket" />;
  },
}));

describe("GrandPrixFinals TC-830 legacy winner wiring", () => {
  beforeEach(() => {
    mockDoubleBracketProps.length = 0;
    mockPlayoffBracketProps.length = 0;
    mockPollData = {
      matches: [legacyWinnerMatch],
      playoffMatches: [],
      bracketStructure: [
        { matchNumber: 1, round: "grand_final", bracket: "grand_final" },
      ],
      playoffStructure: [],
      roundNames: { grand_final: "Grand Final" },
      qualificationConfirmed: true,
      phase: "finals",
      seededPlayers: [],
      playoffSeededPlayers: [],
      playoffComplete: false,
    };
  });

  it("passes the GP legacy winner resolver into the finals bracket", async () => {
    const params = Promise.resolve({ id: "t1" });

    render(
      <Suspense fallback={null}>
        <GrandPrixFinals params={params} />
      </Suspense>,
    );

    await waitFor(() => {
      expect(mockDoubleBracketProps.length).toBeGreaterThan(0);
    });

    const props = mockDoubleBracketProps.at(-1)!;
    const getWinnerId = props.getWinnerId as (match: typeof legacyWinnerMatch) => string | null;
    const matches = props.matches as typeof legacyWinnerMatch[];

    expect(getWinnerId).toBeDefined();
    expect(matches[0].score1).toBe(2);
    expect(matches[0].score2).toBe(2);
    expect(getWinnerId(matches[0])).toBe("p2");
  });

  it("passes the GP legacy winner resolver into the playoff bracket", async () => {
    const playoffMatch = {
      ...legacyWinnerMatch,
      stage: "playoff",
      round: "playoff_r1",
    };
    mockPollData = {
      matches: [],
      playoffMatches: [playoffMatch],
      bracketStructure: [],
      playoffStructure: [
        { matchNumber: 1, round: "playoff_r1", bracket: "winners" },
      ],
      roundNames: { playoff_r1: "Playoff Round 1" },
      qualificationConfirmed: true,
      phase: "playoff",
      seededPlayers: [],
      playoffSeededPlayers: [],
      playoffComplete: false,
    };
    const params = Promise.resolve({ id: "t1" });

    render(
      <Suspense fallback={null}>
        <GrandPrixFinals params={params} />
      </Suspense>,
    );

    await waitFor(() => {
      expect(mockPlayoffBracketProps.length).toBeGreaterThan(0);
    });

    const props = mockPlayoffBracketProps.at(-1)!;
    const getWinnerId = props.getWinnerId as (match: typeof playoffMatch) => string | null;
    const playoffMatches = props.playoffMatches as typeof playoffMatch[];

    expect(getWinnerId).toBeDefined();
    expect(playoffMatches[0].score1).toBe(2);
    expect(playoffMatches[0].score2).toBe(2);
    expect(getWinnerId(playoffMatches[0])).toBe("p2");
  });
});

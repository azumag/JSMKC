/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { PlayoffBracket } from "@/components/tournament/playoff-bracket";

const seededPlayers = [
  { seed: 1, playerId: "p1", player: { id: "p1", name: "Alice A", nickname: "Alice" }, qualificationRankLabel: "A9" },
  { seed: 2, playerId: "p2", player: { id: "p2", name: "Bob B", nickname: "Bob" }, qualificationRankLabel: "B12" },
  { seed: 5, playerId: "p5", player: { id: "p5", name: "Carol C", nickname: "Carol" }, qualificationRankLabel: "B8" },
];

const playoffStructure = [
  { matchNumber: 1, round: "playoff_r1", bracket: "winners" as const, player1Seed: 1, player2Seed: 2 },
  { matchNumber: 5, round: "playoff_r2", bracket: "winners" as const, player1Seed: 5, player2Seed: 1, advancesToUpperSeed: 16 },
];

describe("PlayoffBracket qualification rank labels", () => {
  it("prefers group-rank labels over raw seed numbers", () => {
    render(
      <PlayoffBracket
        playoffMatches={[]}
        playoffStructure={playoffStructure}
        roundNames={{ playoff_r1: "Round 1", playoff_r2: "Round 2" }}
        seededPlayers={seededPlayers}
      />,
    );

    const round1Match = screen.getByRole("button", {
      name: /Match 1: Alice vs Bob/,
    });
    expect(round1Match.textContent).toContain("[A9]");
    expect(round1Match.textContent).toContain("[B12]");
    expect(round1Match.textContent).not.toContain("[1]");
    expect(round1Match.textContent).not.toContain("[2]");

    const round2Match = screen.getByRole("button", {
      name: /Match 5: Carol vs Alice/,
    });
    expect(round2Match.textContent).toContain("[B8]");
    expect(round2Match.textContent).toContain("[A9]");
    expect(round2Match.textContent).not.toContain("[5]");
  });

  it("falls back to raw seed numbers when group-rank labels are absent", () => {
    render(
      <PlayoffBracket
        playoffMatches={[]}
        playoffStructure={[playoffStructure[0]]}
        roundNames={{ playoff_r1: "Round 1", playoff_r2: "Round 2" }}
        seededPlayers={seededPlayers.map(({ qualificationRankLabel: _qualificationRankLabel, ...entry }) => entry)}
      />,
    );

    const round1Match = screen.getByRole("button", {
      name: /Match 1: Alice vs Bob/,
    });

    expect(round1Match.textContent).toContain("[1]");
    expect(round1Match.textContent).toContain("[2]");
    expect(round1Match.textContent).not.toContain("[A9]");
    expect(round1Match.textContent).not.toContain("[B12]");
  });
});

describe("PlayoffBracket winner resolver", () => {
  const player1 = { id: "p1", name: "Alice A", nickname: "Alice" };
  const player2 = { id: "p2", name: "Bob B", nickname: "Bob" };

  it("uses getWinnerId for completed tied matches instead of score ordering only", () => {
    render(
      <PlayoffBracket
        playoffMatches={[{
          id: "m1",
          matchNumber: 1,
          round: "playoff_r1",
          stage: "playoff",
          player1Id: player1.id,
          player2Id: player2.id,
          score1: 1,
          score2: 1,
          completed: true,
          player1,
          player2,
        }]}
        playoffStructure={[playoffStructure[0]]}
        roundNames={{ playoff_r1: "Round 1" }}
        getWinnerId={() => player2.id}
      />,
    );

    expect(screen.getByText("Bob").closest("div")?.className).toContain("bg-primary/10");
    expect(screen.getByText("Alice").closest("div")?.className).not.toContain("bg-primary/10");
  });
});

describe("PlayoffBracket country flags", () => {
  it("renders a flag for a determined player and none for a TBD slot", () => {
    const alice = { id: "p1", name: "Alice A", nickname: "Alice", country: "JP" };
    const { container } = render(
      <PlayoffBracket
        // player2Seed: null + player1Id === player2Id (not completed) makes
        // slot 2 TBD while slot 1 (Alice) is determined.
        playoffMatches={[{
          id: "m1",
          matchNumber: 1,
          round: "playoff_r1",
          stage: "playoff",
          player1Id: alice.id,
          player2Id: alice.id,
          score1: 0,
          score2: 0,
          completed: false,
          player1: alice,
          player2: alice,
        }]}
        // player2Seed omitted (undefined) + player1Id === player2Id (not
        // completed) makes slot 2 TBD while slot 1 (Alice) is determined.
        playoffStructure={[
          { matchNumber: 1, round: "playoff_r1", bracket: "winners", player1Seed: 1 },
        ]}
        roundNames={{ playoff_r1: "Round 1" }}
      />,
    );

    // Exactly one flag image: Alice's. The TBD slot must not render a flag,
    // and the gate must not suppress the determined player's flag.
    const flags = container.querySelectorAll('img[src^="/flags/"]');
    expect(flags).toHaveLength(1);
    expect(flags[0]).toHaveAttribute("src", "/flags/jp.svg");
    expect(flags[0]).toHaveAttribute("title", "Japan");
  });
});

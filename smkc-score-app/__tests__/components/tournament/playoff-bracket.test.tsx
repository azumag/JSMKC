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
        seededPlayers={seededPlayers.map(({ qualificationRankLabel, ...entry }) => entry)}
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

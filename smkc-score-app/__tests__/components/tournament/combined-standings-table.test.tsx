/**
 * @jest-environment jsdom
 */

import { render, screen, within } from "@testing-library/react";
import { CombinedStandingsTable } from "@/components/tournament/combined-standings-table";

describe("CombinedStandingsTable", () => {
  const labels = {
    title: "Combined standings",
    playersCount: "2 players",
    rank: "#",
    group: "Group",
    player: "Player",
    mp: "MP",
    wins: "W",
    ties: "T",
    losses: "L",
    plusMinus: "+/-",
    points: "Pts",
    qualificationPoints: "QP",
  };

  it("renders shared BM/MR combined standings rows", () => {
    render(
      <CombinedStandingsTable
        labels={labels}
        rankings={[
          {
            id: "q1",
            _autoRank: 1,
            group: "A",
            player: { nickname: "Mario" },
            mp: 3,
            wins: 2,
            ties: 1,
            losses: 0,
            points: 5,
            score: 5,
          },
          {
            id: "q2",
            _autoRank: 2,
            group: "B",
            player: { nickname: "Luigi" },
            mp: 3,
            wins: 1,
            ties: 0,
            losses: 2,
            points: -3,
            score: 2,
          },
        ]}
        getGroupLabel={(group) => `Group ${group}`}
        getQualificationPoints={(entry) => entry.score * 10}
      />,
    );

    expect(screen.getByText("Combined standings")).toBeInTheDocument();
    expect(screen.getByText("2 players")).toBeInTheDocument();

    const marioRow = screen.getByText("Mario").closest("tr");
    expect(marioRow).not.toBeNull();
    expect(within(marioRow!).getAllByText("1")).toHaveLength(2);
    expect(within(marioRow!).getByText("Group A")).toBeInTheDocument();
    expect(within(marioRow!).getByText("+5")).toBeInTheDocument();
    expect(within(marioRow!).getByText("50")).toBeInTheDocument();

    const luigiRow = screen.getByText("Luigi").closest("tr");
    expect(luigiRow).not.toBeNull();
    expect(within(luigiRow!).getByText("Group B")).toBeInTheDocument();
    expect(within(luigiRow!).getByText("-3")).toBeInTheDocument();
    expect(within(luigiRow!).getByText("20")).toBeInTheDocument();
  });
});

/**
 * @jest-environment jsdom
 */

import { render, screen, within } from "@testing-library/react";
import {
  CombinedStandingsTable,
  type CombinedStandingsTableLabels,
} from "@/components/tournament/combined-standings-table";

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
    qualificationPointsTooltip: "Qualification points (0-1000 normalized)",
  } satisfies CombinedStandingsTableLabels;

  function cellsByHeader(row: HTMLTableRowElement) {
    const table = row.closest("table");
    expect(table).not.toBeNull();

    const headers = within(table!).getAllByRole("columnheader").map((header) => {
      const text = header.textContent?.trim();
      expect(text).toBeTruthy();
      return text!;
    });
    const cells = within(row).getAllByRole("cell");
    expect(cells).toHaveLength(headers.length);

    return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  }

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
    const marioCells = cellsByHeader(marioRow!);
    expect(marioCells["#"]).toHaveTextContent("1");
    expect(marioCells["W"]).toHaveTextContent("2");
    expect(marioCells["T"]).toHaveTextContent("1");
    expect(marioCells.Group).toHaveTextContent("Group A");
    expect(marioCells["+/-"]).toHaveTextContent("+5");
    expect(marioCells.QP).toHaveTextContent("50");
    expect(screen.getByRole("columnheader", { name: "QP" })).toHaveAttribute(
      "title",
      "Qualification points (0-1000 normalized)",
    );

    const luigiRow = screen.getByText("Luigi").closest("tr");
    expect(luigiRow).not.toBeNull();
    const luigiCells = cellsByHeader(luigiRow!);
    expect(luigiCells.Group).toHaveTextContent("Group B");
    expect(luigiCells["+/-"]).toHaveTextContent("-3");
    expect(luigiCells.QP).toHaveTextContent("20");
  });

  it("renders zero points without a plus sign", () => {
    render(
      <CombinedStandingsTable
        labels={labels}
        rankings={[
          {
            id: "q-zero",
            _autoRank: 1,
            group: "A",
            player: { nickname: "Peach" },
            mp: 0,
            wins: 0,
            ties: 0,
            losses: 0,
            points: 0,
            score: 0,
          },
        ]}
        getGroupLabel={(group) => `Group ${group}`}
        getQualificationPoints={(entry) => entry.score}
      />,
    );

    const peachRow = screen.getByText("Peach").closest("tr");
    expect(peachRow).not.toBeNull();
    expect(within(peachRow!).queryByText("+0")).not.toBeInTheDocument();
    const peachCells = cellsByHeader(peachRow!);
    expect(peachCells["+/-"]).toHaveTextContent("0");
    expect(peachCells.Pts).toHaveTextContent("0");
    expect(peachCells.QP).toHaveTextContent("0");
  });

  it("renders no data rows when rankings is empty", () => {
    const { container } = render(
      <CombinedStandingsTable
        labels={{ ...labels, playersCount: "0 players" }}
        rankings={[]}
        getGroupLabel={(group) => `Group ${group}`}
        getQualificationPoints={(entry) => entry.score}
      />,
    );

    expect(screen.getByText("Combined standings")).toBeInTheDocument();
    expect(screen.getByText("0 players")).toBeInTheDocument();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
  });
});

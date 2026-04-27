/**
 * @jest-environment jsdom
 */

/**
 * Tests for the DoubleEliminationBracket layout wrapper.
 *
 * Covers issue #424: when the bracket gets wide horizontally (16-player
 * bracket, 5+ round columns), the content used to overflow its containing
 * pane on desktop because the row wrapper had `md:overflow-visible` applied,
 * which disabled the horizontal scrollbar inherited from `overflow-x-auto`.
 *
 * These tests assert that every round-row wrapper inside each bracket
 * section keeps `overflow-x-auto` active at all breakpoints so the bracket
 * scrolls horizontally instead of breaking the surrounding layout.
 */

import { render } from "@testing-library/react";
import { DoubleEliminationBracket } from "@/components/tournament/double-elimination-bracket";

/**
 * Build a minimal 8-player double-elimination bracket structure.
 * The exact match data doesn't matter for the overflow test -- we only
 * need each round-row wrapper to be rendered so we can inspect classes.
 */
function build8PlayerStructure() {
  return [
    { matchNumber: 1, round: "winners_qf", bracket: "winners" as const, player1Seed: 1, player2Seed: 8 },
    { matchNumber: 2, round: "winners_qf", bracket: "winners" as const, player1Seed: 4, player2Seed: 5 },
    { matchNumber: 3, round: "winners_qf", bracket: "winners" as const, player1Seed: 2, player2Seed: 7 },
    { matchNumber: 4, round: "winners_qf", bracket: "winners" as const, player1Seed: 3, player2Seed: 6 },
    { matchNumber: 5, round: "winners_sf", bracket: "winners" as const },
    { matchNumber: 6, round: "winners_sf", bracket: "winners" as const },
    { matchNumber: 7, round: "winners_final", bracket: "winners" as const },
    { matchNumber: 8, round: "losers_r1", bracket: "losers" as const },
    { matchNumber: 9, round: "losers_r1", bracket: "losers" as const },
    { matchNumber: 10, round: "losers_r2", bracket: "losers" as const },
    { matchNumber: 11, round: "losers_r2", bracket: "losers" as const },
    { matchNumber: 12, round: "losers_r3", bracket: "losers" as const },
    { matchNumber: 13, round: "losers_sf", bracket: "losers" as const },
    { matchNumber: 14, round: "losers_final", bracket: "losers" as const },
    { matchNumber: 15, round: "grand_final", bracket: "grand_final" as const },
    { matchNumber: 16, round: "grand_final_reset", bracket: "grand_final" as const },
  ];
}

describe("DoubleEliminationBracket horizontal overflow (issue #424)", () => {
  it("allows horizontal scrolling in every bracket section at all breakpoints", () => {
    const { container } = render(
      <DoubleEliminationBracket
        matches={[]}
        bracketStructure={build8PlayerStructure()}
        roundNames={{}}
      />
    );

    /* Each section (Winners / Losers / Grand Final) wraps its round columns
     * in a flex row. That row is the element that needs to scroll when the
     * bracket is wider than its container. */
    const roundRows = container.querySelectorAll<HTMLElement>("div.md\\:flex-row");

    /* Winners, Losers, Grand Final => 3 round-row wrappers. */
    expect(roundRows.length).toBe(3);

    roundRows.forEach((row) => {
      /* Scrolling must be active; the prior bug was that `md:overflow-visible`
       * cancelled this on desktop and the bracket broke out of the pane. */
      expect(row.className).toContain("overflow-x-auto");
      expect(row.className).not.toContain("md:overflow-visible");
    });
  });
});

describe("DoubleEliminationBracket TBD rendering (issue #574)", () => {
  /* Right after bracket generation, losers-bracket matches have no real
   * players yet -- the DB schema requires non-null player ids so the API
   * fills both slots with the seed-1 player as a placeholder (see
   * finals-route.ts POST handler fallback). The UI must render those slots
   * as "TBD" rather than showing seed 1 on both sides, which misled users
   * into thinking the top seed was dropping straight into the losers bracket. */
  const seed1 = { id: "p1", name: "Alice A", nickname: "Alice" };
  const seed2 = { id: "p2", name: "Bob B", nickname: "Bob" };
  const seed3 = { id: "p3", name: "Carol C", nickname: "Carol" };
  const seed4 = { id: "p4", name: "Dan D", nickname: "Dan" };
  const seed5 = { id: "p5", name: "Eve E", nickname: "Eve" };
  const seed6 = { id: "p6", name: "Frank F", nickname: "Frank" };
  const seed7 = { id: "p7", name: "Grace G", nickname: "Grace" };
  const seed8 = { id: "p8", name: "Heidi H", nickname: "Heidi" };

  const seededPlayers = [seed1, seed2, seed3, seed4, seed5, seed6, seed7, seed8].map(
    (player, i) => ({ seed: i + 1, playerId: player.id, player }),
  );

  /* Build match rows as the POST /finals handler would immediately after
   * bracket creation: winners QF matches get their two seeds; every other
   * slot is filled with seed 1 on both sides. */
  const buildInitialMatches = () => {
    const seedPairs: Record<number, [typeof seed1, typeof seed1]> = {
      1: [seed1, seed8],
      2: [seed4, seed5],
      3: [seed2, seed7],
      4: [seed3, seed6],
    };
    return build8PlayerStructure().map((b) => {
      const pair = seedPairs[b.matchNumber];
      const player1 = pair ? pair[0] : seed1;
      const player2 = pair ? pair[1] : seed1;
      return {
        id: `m${b.matchNumber}`,
        matchNumber: b.matchNumber,
        round: b.round,
        stage: "finals",
        player1Id: player1.id,
        player2Id: player2.id,
        score1: 0,
        score2: 0,
        completed: false,
        player1,
        player2,
      };
    });
  };

  it("renders losers_r1 slots as TBD right after bracket generation", () => {
    const { container } = render(
      <DoubleEliminationBracket
        matches={buildInitialMatches()}
        bracketStructure={build8PlayerStructure()}
        roundNames={{}}
        seededPlayers={seededPlayers}
      />,
    );

    /* Locate losers_r1 cards (match 8 and 9) by their match-number label. */
    const losersR1Cards = Array.from(
      container.querySelectorAll<HTMLElement>("[role='button']"),
    ).filter((el) => {
      const label = el.querySelector("div.text-xs");
      return label && (label.textContent === "M8" || label.textContent === "M9");
    });

    expect(losersR1Cards).toHaveLength(2);

    for (const card of losersR1Cards) {
      /* Both player rows should say TBD, and neither should display the
       * seed-1 placeholder name that the DB stored. */
      expect(card.textContent).toContain("TBD");
      expect(card.textContent).not.toContain(seed1.nickname);
    }
  });

  it("keeps winners_qf first-round matches showing seeded player names", () => {
    const { container } = render(
      <DoubleEliminationBracket
        matches={buildInitialMatches()}
        bracketStructure={build8PlayerStructure()}
        roundNames={{}}
        seededPlayers={seededPlayers}
      />,
    );

    /* Match 1 is Seed 1 vs Seed 8 -- must not be TBD. */
    const winnersQF1 = Array.from(
      container.querySelectorAll<HTMLElement>("[role='button']"),
    ).find((el) => el.querySelector("div.text-xs")?.textContent === "M1");

    expect(winnersQF1).toBeDefined();
    expect(winnersQF1!.textContent).toContain(seed1.nickname);
    expect(winnersQF1!.textContent).toContain(seed8.nickname);
  });
});

describe("DoubleEliminationBracket startingCourseNumber display (issue #731)", () => {
  /* Verify that when matches carry a startingCourseNumber, the round header
   * shows the battle course label below the round name. */
  const player = { id: "p1", name: "Alice A", nickname: "Alice" };
  const buildMatchesWithCourse = (courseByRound: Record<string, number>) =>
    build8PlayerStructure().map((b) => ({
      id: `m${b.matchNumber}`,
      matchNumber: b.matchNumber,
      round: b.round,
      stage: "finals",
      player1Id: "p1",
      player2Id: "p1",
      score1: 0,
      score2: 0,
      completed: false,
      player1: player,
      player2: player,
      startingCourseNumber: b.round && courseByRound[b.round] != null ? courseByRound[b.round] : null,
    }));

  it("shows battleCourse label under round header when startingCourseNumber is set", () => {
    const matches = buildMatchesWithCourse({ winners_qf: 2, losers_r1: 3, grand_final: 1 });
    const { container } = render(
      <DoubleEliminationBracket
        matches={matches}
        bracketStructure={build8PlayerStructure()}
        roundNames={{}}
      />,
    );
    /* finals.battleCourse translation resolves to "Battle Course {number}" in test env */
    const text = container.textContent || "";
    expect(text).toContain("Battle Course 2"); /* winners_qf */
    expect(text).toContain("Battle Course 3"); /* losers_r1 */
    expect(text).toContain("Battle Course 1"); /* grand_final */
  });

  it("hides battleCourse label when startingCourseNumber is null", () => {
    const matches = buildMatchesWithCourse({});
    const { container } = render(
      <DoubleEliminationBracket
        matches={matches}
        bracketStructure={build8PlayerStructure()}
        roundNames={{}}
      />,
    );
    expect(container.textContent).not.toContain("Battle Course");
  });
});

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

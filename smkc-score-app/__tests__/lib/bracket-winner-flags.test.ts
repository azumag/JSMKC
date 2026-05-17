import { resolveBracketWinnerFlags, type BracketWinnerMatch } from "@/lib/bracket-winner-flags";
import type { BracketMatch } from "@/types/bracket";

const bracketMatch: BracketMatch = {
  matchNumber: 1,
  round: "winners_qf",
  bracket: "winners",
};

function finalsMatch(overrides: Partial<BracketWinnerMatch> = {}): BracketWinnerMatch {
  return {
    completed: true,
    player1Id: "p1",
    player2Id: "p2",
    score1: 0,
    score2: 0,
    ...overrides,
  };
}

describe("resolveBracketWinnerFlags", () => {
  it("returns no winner when the match has not been created yet", () => {
    expect(resolveBracketWinnerFlags(undefined, bracketMatch, 5)).toEqual({
      isWinner1: false,
      isWinner2: false,
    });
  });

  it("returns no winner while the match is unfinished", () => {
    expect(resolveBracketWinnerFlags(finalsMatch({ completed: false, score1: 5 }), bracketMatch, 5)).toEqual({
      isWinner1: false,
      isWinner2: false,
    });
  });

  it("honors an explicit null resolver result as no winner", () => {
    expect(resolveBracketWinnerFlags(finalsMatch({ score1: 5, score2: 4 }), bracketMatch, 5, () => null)).toEqual({
      isWinner1: false,
      isWinner2: false,
    });
  });

  it("marks player 1 as winner when the resolver returns player1Id", () => {
    expect(resolveBracketWinnerFlags(finalsMatch({ score1: 0, score2: 5 }), bracketMatch, 5, (match) => match.player1Id)).toEqual({
      isWinner1: true,
      isWinner2: false,
    });
  });

  it("falls back to score comparison when player 1 reaches target wins", () => {
    expect(resolveBracketWinnerFlags(finalsMatch({ score1: 5, score2: 4 }), bracketMatch, 5)).toEqual({
      isWinner1: true,
      isWinner2: false,
    });
  });

  it("falls back to score comparison when player 2 reaches target wins", () => {
    expect(resolveBracketWinnerFlags(finalsMatch({ score1: 3, score2: 5 }), bracketMatch, 5)).toEqual({
      isWinner1: false,
      isWinner2: true,
    });
  });
});

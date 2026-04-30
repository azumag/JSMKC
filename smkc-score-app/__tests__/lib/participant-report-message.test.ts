import {
  getMatchReportSuccessMessage,
  getScoreReportSuccessMessage,
  type MatchReportMessages,
  type ScoreReportMessages,
} from "@/lib/participant-report-message";

const scoreMessages: ScoreReportMessages = {
  correctionSubmittedSuccess: "Score correction saved.",
  scoresReportedSuccess: "Scores reported successfully! Both players must report matching scores for confirmation.",
  scoresConfirmedSuccess: "Scores saved and the match is confirmed.",
  scoresMismatchSubmitted: "Scores reported, but the two reports do not match. Admin review is needed.",
};

const matchMessages: MatchReportMessages = {
  matchReportedSuccess: "Match result reported successfully! Both players must report matching results for confirmation.",
  matchConfirmedSuccess: "Match result saved and confirmed.",
  matchMismatchSubmitted: "Match result reported, but the two reports do not match. Admin review is needed.",
};

describe("participant report success messages", () => {
  it("shows confirmed score copy when dual report is disabled and the API auto-confirms", () => {
    expect(getScoreReportSuccessMessage({ autoConfirmed: true }, scoreMessages)).toBe(
      "Scores saved and the match is confirmed."
    );
  });

  it("keeps dual-report waiting copy when the API is waiting for the other player", () => {
    expect(getScoreReportSuccessMessage({ waitingFor: "player2" }, scoreMessages)).toContain(
      "Both players must report matching scores"
    );
  });

  it("shows confirmed match-result copy when dual report is disabled and the API auto-confirms", () => {
    expect(getMatchReportSuccessMessage({ autoConfirmed: true }, matchMessages)).toBe(
      "Match result saved and confirmed."
    );
  });

  it("keeps dual-report waiting copy for MR/GP when the API is waiting for the other player", () => {
    expect(getMatchReportSuccessMessage({ waitingFor: "player1" }, matchMessages)).toContain(
      "Both players must report matching results"
    );
  });
});

export type ParticipantReportResult = {
  autoConfirmed?: unknown;
  corrected?: unknown;
  mismatch?: unknown;
  waitingFor?: unknown;
};

export type ScoreReportMessages = {
  correctionSubmittedSuccess: string;
  scoresReportedSuccess: string;
  scoresConfirmedSuccess: string;
  scoresMismatchSubmitted: string;
};

export type MatchReportMessages = {
  matchReportedSuccess: string;
  matchConfirmedSuccess: string;
  matchMismatchSubmitted: string;
};

export function getScoreReportSuccessMessage(
  result: ParticipantReportResult,
  messages: ScoreReportMessages
) {
  if (result.corrected) return messages.correctionSubmittedSuccess;
  if (result.autoConfirmed) return messages.scoresConfirmedSuccess;
  if (result.mismatch) return messages.scoresMismatchSubmitted;
  return messages.scoresReportedSuccess;
}

export function getMatchReportSuccessMessage(
  result: ParticipantReportResult,
  messages: MatchReportMessages
) {
  if (result.autoConfirmed) return messages.matchConfirmedSuccess;
  if (result.mismatch) return messages.matchMismatchSubmitted;
  return messages.matchReportedSuccess;
}

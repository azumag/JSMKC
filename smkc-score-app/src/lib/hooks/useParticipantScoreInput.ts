"use client";

import { useCallback, useState } from "react";
import type { BaseMatch } from "@/lib/hooks/useParticipantMatches";

export interface ParticipantScorePair {
  score1: number;
  score2: number;
}

export interface ParticipantScoreInputMatch extends BaseMatch {
  score1?: number | null;
  score2?: number | null;
}

interface UseParticipantScoreInputOptions<TMatch extends ParticipantScoreInputMatch> {
  playerId: string | undefined;
  getReportedScores: (
    match: TMatch,
    isPlayer1: boolean
  ) => {
    score1: number | null | undefined;
    score2: number | null | undefined;
  };
  submitReport: (
    matchId: string,
    body: Record<string, unknown>
  ) => Promise<Record<string, unknown> | null>;
  setError: (error: string | null) => void;
  totalMustEqualMessage: string;
  requiredTotalScore?: number;
  maxScorePerSide?: number;
  onSubmitSuccess?: (data: Record<string, unknown>, match: TMatch) => void;
}

export function useParticipantScoreInput<TMatch extends ParticipantScoreInputMatch>({
  playerId,
  getReportedScores,
  submitReport,
  setError,
  totalMustEqualMessage,
  requiredTotalScore = 4,
  maxScorePerSide = requiredTotalScore,
  onSubmitSuccess,
}: UseParticipantScoreInputOptions<TMatch>) {
  const [reportingScores, setReportingScores] = useState<
    Record<string, ParticipantScorePair>
  >({});

  const isPlayer1ForMatch = useCallback(
    (match: TMatch) => match.player1.id === playerId,
    [playerId]
  );

  const getInitialScores = useCallback(
    (match: TMatch): ParticipantScorePair => {
      const reported = getReportedScores(match, isPlayer1ForMatch(match));

      if (reported.score1 != null && reported.score2 != null) {
        return { score1: reported.score1, score2: reported.score2 };
      }

      if (match.completed) {
        return { score1: match.score1 ?? 0, score2: match.score2 ?? 0 };
      }

      return { score1: 0, score2: 0 };
    },
    [getReportedScores, isPlayer1ForMatch]
  );

  const hasOwnReport = useCallback(
    (match: TMatch) => getReportedScores(match, isPlayer1ForMatch(match)).score1 != null,
    [getReportedScores, isPlayer1ForMatch]
  );

  const clearScores = useCallback((matchId: string) => {
    setReportingScores((prev) => {
      const next = { ...prev };
      delete next[matchId];
      return next;
    });
  }, []);

  const adjustScore = useCallback(
    (match: TMatch, field: keyof ParticipantScorePair, delta: number) => {
      setReportingScores((prev) => {
        const current = prev[match.id] ?? getInitialScores(match);
        const clamped = Math.max(0, Math.min(maxScorePerSide, current[field] + delta));
        return { ...prev, [match.id]: { ...current, [field]: clamped } };
      });
    },
    [getInitialScores, maxScorePerSide]
  );

  const handleSubmitScore = useCallback(
    async (match: TMatch) => {
      const scores = reportingScores[match.id] ?? getInitialScores(match);
      const reportingPlayer = isPlayer1ForMatch(match) ? 1 : 2;

      if (scores.score1 + scores.score2 !== requiredTotalScore) {
        setError(totalMustEqualMessage);
        return null;
      }

      setError(null);
      const data = await submitReport(match.id, {
        reportingPlayer,
        score1: scores.score1,
        score2: scores.score2,
      });

      if (data) {
        clearScores(match.id);
        onSubmitSuccess?.(data, match);
      }

      return data;
    },
    [
      clearScores,
      getInitialScores,
      isPlayer1ForMatch,
      onSubmitSuccess,
      reportingScores,
      requiredTotalScore,
      setError,
      submitReport,
      totalMustEqualMessage,
    ]
  );

  return {
    reportingScores,
    setReportingScores,
    requiredTotalScore,
    maxScorePerSide,
    getInitialScores,
    hasOwnReport,
    adjustScore,
    handleSubmitScore,
  };
}

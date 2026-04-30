import prisma from "@/lib/prisma";
import type { createLogger } from "@/lib/logger";

type Logger = ReturnType<typeof createLogger>;

interface QualificationMatchBroadcastInput {
  tournamentId: string;
  matchId: string;
  matchNumber: number;
  stage: string;
  player1Name: string;
  player2Name: string;
  score1: number;
  score2: number;
}

export async function reflectQualificationMatchBroadcast(
  logger: Logger,
  match: QualificationMatchBroadcastInput,
): Promise<void> {
  if (match.stage !== "qualification") return;

  try {
    await prisma.tournament.update({
      where: { id: match.tournamentId },
      data: {
        overlayPlayer1Name: match.player1Name,
        overlayPlayer2Name: match.player2Name,
        overlayMatchLabel: `Qualification Match #${match.matchNumber}`,
        overlayPlayer1Wins: match.score1,
        overlayPlayer2Wins: match.score2,
        overlayMatchFt: null,
      },
    });
  } catch (error) {
    logger.warn("Failed to reflect qualification match to broadcast overlay", {
      error,
      tournamentId: match.tournamentId,
      matchId: match.matchId,
    });
  }
}

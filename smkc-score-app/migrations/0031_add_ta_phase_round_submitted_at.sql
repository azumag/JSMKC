ALTER TABLE "TTPhaseRound" ADD COLUMN "submittedAt" DATETIME;
CREATE INDEX IF NOT EXISTS "TTPhaseRound_tournamentId_submittedAt_idx" ON "TTPhaseRound"("tournamentId", "submittedAt");

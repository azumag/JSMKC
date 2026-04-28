-- Add explicit sudden-death rounds for TA/TT finals phase ties.
CREATE TABLE "TTPhaseSuddenDeathRound" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tournamentId" TEXT NOT NULL,
  "phaseRoundId" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "course" TEXT NOT NULL,
  "targetPlayerIds" JSONB NOT NULL,
  "results" JSONB,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "TTPhaseSuddenDeathRound_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TTPhaseSuddenDeathRound_phaseRoundId_fkey" FOREIGN KEY ("phaseRoundId") REFERENCES "TTPhaseRound" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TTPhaseSuddenDeathRound_phaseRoundId_sequence_key" ON "TTPhaseSuddenDeathRound"("phaseRoundId", "sequence");
CREATE INDEX "TTPhaseSuddenDeathRound_tournamentId_phase_idx" ON "TTPhaseSuddenDeathRound"("tournamentId", "phase");
CREATE INDEX "TTPhaseSuddenDeathRound_phaseRoundId_idx" ON "TTPhaseSuddenDeathRound"("phaseRoundId");

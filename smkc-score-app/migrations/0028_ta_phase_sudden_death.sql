-- Add explicit sudden-death rounds for TA/TT finals phase ties.
CREATE TABLE IF NOT EXISTS "TTPhaseSuddenDeathRound" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tournamentId" TEXT NOT NULL,
  "phaseRoundId" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "course" TEXT NOT NULL,
  "targetPlayerIds" TEXT NOT NULL,
  "results" TEXT,
  "resolved" BOOLEAN NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TTPhaseSuddenDeathRound_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TTPhaseSuddenDeathRound_phaseRoundId_fkey" FOREIGN KEY ("phaseRoundId") REFERENCES "TTPhaseRound" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TTPhaseSuddenDeathRound_phaseRoundId_sequence_key" ON "TTPhaseSuddenDeathRound"("phaseRoundId", "sequence");
CREATE INDEX IF NOT EXISTS "TTPhaseSuddenDeathRound_tournamentId_phase_idx" ON "TTPhaseSuddenDeathRound"("tournamentId", "phase");
CREATE INDEX IF NOT EXISTS "TTPhaseSuddenDeathRound_phaseRoundId_idx" ON "TTPhaseSuddenDeathRound"("phaseRoundId");

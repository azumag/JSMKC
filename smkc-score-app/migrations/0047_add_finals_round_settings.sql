-- #3038: persist the configured first-to value per finals/playoff match and
-- preserve an administrator-selected winner for tied corrected results.
ALTER TABLE "BMMatch" ADD COLUMN "targetWins" INTEGER;
ALTER TABLE "BMMatch" ADD COLUMN "winnerOverrideId" TEXT;
ALTER TABLE "MRMatch" ADD COLUMN "targetWins" INTEGER;
ALTER TABLE "MRMatch" ADD COLUMN "winnerOverrideId" TEXT;
ALTER TABLE "GPMatch" ADD COLUMN "targetWins" INTEGER;
ALTER TABLE "GPMatch" ADD COLUMN "winnerOverrideId" TEXT;

CREATE TABLE "FinalsRoundSetting" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tournamentId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "round" TEXT NOT NULL,
  "targetWins" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinalsRoundSetting_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FinalsRoundSetting_tournamentId_mode_stage_round_key"
  ON "FinalsRoundSetting"("tournamentId", "mode", "stage", "round");

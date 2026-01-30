-- Add courseScores and qualificationPoints to TTEntry
ALTER TABLE "TTEntry" ADD COLUMN "courseScores" JSONB;
ALTER TABLE "TTEntry" ADD COLUMN "qualificationPoints" INTEGER;

-- Update stage values: revival_1 -> phase1, revival_2 -> phase2, finals -> phase3
-- Note: Run these updates only if you have existing data
-- UPDATE "TTEntry" SET "stage" = 'phase1' WHERE "stage" = 'revival_1';
-- UPDATE "TTEntry" SET "stage" = 'phase2' WHERE "stage" = 'revival_2';
-- UPDATE "TTEntry" SET "stage" = 'phase3' WHERE "stage" = 'finals';

-- CreateTable TournamentPlayerScore
CREATE TABLE "TournamentPlayerScore" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "taQualificationPoints" INTEGER NOT NULL DEFAULT 0,
    "bmQualificationPoints" INTEGER NOT NULL DEFAULT 0,
    "mrQualificationPoints" INTEGER NOT NULL DEFAULT 0,
    "gpQualificationPoints" INTEGER NOT NULL DEFAULT 0,
    "taFinalsPoints" INTEGER NOT NULL DEFAULT 0,
    "bmFinalsPoints" INTEGER NOT NULL DEFAULT 0,
    "mrFinalsPoints" INTEGER NOT NULL DEFAULT 0,
    "gpFinalsPoints" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "overallRank" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentPlayerScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentPlayerScore_tournamentId_idx" ON "TournamentPlayerScore"("tournamentId");

-- CreateIndex
CREATE INDEX "TournamentPlayerScore_totalPoints_idx" ON "TournamentPlayerScore"("totalPoints");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentPlayerScore_tournamentId_playerId_key" ON "TournamentPlayerScore"("tournamentId", "playerId");

-- AddForeignKey
ALTER TABLE "TournamentPlayerScore" ADD CONSTRAINT "TournamentPlayerScore_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPlayerScore" ADD CONSTRAINT "TournamentPlayerScore_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

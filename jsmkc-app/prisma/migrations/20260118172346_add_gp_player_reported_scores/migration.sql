-- AlterTable
ALTER TABLE "GPMatch" ADD COLUMN     "player1ReportedPoints1" INTEGER,
ADD COLUMN     "player1ReportedPoints2" INTEGER,
ADD COLUMN     "player1ReportedRaces" JSONB,
ADD COLUMN     "player2ReportedPoints1" INTEGER,
ADD COLUMN     "player2ReportedPoints2" INTEGER,
ADD COLUMN     "player2ReportedRaces" JSONB;

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbr" TEXT NOT NULL,
    "cup" TEXT NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Arena" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbr" TEXT NOT NULL,

    CONSTRAINT "Arena_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BMQualification" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "seeding" INTEGER,
    "mp" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "winRounds" INTEGER NOT NULL DEFAULT 0,
    "lossRounds" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BMQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BMMatch" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "matchNumber" INTEGER NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'qualification',
    "round" TEXT,
    "tvNumber" INTEGER,
    "player1Id" TEXT NOT NULL,
    "player1Side" INTEGER NOT NULL DEFAULT 1,
    "player2Id" TEXT NOT NULL,
    "player2Side" INTEGER NOT NULL DEFAULT 2,
    "score1" INTEGER NOT NULL DEFAULT 0,
    "score2" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "rounds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BMMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MRQualification" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "seeding" INTEGER,
    "mp" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "winRounds" INTEGER NOT NULL DEFAULT 0,
    "lossRounds" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MRQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MRMatch" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "matchNumber" INTEGER NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'qualification',
    "round" TEXT,
    "tvNumber" INTEGER,
    "player1Id" TEXT NOT NULL,
    "player1Side" INTEGER NOT NULL DEFAULT 1,
    "player2Id" TEXT NOT NULL,
    "player2Side" INTEGER NOT NULL DEFAULT 2,
    "score1" INTEGER NOT NULL DEFAULT 0,
    "score2" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "rounds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MRMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GPQualification" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "seeding" INTEGER,
    "mp" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GPQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GPMatch" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "matchNumber" INTEGER NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'qualification',
    "round" TEXT,
    "cup" TEXT,
    "tvNumber" INTEGER,
    "player1Id" TEXT NOT NULL,
    "player1Side" INTEGER NOT NULL DEFAULT 1,
    "player2Id" TEXT NOT NULL,
    "player2Side" INTEGER NOT NULL DEFAULT 2,
    "points1" INTEGER NOT NULL DEFAULT 0,
    "points2" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "races" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GPMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TTEntry" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'qualification',
    "lives" INTEGER NOT NULL DEFAULT 3,
    "eliminated" BOOLEAN NOT NULL DEFAULT false,
    "times" JSONB,
    "totalTime" INTEGER,
    "rank" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TTEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_nickname_key" ON "Player"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "Course_abbr_key" ON "Course"("abbr");

-- CreateIndex
CREATE UNIQUE INDEX "Arena_abbr_key" ON "Arena"("abbr");

-- CreateIndex
CREATE UNIQUE INDEX "BMQualification_tournamentId_playerId_key" ON "BMQualification"("tournamentId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "BMMatch_tournamentId_matchNumber_stage_key" ON "BMMatch"("tournamentId", "matchNumber", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "MRQualification_tournamentId_playerId_key" ON "MRQualification"("tournamentId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "MRMatch_tournamentId_matchNumber_stage_key" ON "MRMatch"("tournamentId", "matchNumber", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "GPQualification_tournamentId_playerId_key" ON "GPQualification"("tournamentId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "GPMatch_tournamentId_matchNumber_stage_key" ON "GPMatch"("tournamentId", "matchNumber", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "TTEntry_tournamentId_playerId_stage_key" ON "TTEntry"("tournamentId", "playerId", "stage");

-- AddForeignKey
ALTER TABLE "BMQualification" ADD CONSTRAINT "BMQualification_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BMQualification" ADD CONSTRAINT "BMQualification_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BMMatch" ADD CONSTRAINT "BMMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BMMatch" ADD CONSTRAINT "BMMatch_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BMMatch" ADD CONSTRAINT "BMMatch_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MRQualification" ADD CONSTRAINT "MRQualification_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MRQualification" ADD CONSTRAINT "MRQualification_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MRMatch" ADD CONSTRAINT "MRMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MRMatch" ADD CONSTRAINT "MRMatch_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MRMatch" ADD CONSTRAINT "MRMatch_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GPQualification" ADD CONSTRAINT "GPQualification_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GPQualification" ADD CONSTRAINT "GPQualification_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GPMatch" ADD CONSTRAINT "GPMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GPMatch" ADD CONSTRAINT "GPMatch_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GPMatch" ADD CONSTRAINT "GPMatch_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TTEntry" ADD CONSTRAINT "TTEntry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TTEntry" ADD CONSTRAINT "TTEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

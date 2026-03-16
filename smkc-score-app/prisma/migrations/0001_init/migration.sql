-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "country" TEXT,
    "password" TEXT,
    "deletedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT,
    CONSTRAINT "Player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "frozenStages" TEXT NOT NULL DEFAULT '[]',
    "deletedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "abbr" TEXT NOT NULL,
    "cup" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Arena" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "abbr" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "BMQualification" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "deletedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "BMQualification_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BMQualification_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BMMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "matchNumber" INTEGER NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'qualification',
    "round" TEXT,
    "tvNumber" INTEGER,
    "roundNumber" INTEGER,
    "isBye" BOOLEAN NOT NULL DEFAULT false,
    "player1Id" TEXT NOT NULL,
    "player1Side" INTEGER NOT NULL DEFAULT 1,
    "player2Id" TEXT NOT NULL,
    "player2Side" INTEGER NOT NULL DEFAULT 2,
    "score1" INTEGER NOT NULL DEFAULT 0,
    "score2" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "assignedCourses" JSONB,
    "rounds" JSONB,
    "bracket" TEXT,
    "bracketPosition" TEXT,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "isGrandFinal" BOOLEAN NOT NULL DEFAULT false,
    "player1ReportedScore1" INTEGER,
    "player1ReportedScore2" INTEGER,
    "player2ReportedScore1" INTEGER,
    "player2ReportedScore2" INTEGER,
    "deletedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BMMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BMMatch_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BMMatch_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MRQualification" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "deletedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MRQualification_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MRQualification_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MRMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "matchNumber" INTEGER NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'qualification',
    "round" TEXT,
    "tvNumber" INTEGER,
    "roundNumber" INTEGER,
    "isBye" BOOLEAN NOT NULL DEFAULT false,
    "player1Id" TEXT NOT NULL,
    "player1Side" INTEGER NOT NULL DEFAULT 1,
    "player2Id" TEXT NOT NULL,
    "player2Side" INTEGER NOT NULL DEFAULT 2,
    "score1" INTEGER NOT NULL DEFAULT 0,
    "score2" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "assignedCourses" JSONB,
    "rounds" JSONB,
    "bracket" TEXT,
    "bracketPosition" TEXT,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "isGrandFinal" BOOLEAN NOT NULL DEFAULT false,
    "player1ReportedPoints1" INTEGER,
    "player1ReportedPoints2" INTEGER,
    "player1ReportedRaces" JSONB,
    "player2ReportedPoints1" INTEGER,
    "player2ReportedPoints2" INTEGER,
    "player2ReportedRaces" JSONB,
    "deletedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MRMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MRMatch_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MRMatch_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GPQualification" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "deletedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "GPQualification_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GPQualification_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GPMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "matchNumber" INTEGER NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'qualification',
    "round" TEXT,
    "cup" TEXT,
    "tvNumber" INTEGER,
    "roundNumber" INTEGER,
    "isBye" BOOLEAN NOT NULL DEFAULT false,
    "player1Id" TEXT NOT NULL,
    "player1Side" INTEGER NOT NULL DEFAULT 1,
    "player2Id" TEXT NOT NULL,
    "player2Side" INTEGER NOT NULL DEFAULT 2,
    "points1" INTEGER NOT NULL DEFAULT 0,
    "points2" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "races" JSONB,
    "player1ReportedPoints1" INTEGER,
    "player1ReportedPoints2" INTEGER,
    "player1ReportedRaces" JSONB,
    "player2ReportedPoints1" INTEGER,
    "player2ReportedPoints2" INTEGER,
    "player2ReportedRaces" JSONB,
    "deletedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GPMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GPMatch_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GPMatch_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "targetType" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScoreEntryLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "reportedData" JSONB NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScoreEntryLog_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchCharacterUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "character" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchCharacterUsage_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TTPhaseRound" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "course" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "eliminatedIds" JSONB,
    "livesReset" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TTPhaseRound_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TTEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'qualification',
    "lives" INTEGER NOT NULL DEFAULT 3,
    "eliminated" BOOLEAN NOT NULL DEFAULT false,
    "times" JSONB,
    "totalTime" INTEGER,
    "rank" INTEGER,
    "courseScores" JSONB,
    "qualificationPoints" INTEGER,
    "deletedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TTEntry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TTEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TournamentPlayerScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TournamentPlayerScore_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TournamentPlayerScore_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Player_nickname_key" ON "Player"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "Player_userId_key" ON "Player"("userId");

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
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "ScoreEntryLog_matchId_idx" ON "ScoreEntryLog"("matchId");

-- CreateIndex
CREATE INDEX "ScoreEntryLog_playerId_idx" ON "ScoreEntryLog"("playerId");

-- CreateIndex
CREATE INDEX "ScoreEntryLog_timestamp_idx" ON "ScoreEntryLog"("timestamp");

-- CreateIndex
CREATE INDEX "ScoreEntryLog_tournamentId_idx" ON "ScoreEntryLog"("tournamentId");

-- CreateIndex
CREATE INDEX "MatchCharacterUsage_playerId_idx" ON "MatchCharacterUsage"("playerId");

-- CreateIndex
CREATE INDEX "MatchCharacterUsage_character_idx" ON "MatchCharacterUsage"("character");

-- CreateIndex
CREATE UNIQUE INDEX "MatchCharacterUsage_matchId_matchType_playerId_key" ON "MatchCharacterUsage"("matchId", "matchType", "playerId");

-- CreateIndex
CREATE INDEX "TTPhaseRound_tournamentId_phase_idx" ON "TTPhaseRound"("tournamentId", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "TTPhaseRound_tournamentId_phase_roundNumber_key" ON "TTPhaseRound"("tournamentId", "phase", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TTEntry_tournamentId_playerId_stage_key" ON "TTEntry"("tournamentId", "playerId", "stage");

-- CreateIndex
CREATE INDEX "TournamentPlayerScore_tournamentId_idx" ON "TournamentPlayerScore"("tournamentId");

-- CreateIndex
CREATE INDEX "TournamentPlayerScore_totalPoints_idx" ON "TournamentPlayerScore"("totalPoints");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentPlayerScore_tournamentId_playerId_key" ON "TournamentPlayerScore"("tournamentId", "playerId");


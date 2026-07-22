-- #3036: keep Prisma's local SQLite migration equivalent to the Wrangler/D1
-- migration. SQLite requires a table rebuild to remove NOT NULL.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE `new_BMMatch` (
  `id` TEXT NOT NULL PRIMARY KEY, `tournamentId` TEXT NOT NULL, `matchNumber` INTEGER NOT NULL,
  `stage` TEXT NOT NULL DEFAULT 'qualification', `round` TEXT, `tvNumber` INTEGER, `roundNumber` INTEGER,
  `isBye` BOOLEAN NOT NULL DEFAULT false, `player1Id` TEXT, `player1Side` INTEGER NOT NULL DEFAULT 1,
  `player2Id` TEXT, `player2Side` INTEGER NOT NULL DEFAULT 2, `score1` INTEGER NOT NULL DEFAULT 0,
  `score2` INTEGER NOT NULL DEFAULT 0, `completed` BOOLEAN NOT NULL DEFAULT false, `assignedCourses` TEXT,
  `rounds` TEXT, `startingCourseNumber` INTEGER, `bracket` TEXT, `bracketPosition` TEXT,
  `losses` INTEGER NOT NULL DEFAULT 0, `isGrandFinal` BOOLEAN NOT NULL DEFAULT false,
  `player1ReportedScore1` INTEGER, `player1ReportedScore2` INTEGER, `player2ReportedScore1` INTEGER,
  `player2ReportedScore2` INTEGER, `slotOverrideBy` TEXT, `slotOverrideAt` DATETIME, `deletedAt` DATETIME,
  `version` INTEGER NOT NULL DEFAULT 0, `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL,
  CONSTRAINT `BMMatch_tournamentId_fkey` FOREIGN KEY (`tournamentId`) REFERENCES `Tournament` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `BMMatch_player1Id_fkey` FOREIGN KEY (`player1Id`) REFERENCES `Player` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `BMMatch_player2Id_fkey` FOREIGN KEY (`player2Id`) REFERENCES `Player` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO `new_BMMatch` (`id`,`tournamentId`,`matchNumber`,`stage`,`round`,`tvNumber`,`roundNumber`,`isBye`,`player1Id`,`player1Side`,`player2Id`,`player2Side`,`score1`,`score2`,`completed`,`assignedCourses`,`rounds`,`startingCourseNumber`,`bracket`,`bracketPosition`,`losses`,`isGrandFinal`,`player1ReportedScore1`,`player1ReportedScore2`,`player2ReportedScore1`,`player2ReportedScore2`,`slotOverrideBy`,`slotOverrideAt`,`deletedAt`,`version`,`createdAt`,`updatedAt`) SELECT `id`,`tournamentId`,`matchNumber`,`stage`,`round`,`tvNumber`,`roundNumber`,`isBye`,`player1Id`,`player1Side`,`player2Id`,`player2Side`,`score1`,`score2`,`completed`,`assignedCourses`,`rounds`,`startingCourseNumber`,`bracket`,`bracketPosition`,`losses`,`isGrandFinal`,`player1ReportedScore1`,`player1ReportedScore2`,`player2ReportedScore1`,`player2ReportedScore2`,`slotOverrideBy`,`slotOverrideAt`,`deletedAt`,`version`,`createdAt`,`updatedAt` FROM `BMMatch`;
DROP TABLE `BMMatch`;
ALTER TABLE `new_BMMatch` RENAME TO `BMMatch`;

CREATE TABLE `new_MRMatch` (
  `id` TEXT NOT NULL PRIMARY KEY, `tournamentId` TEXT NOT NULL, `matchNumber` INTEGER NOT NULL,
  `stage` TEXT NOT NULL DEFAULT 'qualification', `round` TEXT, `tvNumber` INTEGER, `roundNumber` INTEGER,
  `isBye` BOOLEAN NOT NULL DEFAULT false, `player1Id` TEXT, `player1Side` INTEGER NOT NULL DEFAULT 1,
  `player2Id` TEXT, `player2Side` INTEGER NOT NULL DEFAULT 2, `score1` INTEGER NOT NULL DEFAULT 0,
  `score2` INTEGER NOT NULL DEFAULT 0, `completed` BOOLEAN NOT NULL DEFAULT false,
  `scoresConfirmed` BOOLEAN NOT NULL DEFAULT false, `assignedCourses` TEXT, `rounds` TEXT, `bracket` TEXT,
  `bracketPosition` TEXT, `losses` INTEGER NOT NULL DEFAULT 0, `isGrandFinal` BOOLEAN NOT NULL DEFAULT false,
  `player1ReportedPoints1` INTEGER, `player1ReportedPoints2` INTEGER, `player1ReportedRaces` TEXT,
  `player2ReportedPoints1` INTEGER, `player2ReportedPoints2` INTEGER, `player2ReportedRaces` TEXT,
  `slotOverrideBy` TEXT, `slotOverrideAt` DATETIME, `deletedAt` DATETIME, `version` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` DATETIME NOT NULL,
  CONSTRAINT `MRMatch_tournamentId_fkey` FOREIGN KEY (`tournamentId`) REFERENCES `Tournament` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `MRMatch_player1Id_fkey` FOREIGN KEY (`player1Id`) REFERENCES `Player` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `MRMatch_player2Id_fkey` FOREIGN KEY (`player2Id`) REFERENCES `Player` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO `new_MRMatch` (`id`,`tournamentId`,`matchNumber`,`stage`,`round`,`tvNumber`,`roundNumber`,`isBye`,`player1Id`,`player1Side`,`player2Id`,`player2Side`,`score1`,`score2`,`completed`,`scoresConfirmed`,`assignedCourses`,`rounds`,`bracket`,`bracketPosition`,`losses`,`isGrandFinal`,`player1ReportedPoints1`,`player1ReportedPoints2`,`player1ReportedRaces`,`player2ReportedPoints1`,`player2ReportedPoints2`,`player2ReportedRaces`,`slotOverrideBy`,`slotOverrideAt`,`deletedAt`,`version`,`createdAt`,`updatedAt`) SELECT `id`,`tournamentId`,`matchNumber`,`stage`,`round`,`tvNumber`,`roundNumber`,`isBye`,`player1Id`,`player1Side`,`player2Id`,`player2Side`,`score1`,`score2`,`completed`,`scoresConfirmed`,`assignedCourses`,`rounds`,`bracket`,`bracketPosition`,`losses`,`isGrandFinal`,`player1ReportedPoints1`,`player1ReportedPoints2`,`player1ReportedRaces`,`player2ReportedPoints1`,`player2ReportedPoints2`,`player2ReportedRaces`,`slotOverrideBy`,`slotOverrideAt`,`deletedAt`,`version`,`createdAt`,`updatedAt` FROM `MRMatch`;
DROP TABLE `MRMatch`;
ALTER TABLE `new_MRMatch` RENAME TO `MRMatch`;

CREATE TABLE `new_GPMatch` (
  `id` TEXT NOT NULL PRIMARY KEY, `tournamentId` TEXT NOT NULL, `matchNumber` INTEGER NOT NULL,
  `stage` TEXT NOT NULL DEFAULT 'qualification', `round` TEXT, `cup` TEXT, `tvNumber` INTEGER, `roundNumber` INTEGER,
  `isBye` BOOLEAN NOT NULL DEFAULT false, `player1Id` TEXT, `player1Side` INTEGER NOT NULL DEFAULT 1,
  `player2Id` TEXT, `player2Side` INTEGER NOT NULL DEFAULT 2, `points1` INTEGER NOT NULL DEFAULT 0,
  `points2` INTEGER NOT NULL DEFAULT 0, `completed` BOOLEAN NOT NULL DEFAULT false, `suddenDeathWinnerId` TEXT,
  `races` TEXT, `assignedCups` TEXT, `cupResults` TEXT, `player1ReportedPoints1` INTEGER,
  `player1ReportedPoints2` INTEGER, `player1ReportedRaces` TEXT, `player2ReportedPoints1` INTEGER,
  `player2ReportedPoints2` INTEGER, `player2ReportedRaces` TEXT, `slotOverrideBy` TEXT, `slotOverrideAt` DATETIME,
  `deletedAt` DATETIME, `version` INTEGER NOT NULL DEFAULT 0, `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL,
  CONSTRAINT `GPMatch_tournamentId_fkey` FOREIGN KEY (`tournamentId`) REFERENCES `Tournament` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `GPMatch_player1Id_fkey` FOREIGN KEY (`player1Id`) REFERENCES `Player` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `GPMatch_player2Id_fkey` FOREIGN KEY (`player2Id`) REFERENCES `Player` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO `new_GPMatch` (`id`,`tournamentId`,`matchNumber`,`stage`,`round`,`cup`,`tvNumber`,`roundNumber`,`isBye`,`player1Id`,`player1Side`,`player2Id`,`player2Side`,`points1`,`points2`,`completed`,`suddenDeathWinnerId`,`races`,`assignedCups`,`cupResults`,`player1ReportedPoints1`,`player1ReportedPoints2`,`player1ReportedRaces`,`player2ReportedPoints1`,`player2ReportedPoints2`,`player2ReportedRaces`,`slotOverrideBy`,`slotOverrideAt`,`deletedAt`,`version`,`createdAt`,`updatedAt`) SELECT `id`,`tournamentId`,`matchNumber`,`stage`,`round`,`cup`,`tvNumber`,`roundNumber`,`isBye`,`player1Id`,`player1Side`,`player2Id`,`player2Side`,`points1`,`points2`,`completed`,`suddenDeathWinnerId`,`races`,`assignedCups`,`cupResults`,`player1ReportedPoints1`,`player1ReportedPoints2`,`player1ReportedRaces`,`player2ReportedPoints1`,`player2ReportedPoints2`,`player2ReportedRaces`,`slotOverrideBy`,`slotOverrideAt`,`deletedAt`,`version`,`createdAt`,`updatedAt` FROM `GPMatch`;
DROP TABLE `GPMatch`;
ALTER TABLE `new_GPMatch` RENAME TO `GPMatch`;

CREATE INDEX `BMMatch_tournamentId_stage_player1Id_idx` ON `BMMatch` (`tournamentId`, `stage`, `player1Id`);
CREATE INDEX `BMMatch_tournamentId_stage_player2Id_idx` ON `BMMatch` (`tournamentId`, `stage`, `player2Id`);
CREATE UNIQUE INDEX `BMMatch_tournamentId_matchNumber_stage_key` ON `BMMatch` (`tournamentId`, `matchNumber`, `stage`);
CREATE INDEX `BMMatch_tournamentId_stage_completed_idx` ON `BMMatch` (`tournamentId`, `stage`, `completed`);
CREATE INDEX `BMMatch_player1Id_idx` ON `BMMatch` (`player1Id`);
CREATE INDEX `BMMatch_player2Id_idx` ON `BMMatch` (`player2Id`);
CREATE INDEX `BMMatch_tournamentId_updatedAt_idx` ON `BMMatch` (`tournamentId`, `updatedAt`);
CREATE INDEX `MRMatch_tournamentId_stage_player1Id_idx` ON `MRMatch` (`tournamentId`, `stage`, `player1Id`);
CREATE INDEX `MRMatch_tournamentId_stage_player2Id_idx` ON `MRMatch` (`tournamentId`, `stage`, `player2Id`);
CREATE UNIQUE INDEX `MRMatch_tournamentId_matchNumber_stage_key` ON `MRMatch` (`tournamentId`, `matchNumber`, `stage`);
CREATE INDEX `MRMatch_tournamentId_stage_completed_idx` ON `MRMatch` (`tournamentId`, `stage`, `completed`);
CREATE INDEX `MRMatch_player1Id_idx` ON `MRMatch` (`player1Id`);
CREATE INDEX `MRMatch_player2Id_idx` ON `MRMatch` (`player2Id`);
CREATE INDEX `MRMatch_tournamentId_updatedAt_idx` ON `MRMatch` (`tournamentId`, `updatedAt`);
CREATE INDEX `GPMatch_tournamentId_stage_player1Id_idx` ON `GPMatch` (`tournamentId`, `stage`, `player1Id`);
CREATE INDEX `GPMatch_tournamentId_stage_player2Id_idx` ON `GPMatch` (`tournamentId`, `stage`, `player2Id`);
CREATE UNIQUE INDEX `GPMatch_tournamentId_matchNumber_stage_key` ON `GPMatch` (`tournamentId`, `matchNumber`, `stage`);
CREATE INDEX `GPMatch_tournamentId_stage_completed_idx` ON `GPMatch` (`tournamentId`, `stage`, `completed`);
CREATE INDEX `GPMatch_player1Id_idx` ON `GPMatch` (`player1Id`);
CREATE INDEX `GPMatch_player2Id_idx` ON `GPMatch` (`player2Id`);
CREATE INDEX `GPMatch_tournamentId_updatedAt_idx` ON `GPMatch` (`tournamentId`, `updatedAt`);

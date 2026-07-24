// @ts-nocheck - This integration-style test uses compact Prisma/D1 mocks around node:sqlite.

jest.mock('@/lib/prisma');
jest.mock('@/lib/d1-batch');
jest.mock('@/lib/tournament-archive');
jest.mock('@/lib/standings-cache');
jest.mock('@/lib/points/overall-ranking');
jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() })),
}));
jest.mock('@/lib/audit-log', () => ({
  buildAuditLogData: jest.fn((params) => ({
    ...params,
    userId: params.userId ?? null,
  })),
}));

import prisma from '@/lib/prisma';
import { executeD1Batch } from '@/lib/d1-batch';
import { persistTournamentArchive } from '@/lib/tournament-archive';
import { invalidate } from '@/lib/standings-cache';
import { generateRoundRobinSchedule } from '@/lib/round-robin';
import {
  applyCdmQualificationReconciliation,
  previewCdmQualificationReconciliation,
} from '@/lib/cdm-qualification-reconciliation-service';

const { DatabaseSync } = jest.requireActual('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    close: () => void;
    exec: (sql: string) => void;
    prepare: (sql: string) => {
      all: (...values: unknown[]) => Array<Record<string, unknown>>;
      get: (...values: unknown[]) => Record<string, unknown> | undefined;
      run: (...values: unknown[]) => { changes: number | bigint };
    };
  };
};

function tournamentRow() {
  return {
    id: 'cdm-archive',
    name: 'CDM 2025 replica',
    slug: 'cdm-2025-replica',
    status: 'completed',
    qualificationScheduleMethod: 'circle',
    cdmArchiveReconciliationExcluded: false,
    cdmArchiveReconciliationPending: false,
    bmQualificationConfirmed: true,
    mrQualificationConfirmed: false,
    gpQualificationConfirmed: false,
    version: 7,
  };
}

function bmLegacyFixture() {
  const players = Array.from({ length: 8 }, (_, index) => `p${index + 1}`);
  const qualifications = players.map((playerId, index) => ({
    playerId,
    group: 'A',
    seeding: index + 1,
  }));
  const schedule = generateRoundRobinSchedule(players);
  const matches = schedule.matches.map((match, index) => ({
    id: `bm-${index + 1}`,
    tournamentId: 'cdm-archive',
    matchNumber: index + 1,
    roundNumber: match.day,
    stage: 'qualification',
    isBye: match.isBye,
    player1Id: match.player1Id,
    player2Id: match.player2Id,
    player1Side: 1,
    player2Side: 2,
    score1: 3,
    score2: 1,
    completed: true,
    version: 2,
    assignedCourses: ['BC1', 'BC2', 'BC3', 'BC4'],
    rounds: [{ arena: 'BC1', winner: 1 }],
    player1ReportedScore1: 3,
    player1ReportedScore2: 1,
    player2ReportedScore1: 3,
    player2ReportedScore2: 1,
  }));
  return { qualifications, matches };
}

function createDatabase(
  tournament: ReturnType<typeof tournamentRow>,
  matches: ReturnType<typeof bmLegacyFixture>['matches'],
) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE "Tournament" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "slug" TEXT,
      "status" TEXT NOT NULL,
      "qualificationScheduleMethod" TEXT NOT NULL,
      "cdmArchiveReconciliationExcluded" BOOLEAN NOT NULL,
      "cdmArchiveReconciliationPending" BOOLEAN NOT NULL,
      "bmQualificationConfirmed" BOOLEAN NOT NULL,
      "mrQualificationConfirmed" BOOLEAN NOT NULL,
      "gpQualificationConfirmed" BOOLEAN NOT NULL,
      "version" INTEGER NOT NULL,
      "updatedAt" TEXT
    );
    CREATE TABLE "BMMatch" (
      "id" TEXT PRIMARY KEY,
      "tournamentId" TEXT NOT NULL,
      "matchNumber" INTEGER NOT NULL,
      "stage" TEXT NOT NULL,
      "roundNumber" INTEGER,
      "isBye" BOOLEAN NOT NULL,
      "player1Id" TEXT,
      "player2Id" TEXT,
      "player1Side" INTEGER NOT NULL,
      "player2Side" INTEGER NOT NULL,
      "completed" BOOLEAN NOT NULL,
      "score1" INTEGER,
      "score2" INTEGER,
      "assignedCourses" TEXT,
      "rounds" TEXT,
      "player1ReportedScore1" INTEGER,
      "player1ReportedScore2" INTEGER,
      "player2ReportedScore1" INTEGER,
      "player2ReportedScore2" INTEGER,
      "version" INTEGER NOT NULL,
      "updatedAt" TEXT,
      UNIQUE ("tournamentId", "matchNumber", "stage")
    );
    CREATE TABLE "AuditLog" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT,
      "ipAddress" TEXT NOT NULL,
      "userAgent" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "targetId" TEXT,
      "targetType" TEXT,
      "timestamp" TEXT,
      "details" TEXT
    );
  `);

  db.prepare(
    `
    INSERT INTO "Tournament" (
      "id", "name", "slug", "status", "qualificationScheduleMethod",
      "cdmArchiveReconciliationExcluded", "cdmArchiveReconciliationPending",
      "bmQualificationConfirmed", "mrQualificationConfirmed", "gpQualificationConfirmed", "version"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    tournament.id,
    tournament.name,
    tournament.slug,
    tournament.status,
    tournament.qualificationScheduleMethod,
    0,
    0,
    1,
    0,
    0,
    tournament.version,
  );

  const insertMatch = db.prepare(`
    INSERT INTO "BMMatch" (
      "id", "tournamentId", "matchNumber", "stage", "roundNumber", "isBye",
      "player1Id", "player2Id", "player1Side", "player2Side", "completed",
      "score1", "score2", "assignedCourses", "rounds",
      "player1ReportedScore1", "player1ReportedScore2",
      "player2ReportedScore1", "player2ReportedScore2", "version"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const match of matches) {
    insertMatch.run(
      match.id,
      match.tournamentId,
      match.matchNumber,
      match.stage,
      match.roundNumber,
      match.isBye ? 1 : 0,
      match.player1Id,
      match.player2Id,
      match.player1Side,
      match.player2Side,
      match.completed ? 1 : 0,
      match.score1,
      match.score2,
      JSON.stringify(match.assignedCourses),
      JSON.stringify(match.rounds),
      match.player1ReportedScore1,
      match.player1ReportedScore2,
      match.player2ReportedScore1,
      match.player2ReportedScore2,
      match.version,
    );
  }
  return db;
}

function executeSqliteBatch(db: InstanceType<typeof DatabaseSync>) {
  return async (statements: Array<{ sql: string; values: unknown[] }>): Promise<number[]> => {
    const changes: number[] = [];
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const statement of statements) {
        const prepared = db.prepare(statement.sql);
        if (/^\s*SELECT\b/i.test(statement.sql)) {
          prepared.get(...statement.values);
          changes.push(0);
        } else {
          const result = prepared.run(...statement.values);
          changes.push(Number(result.changes));
        }
      }
      db.exec('COMMIT');
      return changes;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
}

describe('CDM reconciliation generated SQL', () => {
  it('rolls back every prior write when a postcondition fails inside the SQLite/D1-style batch', async () => {
    const tournament = tournamentRow();
    const bm = bmLegacyFixture();
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(tournament);
    (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(bm.qualifications);
    (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(bm.matches);
    (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);
    (invalidate as jest.Mock).mockResolvedValue(undefined);

    const preview = await previewCdmQualificationReconciliation(tournament.id);
    const ignoredMatchId = preview.plan.modes.bm.rowsToUpdate[0]?.id;
    expect(ignoredMatchId).toBeTruthy();

    const db = createDatabase(tournament, bm.matches);
    try {
      db.exec(`
        CREATE TRIGGER "ignore_one_temporary_move"
        BEFORE UPDATE OF "matchNumber" ON "BMMatch"
        WHEN OLD."id" = '${ignoredMatchId}' AND NEW."matchNumber" < 0
        BEGIN
          SELECT RAISE(IGNORE);
        END;
      `);
      const beforeMatches = db.prepare('SELECT id, matchNumber, version FROM "BMMatch" ORDER BY id').all();
      const beforeTournament = db
        .prepare(
          'SELECT qualificationScheduleMethod, cdmArchiveReconciliationPending, version FROM "Tournament" WHERE id = ?',
        )
        .get(tournament.id);

      (executeD1Batch as jest.Mock).mockImplementation(executeSqliteBatch(db));

      await expect(
        applyCdmQualificationReconciliation({
          tournamentId: tournament.id,
          expectedDigest: preview.digest,
          audit: { userId: 'admin', ipAddress: '127.0.0.1', userAgent: 'jest' },
        }),
      ).rejects.toMatchObject({ code: 'RECONCILIATION_POSTCONDITION_FAILED' });

      expect(db.prepare('SELECT id, matchNumber, version FROM "BMMatch" ORDER BY id').all()).toEqual(beforeMatches);
      expect(
        db
          .prepare(
            'SELECT qualificationScheduleMethod, cdmArchiveReconciliationPending, version FROM "Tournament" WHERE id = ?',
          )
          .get(tournament.id),
      ).toEqual(beforeTournament);
      expect(db.prepare('SELECT COUNT(*) AS count FROM "AuditLog"').get()).toEqual({ count: 0 });
      expect(persistTournamentArchive).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });
});

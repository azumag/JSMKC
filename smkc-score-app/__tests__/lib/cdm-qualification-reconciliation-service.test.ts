// @ts-nocheck - Prisma and D1 batch mocks deliberately use compact partial shapes.

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
import { invalidateOverallRankingsCache } from '@/lib/points/overall-ranking';
import { generateRoundRobinSchedule } from '@/lib/round-robin';
import {
  applyCdmQualificationReconciliation,
  previewCdmQualificationReconciliation,
} from '@/lib/cdm-qualification-reconciliation-service';

function completedTournament(overrides = {}) {
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
    ...overrides,
  };
}

function bmLegacyFixture(count = 8) {
  const players = Array.from({ length: count }, (_, index) => `p${index + 1}`);
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

function mockModeData({ tournament = completedTournament(), count = 8 } = {}) {
  const bm = bmLegacyFixture(count);
  (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(tournament);
  (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(bm.qualifications);
  (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(bm.matches);
  (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);
  return bm;
}

describe('CDM qualification reconciliation service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (executeD1Batch as jest.Mock).mockResolvedValue([]);
    (invalidate as jest.Mock).mockResolvedValue(undefined);
    (persistTournamentArchive as jest.Mock).mockResolvedValue({ generatedAt: '2026-07-24T15:00:00.000Z' });
  });

  it('refuses persisted JSMKC exclusions before generating a writable preview', async () => {
    mockModeData({
      tournament: completedTournament({
        name: 'Renamed historical event',
        slug: 'renamed-historical-event',
        cdmArchiveReconciliationExcluded: true,
      }),
    });

    await expect(previewCdmQualificationReconciliation('cdm-archive')).rejects.toMatchObject({
      code: 'JSMKC_TOURNAMENT_EXCLUDED',
    });
    expect(executeD1Batch).not.toHaveBeenCalled();
    expect(persistTournamentArchive).not.toHaveBeenCalled();
  });

  it('rejects apply when the preview digest is stale without writing anything', async () => {
    mockModeData();

    await expect(
      applyCdmQualificationReconciliation({
        tournamentId: 'cdm-archive',
        expectedDigest: '0'.repeat(64),
        audit: { userId: 'admin', ipAddress: '127.0.0.1', userAgent: 'jest' },
      }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_STALE_PREVIEW' });
    expect(executeD1Batch).not.toHaveBeenCalled();
    expect(persistTournamentArchive).not.toHaveBeenCalled();
  });

  it('maps an in-batch stale-state guard failure to RECONCILIATION_STALE_PREVIEW', async () => {
    mockModeData();
    const preview = await previewCdmQualificationReconciliation('cdm-archive');
    (executeD1Batch as jest.Mock).mockRejectedValueOnce(
      new Error("JSON path error near '[RECONCILIATION_STALE_PREVIEW'"),
    );

    await expect(
      applyCdmQualificationReconciliation({
        tournamentId: 'cdm-archive',
        expectedDigest: preview.digest,
        audit: { userId: 'admin', ipAddress: '127.0.0.1', userAgent: 'jest' },
      }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_STALE_PREVIEW' });

    expect(persistTournamentArchive).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('atomically remaps existing rows, marks archive pending, then clears it after R2 succeeds', async () => {
    mockModeData();
    const preview = await previewCdmQualificationReconciliation('cdm-archive');

    const result = await applyCdmQualificationReconciliation({
      tournamentId: 'cdm-archive',
      expectedDigest: preview.digest,
      audit: { userId: 'admin', ipAddress: '127.0.0.1', userAgent: 'jest' },
    });

    expect(result).toMatchObject({
      applied: true,
      archivePending: false,
      archiveGeneratedAt: '2026-07-24T15:00:00.000Z',
      requiresScheduleMethodUpdate: true,
    });
    expect(executeD1Batch).toHaveBeenCalledTimes(2);
    const initialStatements = (executeD1Batch as jest.Mock).mock.calls[0][0];
    expect(initialStatements.some((statement) => statement.sql.includes('RECONCILIATION_STALE_PREVIEW'))).toBe(true);
    expect(initialStatements.some((statement) => statement.sql.includes('SET "matchNumber" = -1000000000'))).toBe(true);
    expect(
      initialStatements.some(
        (statement) =>
          statement.sql.includes('cdmArchiveReconciliationPending') && statement.sql.includes('UPDATE "Tournament"'),
      ),
    ).toBe(true);
    expect(initialStatements.some((statement) => statement.values.includes('RECONCILE_QUALIFICATION_SCHEDULE'))).toBe(
      true,
    );
    const completionStatements = (executeD1Batch as jest.Mock).mock.calls[1][0];
    expect(completionStatements.some((statement) => statement.sql.includes('clear-archive-pending'))).toBe(false);
    expect(completionStatements.some((statement) => statement.sql.includes('cdmArchiveReconciliationPending'))).toBe(
      true,
    );
    expect(invalidateOverallRankingsCache).toHaveBeenCalledWith('cdm-archive');
    expect(invalidate).toHaveBeenCalledWith('cdm-archive');
    expect(persistTournamentArchive).toHaveBeenCalledWith('cdm-archive');
  });

  it('leaves a durable pending state and returns a retryable error when R2 regeneration fails', async () => {
    mockModeData();
    const preview = await previewCdmQualificationReconciliation('cdm-archive');
    (persistTournamentArchive as jest.Mock).mockRejectedValueOnce(new Error('R2 write failed'));

    await expect(
      applyCdmQualificationReconciliation({
        tournamentId: 'cdm-archive',
        expectedDigest: preview.digest,
        audit: { userId: 'admin', ipAddress: '127.0.0.1', userAgent: 'jest' },
      }),
    ).rejects.toMatchObject({
      code: 'ARCHIVE_REGENERATION_PENDING',
      details: { scheduleApplied: true, archivePending: true, retryable: true },
    });

    expect(executeD1Batch).toHaveBeenCalledTimes(1);
    const initialStatements = (executeD1Batch as jest.Mock).mock.calls[0][0];
    expect(initialStatements.some((statement) => statement.sql.includes('cdmArchiveReconciliationPending'))).toBe(true);
  });

  it('retries archive generation without rewriting matches when the CDM schedule already matches', async () => {
    const players = Array.from({ length: 8 }, (_, index) => `p${index + 1}`);
    const qualifications = players.map((playerId, index) => ({ playerId, group: 'A', seeding: index + 1 }));
    const schedule = generateRoundRobinSchedule(players, { method: 'cdm' });
    const matches = schedule.matches.map((match, index) => ({
      id: `bm-${index + 1}`,
      matchNumber: index + 1,
      roundNumber: match.day,
      stage: 'qualification',
      isBye: false,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
      player1Side: 1,
      player2Side: 2,
      score1: 3,
      score2: 1,
      completed: true,
      version: 2,
    }));
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(
      completedTournament({ qualificationScheduleMethod: 'cdm', cdmArchiveReconciliationPending: true }),
    );
    (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(qualifications);
    (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(matches);
    (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);

    const preview = await previewCdmQualificationReconciliation('cdm-archive');
    expect(preview.totalChanges).toBe(0);
    const result = await applyCdmQualificationReconciliation({
      tournamentId: 'cdm-archive',
      expectedDigest: preview.digest,
      audit: { userId: 'admin', ipAddress: '127.0.0.1', userAgent: 'jest' },
    });

    expect(result.applied).toBe(false);
    expect(result.archivePending).toBe(false);
    expect(executeD1Batch).toHaveBeenCalledTimes(2);
    const initialStatements = (executeD1Batch as jest.Mock).mock.calls[0][0];
    expect(initialStatements.some((statement) => statement.sql.includes('SET "matchNumber" = -1000000000'))).toBe(
      false,
    );
    expect(persistTournamentArchive).toHaveBeenCalledWith('cdm-archive');
  });
});

// @ts-nocheck - Prisma and D1 batch mocks deliberately use compact partial shapes.

jest.mock('@/lib/prisma');
jest.mock('@/lib/d1-batch');
jest.mock('@/lib/tournament-archive');
jest.mock('@/lib/standings-cache');
jest.mock('@/lib/points/overall-ranking');
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
    (invalidate as jest.Mock).mockResolvedValue(undefined);
    (persistTournamentArchive as jest.Mock).mockResolvedValue({ generatedAt: '2026-07-24T15:00:00.000Z' });
  });

  it('refuses JSMKC tournaments before generating a writable preview', async () => {
    mockModeData({
      tournament: completedTournament({ name: 'JSMKC 2025', slug: 'jsmkc-2025' }),
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

  it('atomically remaps existing rows, records an audit entry, and regenerates the archive', async () => {
    mockModeData();
    const preview = await previewCdmQualificationReconciliation('cdm-archive');
    (executeD1Batch as jest.Mock).mockResolvedValue([0, 0, 28, 28, 1, 1]);

    const result = await applyCdmQualificationReconciliation({
      tournamentId: 'cdm-archive',
      expectedDigest: preview.digest,
      audit: { userId: 'admin', ipAddress: '127.0.0.1', userAgent: 'jest' },
    });

    expect(result).toMatchObject({
      applied: true,
      archiveGeneratedAt: '2026-07-24T15:00:00.000Z',
      requiresScheduleMethodUpdate: true,
    });
    expect(executeD1Batch).toHaveBeenCalledTimes(1);
    const statements = (executeD1Batch as jest.Mock).mock.calls[0][0];
    expect(statements).toHaveLength(6);
    expect(statements[0].sql).toContain('SELECT json_extract');
    expect(statements[0].sql).toContain('qualificationScheduleMethod');
    expect(statements[1].sql).toContain('json_array_length');
    expect(statements[1].sql).toContain('actual."version"');
    expect(statements[2].sql).toContain('SET "matchNumber" = -1000000000');
    expect(statements[3].sql).toContain('UPDATE "BMMatch"');
    expect(statements[4].sql).toContain('qualificationScheduleMethod');
    expect(statements[5].sql).toContain('INSERT INTO "AuditLog"');
    expect(statements[5].values).toContain('RECONCILE_QUALIFICATION_SCHEDULE');
    expect(invalidateOverallRankingsCache).toHaveBeenCalledWith('cdm-archive');
    expect(invalidate).toHaveBeenCalledWith('cdm-archive');
    expect(persistTournamentArchive).toHaveBeenCalledWith('cdm-archive');
  });

  it('rolls back and skips archive regeneration when an in-batch state guard fails', async () => {
    mockModeData();
    const preview = await previewCdmQualificationReconciliation('cdm-archive');
    (executeD1Batch as jest.Mock).mockRejectedValue(new Error('malformed JSON'));

    await expect(
      applyCdmQualificationReconciliation({
        tournamentId: 'cdm-archive',
        expectedDigest: preview.digest,
        audit: { userId: 'admin', ipAddress: '127.0.0.1', userAgent: 'jest' },
      }),
    ).rejects.toThrow('malformed JSON');

    expect(persistTournamentArchive).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('does not rewrite matches when a completed CDM schedule already matches, but refreshes the archive', async () => {
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
      completedTournament({ qualificationScheduleMethod: 'cdm' }),
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
    expect(executeD1Batch).not.toHaveBeenCalled();
    expect(persistTournamentArchive).toHaveBeenCalledWith('cdm-archive');
  });
});

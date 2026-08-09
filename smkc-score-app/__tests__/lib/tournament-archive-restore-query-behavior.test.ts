import prisma from '@/lib/prisma';
import { restoreTournamentArchiveForReopen, RESTORED_TOURNAMENT_SELECT } from '@/lib/tournament-archive-restore';
import type { TournamentArchiveBundle } from '@/lib/tournament-archive';

function makeMinimalArchive(): TournamentArchiveBundle {
  return {
    schemaVersion: 2,
    generatedAt: '2026-07-12T00:00:00.000Z',
    tournament: {
      id: 'archived-query-behavior',
      slug: 'archived-query-behavior',
      name: 'Archived Query Behavior',
      date: '2026-07-01T00:00:00.000Z',
      status: 'completed',
      publicModes: ['ta'],
      frozenStages: [],
      taPlayerSelfEdit: false,
      taBattleRoyaleMode: false,
      bmQualificationConfirmed: false,
      mrQualificationConfirmed: false,
      gpQualificationConfirmed: false,
      bmFinalsSeedSnapshot: null,
      mrFinalsSeedSnapshot: null,
      gpFinalsSeedSnapshot: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-12T00:00:00.000Z',
    },
    allPlayers: [],
    modes: {
      ta: { entries: [], phaseRounds: [] },
      bm: { qualifications: [], matches: [], qualificationConfirmed: false },
      mr: { qualifications: [], matches: [], qualificationConfirmed: false },
      gp: { qualifications: [], matches: [], qualificationConfirmed: false },
    },
    overallRanking: {
      tournamentId: 'archived-query-behavior',
      tournamentName: 'Archived Query Behavior',
      lastUpdated: '2026-07-12T00:00:00.000Z',
      rankings: [],
    },
    archived: true,
  } as TournamentArchiveBundle;
}

describe('restoreTournamentArchiveForReopen query behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (prisma.tournament.create as jest.Mock).mockResolvedValue({ id: 'archived-query-behavior' });
    (prisma.tournament.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

    for (const model of [
      prisma.bMQualification,
      prisma.mRQualification,
      prisma.gPQualification,
      prisma.bMMatch,
      prisma.mRMatch,
      prisma.gPMatch,
      prisma.tTEntry,
      prisma.tTPhaseRound,
      prisma.tournamentPlayerScore,
    ]) {
      (model.createMany as jest.Mock).mockResolvedValue({ count: 0 });
    }
  });

  it('retries a transient existing-tournament read and returns the projected create result', async () => {
    const restoredTournament = {
      id: 'archived-query-behavior',
      slug: 'archived-query-behavior',
      name: 'Archived Query Behavior',
      date: new Date('2026-07-01T00:00:00.000Z'),
      status: 'active',
      taPlayerSelfEdit: false,
      taBattleRoyaleMode: false,
      frozenStages: [],
      qualificationConfirmed: false,
      bmQualificationConfirmed: false,
      mrQualificationConfirmed: false,
      gpQualificationConfirmed: false,
      publicModes: [],
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-12T00:00:00.000Z'),
    };

    (prisma.tournament.findUnique as jest.Mock)
      .mockRejectedValueOnce(new Error('D1 temporarily unavailable'))
      .mockResolvedValueOnce(null);
    (prisma.tournament.create as jest.Mock).mockResolvedValue(restoredTournament);

    const result = await restoreTournamentArchiveForReopen(makeMinimalArchive());

    /* Issue #2913: the existing-tournament read retries once (reject ->
     * null); the restored row is returned directly from tournament.create's
     * select projection, so no trailing findUnique lookup is issued. */
    expect(prisma.tournament.findUnique).toHaveBeenCalledTimes(2);
    for (const call of (prisma.tournament.findUnique as jest.Mock).mock.calls) {
      expect(call[0]).toEqual({
        where: { id: 'archived-query-behavior' },
        select: RESTORED_TOURNAMENT_SELECT,
      });
    }
    expect(prisma.tournament.create).toHaveBeenCalledWith(
      expect.objectContaining({ select: RESTORED_TOURNAMENT_SELECT }),
    );
    expect(result.tournament).toEqual(restoredTournament);
  });
});

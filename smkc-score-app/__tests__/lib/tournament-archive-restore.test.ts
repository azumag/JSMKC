import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { chunkRowsForD1, restoreTournamentArchiveForReopen } from '@/lib/tournament-archive-restore';
import type { TournamentArchiveBundle } from '@/lib/tournament-archive';

const player = {
  id: 'player-1',
  name: 'Player One',
  nickname: 'p1',
  country: 'JP',
  noCamera: false,
  taHandicapSeconds: -1,
};

function makeArchive(): TournamentArchiveBundle {
  return {
    schemaVersion: 2,
    generatedAt: '2026-07-11T00:00:00.000Z',
    tournament: {
      id: 'archived-1',
      slug: 'archived-one',
      name: 'Archived Tournament',
      date: '2026-07-01T00:00:00.000Z',
      status: 'completed',
      publicModes: ['ta', 'bm'],
      frozenStages: ['qualification'],
      taPlayerSelfEdit: true,
      taBattleRoyaleMode: false,
      bmQualificationConfirmed: true,
      mrQualificationConfirmed: false,
      gpQualificationConfirmed: false,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z',
    },
    allPlayers: [player],
    modes: {
      ta: {
        entries: [
          {
            id: 'tt-1',
            tournamentId: 'archived-1',
            playerId: 'player-1',
            stage: 'qualification',
            lives: 3,
            eliminated: false,
            seeding: 1,
            partnerId: null,
            taHandicapSeconds: -1,
            times: { MC1: '1:00.00' },
            totalTime: 60000,
            rank: 1,
            courseScores: { MC1: 1000 },
            qualificationPoints: 1000,
            deletedAt: null,
            version: 0,
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
            player,
          },
        ],
        phaseRounds: [],
        rules: {
          mode: 'standard',
          initialLives: 3,
          lifeResetThresholds: [8, 4, 2],
          survivorsNeeded: 1,
          handicapEnabled: false,
          allowedHandicapSeconds: [0, -1, -3, -5],
          retryAppliesHandicap: false,
        },
      },
      bm: {
        qualifications: [
          {
            id: 'bmq-1',
            tournamentId: 'archived-1',
            playerId: 'player-1',
            group: 'A',
            seeding: 1,
            mp: 1,
            wins: 1,
            ties: 0,
            losses: 0,
            winRounds: 4,
            lossRounds: 0,
            points: 4,
            score: 2,
            rankOverride: null,
            combinedRankOverride: null,
            deletedAt: null,
            version: 0,
            player,
            _rank: 1,
          },
        ],
        matches: [
          {
            id: 'bmm-1',
            tournamentId: 'archived-1',
            matchNumber: 1,
            stage: 'qualification',
            round: null,
            tvNumber: null,
            roundNumber: 1,
            isBye: false,
            player1Id: 'player-1',
            player1Side: 1,
            player2Id: 'player-1',
            player2Side: 2,
            score1: 4,
            score2: 0,
            completed: true,
            assignedCourses: null,
            rounds: null,
            startingCourseNumber: 1,
            bracket: null,
            bracketPosition: null,
            losses: 0,
            isGrandFinal: false,
            deletedAt: null,
            version: 0,
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
            player1: player,
            player2: player,
          },
        ],
        qualificationConfirmed: true,
      },
      mr: { qualifications: [], matches: [], qualificationConfirmed: false },
      gp: { qualifications: [], matches: [], qualificationConfirmed: false },
    },
    overallRanking: {
      tournamentId: 'archived-1',
      tournamentName: 'Archived Tournament',
      lastUpdated: '2026-07-11T00:00:00.000Z',
      rankings: [
        {
          playerId: 'player-1',
          playerName: 'Player One',
          playerNickname: 'p1',
          playerCountry: 'JP',
          taQualificationPoints: 1000,
          bmQualificationPoints: 1000,
          mrQualificationPoints: 0,
          gpQualificationPoints: 0,
          taFinalsPoints: 0,
          bmFinalsPoints: 0,
          mrFinalsPoints: 0,
          gpFinalsPoints: 0,
          totalPoints: 2000,
          overallRank: 1,
        },
      ],
    },
    archived: true,
  } as TournamentArchiveBundle;
}

describe('chunkRowsForD1', () => {
  it('keeps every createMany statement below the D1 bound-parameter limit', () => {
    const rows = Array.from({ length: 7 }, (_, rowIndex) =>
      Object.fromEntries(Array.from({ length: 30 }, (_, columnIndex) => [`field${columnIndex}`, `${rowIndex}`])),
    );

    const chunks = chunkRowsForD1(rows);

    expect(chunks.map((chunk) => chunk.length)).toEqual([2, 2, 2, 1]);
    for (const chunk of chunks) {
      const bindings = chunk.reduce(
        (total, row) => total + Object.values(row).filter((value) => value !== undefined).length,
        0,
      );
      expect(bindings).toBeLessThanOrEqual(80);
    }
  });
});

describe('restoreTournamentArchiveForReopen', () => {
  beforeEach(() => {
    const playerFindUnique = prisma.player.findUnique as jest.Mock;
    const playerCreate = prisma.player.create as jest.Mock;
    const tournamentCreate = prisma.tournament.create as jest.Mock;
    const tournamentFindUnique = prisma.tournament.findUnique as jest.Mock;
    const tournamentDeleteMany = prisma.tournament.deleteMany as jest.Mock;

    playerFindUnique.mockReset().mockResolvedValue(null);
    playerCreate.mockReset().mockResolvedValue({ id: 'player-1' });
    tournamentCreate.mockReset().mockResolvedValue({ id: 'archived-1' });
    tournamentFindUnique
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'archived-1', status: 'active', publicModes: [] });
    tournamentDeleteMany.mockReset();

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
      (model.createMany as jest.Mock).mockReset().mockResolvedValue({ count: 1 });
    }
  });

  it('recreates the tournament as active and restores archived competition rows', async () => {
    const restored = await restoreTournamentArchiveForReopen(makeArchive());

    expect(prisma.tournament.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'archived-1',
        slug: 'archived-one',
        status: 'active',
        publicModes: [],
        bmQualificationConfirmed: true,
      }),
    });
    expect(prisma.player.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: 'player-1', nickname: 'p1', taHandicapSeconds: -1 }),
      select: { id: true },
    });
    expect(prisma.bMQualification.createMany).toHaveBeenCalledWith({
      data: [expect.not.objectContaining({ player: expect.anything(), _rank: expect.anything() })],
    });
    expect(prisma.bMMatch.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          assignedCourses: Prisma.DbNull,
          rounds: Prisma.DbNull,
        }),
      ],
    });
    expect(prisma.tTEntry.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ tournamentId: 'archived-1', playerId: 'player-1' })],
    });
    expect(prisma.tournamentPlayerScore.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ tournamentId: 'archived-1', totalPoints: 2000 })],
    });
    expect(restored.tournament).toEqual({ id: 'archived-1', status: 'active', publicModes: [] });
  });

  it('normalizes nullable TA JSON columns to database NULL', async () => {
    const archive = makeArchive();
    const entry = archive.modes.ta.entries?.[0];
    if (!entry) throw new Error('Missing TA fixture entry');
    entry.times = null;
    entry.courseScores = null;

    await restoreTournamentArchiveForReopen(archive);

    expect(prisma.tTEntry.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ times: Prisma.DbNull, courseScores: Prisma.DbNull })],
    });
  });

  it('labels tournament creation failures before child rows are restored', async () => {
    (prisma.tournament.create as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );

    await expect(restoreTournamentArchiveForReopen(makeArchive())).rejects.toMatchObject({
      restoreStage: 'tournament',
      code: 'P2002',
    });
    expect(prisma.bMQualification.createMany).not.toHaveBeenCalled();
  });

  it('removes a partially restored tournament when a child-row restore fails', async () => {
    (prisma.bMQualification.createMany as jest.Mock).mockRejectedValueOnce(new Error('D1 write failed'));
    (prisma.tournament.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    await expect(restoreTournamentArchiveForReopen(makeArchive())).rejects.toThrow(
      'Archive restore failed at BM qualifications',
    );
    expect(prisma.tournament.deleteMany).toHaveBeenCalledWith({ where: { id: 'archived-1' } });
  });
});

/**
 * Unit tests for fetchQualInitialData (src/lib/api-factories/qual-initial-data.ts).
 *
 * Covers:
 * - TC-2569: tournament not found → null
 * - TC-2570: BM happy path → returns ranked qualifications, matches, allPlayers
 * - TC-2571: bmQualificationConfirmed=true → qualificationConfirmed=true
 * - TC-2572: Prisma error → swallowed, returns null
 * - TC-2573: GP config → uses gPQualification and gPMatch models
 * - TC-2574: gpQualificationConfirmed=true → qualificationConfirmed=true for GP config
 * - TC-2575: mrQualificationConfirmed=true → qualificationConfirmed=true for MR config
 * - TC-2576: MR config → uses mRQualification and mRMatch models
 *
 * All DB calls and computeQualificationRanks are mocked to isolate the function.
 * Uses // @ts-nocheck because the manual prisma mock does not carry full PrismaClient
 * TypeScript types; all method calls are typed via `as jest.Mock` casts instead.
 */
// @ts-nocheck

jest.mock('@/lib/prisma');
jest.mock('@/lib/server-ranking', () => ({
  computeQualificationRanks: jest.fn(),
}));

import { fetchQualInitialData } from '@/lib/api-factories/qual-initial-data';
import prisma from '@/lib/prisma';
import { computeQualificationRanks } from '@/lib/server-ranking';
import { bmConfig } from '@/lib/event-types/bm-config';
import { gpConfig } from '@/lib/event-types/gp-config';
import { mrConfig } from '@/lib/event-types/mr-config';

const mockPrisma = prisma;
const mockComputeRanks = jest.mocked(computeQualificationRanks);

const TOURNAMENT = {
  id: 'tournament-1',
  bmQualificationConfirmed: false,
  mrQualificationConfirmed: false,
  gpQualificationConfirmed: false,
};

const PLAYER = { id: 'p1', nickname: 'Player1' };
const QUALIFICATION = { id: 'q1', tournamentId: 'tournament-1', player: PLAYER };
const MATCH = { id: 'm1', tournamentId: 'tournament-1' };

beforeEach(() => {
  jest.clearAllMocks();
  // Default BM setup: tournament found, BM models return test fixtures, ranks mirrors qualifications.
  (mockPrisma.tournament.findFirst as jest.Mock).mockResolvedValue(TOURNAMENT);
  (mockPrisma.bMQualification.findMany as jest.Mock).mockResolvedValue([QUALIFICATION]);
  (mockPrisma.bMMatch.findMany as jest.Mock).mockResolvedValue([MATCH]);
  (mockPrisma.player.findMany as jest.Mock).mockResolvedValue([PLAYER]);
  mockComputeRanks.mockReturnValue([QUALIFICATION]);
});

describe('fetchQualInitialData', () => {
  it('TC-2569: returns null when tournament is not found', async () => {
    (mockPrisma.tournament.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await fetchQualInitialData(bmConfig, 'nonexistent');

    expect(result).toBeNull();
    expect(mockPrisma.bMQualification.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.bMMatch.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.player.findMany).not.toHaveBeenCalled();
  });

  it('TC-2570: BM happy path — returns ranked qualifications, matches, and allPlayers', async () => {
    const rankedQuals = [{ ...QUALIFICATION, rank: 1 }];
    mockComputeRanks.mockReturnValue(rankedQuals);

    const result = await fetchQualInitialData(bmConfig, 'tournament-1');

    expect(result).not.toBeNull();
    expect(result!.qualifications).toEqual(rankedQuals);
    expect(result!.matches).toEqual([MATCH]);
    expect(result!.allPlayers).toEqual([PLAYER]);
    expect(result!.qualificationConfirmed).toBe(false);
    expect(mockComputeRanks).toHaveBeenCalledWith(
      [QUALIFICATION],
      bmConfig.qualificationOrderBy,
      [MATCH],
      { matchScoreFields: bmConfig.matchScoreFields },
    );
  });

  it('TC-2571: returns qualificationConfirmed=true when bmQualificationConfirmed is true', async () => {
    (mockPrisma.tournament.findFirst as jest.Mock).mockResolvedValue({
      ...TOURNAMENT,
      bmQualificationConfirmed: true,
    });

    const result = await fetchQualInitialData(bmConfig, 'tournament-1');

    expect(result!.qualificationConfirmed).toBe(true);
  });

  it('TC-2572: swallows Prisma error and returns null', async () => {
    (mockPrisma.bMQualification.findMany as jest.Mock).mockRejectedValue(
      new Error('DB connection failed'),
    );

    const result = await fetchQualInitialData(bmConfig, 'tournament-1');

    expect(result).toBeNull();
  });

  it('TC-2573: GP config uses gPQualification and gPMatch models', async () => {
    (mockPrisma.gPQualification.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);
    mockComputeRanks.mockReturnValue([]);

    const result = await fetchQualInitialData(gpConfig, 'tournament-1');

    expect(result).not.toBeNull();
    expect(mockPrisma.gPQualification.findMany).toHaveBeenCalled();
    expect(mockPrisma.gPMatch.findMany).toHaveBeenCalled();
    expect(mockPrisma.bMQualification.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.bMMatch.findMany).not.toHaveBeenCalled();
  });

  it('TC-2574: returns qualificationConfirmed=true when gpQualificationConfirmed is true', async () => {
    (mockPrisma.tournament.findFirst as jest.Mock).mockResolvedValue({
      ...TOURNAMENT,
      gpQualificationConfirmed: true,
    });
    (mockPrisma.gPQualification.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);
    mockComputeRanks.mockReturnValue([]);

    const result = await fetchQualInitialData(gpConfig, 'tournament-1');

    expect(result!.qualificationConfirmed).toBe(true);
  });

  it('TC-2575: returns qualificationConfirmed=true when mrQualificationConfirmed is true', async () => {
    (mockPrisma.tournament.findFirst as jest.Mock).mockResolvedValue({
      ...TOURNAMENT,
      mrQualificationConfirmed: true,
    });
    (mockPrisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);
    mockComputeRanks.mockReturnValue([]);

    const result = await fetchQualInitialData(mrConfig, 'tournament-1');

    expect(result!.qualificationConfirmed).toBe(true);
  });

  it('TC-2576: MR config uses mRQualification and mRMatch models', async () => {
    (mockPrisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);
    mockComputeRanks.mockReturnValue([]);

    const result = await fetchQualInitialData(mrConfig, 'tournament-1');

    expect(result).not.toBeNull();
    expect(mockPrisma.mRQualification.findMany).toHaveBeenCalled();
    expect(mockPrisma.mRMatch.findMany).toHaveBeenCalled();
    expect(mockPrisma.bMQualification.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.bMMatch.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.gPQualification.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.gPMatch.findMany).not.toHaveBeenCalled();
  });
});

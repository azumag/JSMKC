import prisma from '@/lib/prisma';
import { ensureFinalsSeedSnapshot, resolveFinalsSeedSnapshot } from '@/lib/finals-seed-snapshot';
import { generateBracketStructure, generatePlayoffStructure } from '@/lib/double-elimination';

jest.mock('@/lib/prisma');

const player = (id: string) => ({ id, name: id, nickname: id, country: null, noCamera: false });
const row = (
  matchNumber: number,
  stage: string,
  round: string,
  player1Id: string,
  player2Id: string,
  slotOverrideAt: Date | null = null,
) => ({
  matchNumber,
  stage,
  round,
  player1Id,
  player2Id,
  player1: player(player1Id),
  player2: player(player2Id),
  slotOverrideAt,
});

const partialTop24Playoff = () =>
  generatePlayoffStructure(12, 2).map((match) => {
    if (match.round === 'playoff_r1') {
      return row(match.matchNumber, 'playoff', match.round, `p${match.player1Seed}`, `p${match.player2Seed}`);
    }
    return row(match.matchNumber, 'playoff', match.round, `p${match.player1Seed}`, 'placeholder');
  });

describe('ensureFinalsSeedSnapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({
      status: 'completed',
      bmFinalsSeedSnapshot: null,
    });
    (prisma.tournament.update as jest.Mock).mockResolvedValue({});
  });

  it('backfills a legacy standard bracket from opening rows without qualification ranking', async () => {
    const opening = generateBracketStructure(8)
      .filter((match) => match.round === 'winners_qf')
      .map((match) => row(match.matchNumber, 'finals', 'winners_qf', `p${match.player1Seed}`, `p${match.player2Seed}`));
    (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(opening);

    const snapshot = await ensureFinalsSeedSnapshot('t1', 'bm');

    expect(snapshot.map((entry) => [entry.originalSeed, entry.playerId])).toEqual(
      Array.from({ length: 8 }, (_, index) => [index + 1, `p${index + 1}`]),
    );
    expect(prisma.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bmFinalsSeedSnapshot: snapshot }) }),
    );
    expect(prisma.bMQualification.findMany).not.toHaveBeenCalled();
  });

  it('backfills all 24 Top-24 entrants from playoff and upper opening rows', async () => {
    const playoff = generatePlayoffStructure(12, 2).flatMap((match) => {
      if (match.round === 'playoff_r1') {
        return [row(match.matchNumber, 'playoff', match.round, `p${match.player1Seed}`, `p${match.player2Seed}`)];
      }
      return [row(match.matchNumber, 'playoff', match.round, `p${match.player1Seed}`, 'placeholder')];
    });
    const finals = generateBracketStructure(16, 2)
      .filter((match) => match.round === 'winners_r1')
      .map((match) => row(match.matchNumber, 'finals', match.round, `p${match.player1Seed}`, `p${match.player2Seed}`));
    (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([...playoff, ...finals]);
    (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([{ group: 'A' }, { group: 'B' }]);

    const snapshot = await ensureFinalsSeedSnapshot('t1', 'bm');

    expect(snapshot).toHaveLength(24);
    expect(snapshot).toEqual(expect.arrayContaining([expect.objectContaining({ originalSeed: 1, playerId: 'p1' })]));
    expect(snapshot).toEqual(expect.arrayContaining([expect.objectContaining({ originalSeed: 24, playerId: 'p24' })]));
  });

  it('does not persist a partial Top-24 snapshot when only Phase 1 exists', async () => {
    (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(partialTop24Playoff());
    (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([{ group: 'A' }, { group: 'B' }]);

    await expect(ensureFinalsSeedSnapshot('t1', 'bm')).resolves.toEqual([]);
    expect(prisma.tournament.update).not.toHaveBeenCalled();
  });

  it('does not fossilize a legacy manual slot adjustment as an original seed', async () => {
    const opening = generateBracketStructure(8)
      .filter((match) => match.round === 'winners_qf')
      .map((match, index) =>
        row(
          match.matchNumber,
          'finals',
          'winners_qf',
          `p${match.player1Seed}`,
          `p${match.player2Seed}`,
          index === 0 ? new Date('2026-01-01T00:00:00.000Z') : null,
        ),
      );
    (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(opening);

    await expect(ensureFinalsSeedSnapshot('t1', 'bm')).resolves.toEqual([]);
    expect(prisma.tournament.update).not.toHaveBeenCalled();
  });

  it('marks an incomplete completed-tournament opening round as unsafe', async () => {
    (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([row(1, 'finals', 'winners_qf', 'p1', 'p8')]);

    await expect(resolveFinalsSeedSnapshot('t1', 'bm')).resolves.toEqual({
      status: 'unsafe',
      snapshot: [],
      reason: 'incomplete_opening_round',
    });
    expect(prisma.tournament.update).not.toHaveBeenCalled();
  });

  it.each(['draft', 'active'] as const)(
    'treats an incomplete opening round as absent while tournament status is %s',
    async (status) => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({
        status,
        bmFinalsSeedSnapshot: null,
      });
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([row(1, 'finals', 'winners_qf', 'p1', 'p8')]);

      await expect(resolveFinalsSeedSnapshot('t1', 'bm')).resolves.toEqual({
        status: 'absent',
        snapshot: [],
      });
      expect(prisma.tournament.update).not.toHaveBeenCalled();
    },
  );

  it('treats a partial Top-24 bracket as absent while the tournament is active', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({
      status: 'active',
      bmFinalsSeedSnapshot: null,
    });
    (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(partialTop24Playoff());
    (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([{ group: 'A' }, { group: 'B' }]);

    await expect(resolveFinalsSeedSnapshot('t1', 'bm')).resolves.toEqual({
      status: 'absent',
      snapshot: [],
    });
    expect(prisma.tournament.update).not.toHaveBeenCalled();
  });

  it('treats a manual slot override as absent while the tournament is active', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({
      status: 'active',
      bmFinalsSeedSnapshot: null,
    });
    (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([
      row(1, 'finals', 'winners_qf', 'p1', 'p8', new Date('2026-07-24T00:00:00.000Z')),
    ]);

    await expect(resolveFinalsSeedSnapshot('t1', 'bm')).resolves.toEqual({
      status: 'absent',
      snapshot: [],
    });
    expect(prisma.tournament.update).not.toHaveBeenCalled();
  });
});

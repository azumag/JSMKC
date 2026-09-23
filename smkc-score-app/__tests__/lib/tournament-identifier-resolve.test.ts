import prisma from '@/lib/prisma';
import { resolveTournament } from '@/lib/tournament-identifier';

describe('resolveTournament', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('folds identifier resolution and the requested projection into one query', async () => {
    (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({
      id: 't1',
      frozenStages: '[]',
    });

    await expect(resolveTournament('jsmkc2026', { frozenStages: true })).resolves.toEqual({
      id: 't1',
      frozenStages: '[]',
    });

    expect(prisma.tournament.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.tournament.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ id: 'jsmkc2026' }, { slug: 'jsmkc2026' }],
      },
      select: {
        frozenStages: true,
        id: true,
      },
    });
  });

  it('returns null unchanged when neither id nor slug resolves', async () => {
    (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(resolveTournament('missing-tournament', { status: true })).resolves.toBeNull();
    expect(prisma.tournament.findFirst).toHaveBeenCalledTimes(1);
  });
});

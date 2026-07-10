import {
  TaEntryNotFoundError,
  TaHandicapUpdateConflictError,
  updateQualificationHandicaps,
} from '@/lib/ta/handicap-service';

type MockEntry = Record<string, unknown>;

function makePrisma({
  current = [],
  updated = [],
  affected = 0,
}: {
  current?: MockEntry[];
  updated?: MockEntry[];
  affected?: number;
} = {}) {
  return {
    tTEntry: {
      findMany: jest.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(updated),
    },
    $executeRaw: jest.fn().mockResolvedValue(affected),
  };
}

describe('updateQualificationHandicaps', () => {
  it('updates all requested qualification entries atomically and returns previous values', async () => {
    const current = [
      { id: 'e1', playerId: 'p1', taHandicapSeconds: -1, player: { id: 'p1', nickname: 'P1' } },
      { id: 'e2', playerId: 'p2', taHandicapSeconds: 99, player: { id: 'p2', nickname: 'P2' } },
    ];
    const updated = [
      { ...current[0], taHandicapSeconds: -3 },
      { ...current[1], taHandicapSeconds: -5 },
    ];
    const prisma = makePrisma({ current, updated, affected: 2 });

    const result = await updateQualificationHandicaps(prisma as never, 't1', [
      { entryId: 'e1', taHandicapSeconds: -3 },
      { entryId: 'e2', taHandicapSeconds: -5 },
    ]);

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(result.entries).toEqual(updated);
    expect(result.previousById.get('e1')).toBe(-1);
    expect(result.previousById.get('e2')).toBe(0);
  });

  it('rejects duplicate or missing entry IDs before returning partial success', async () => {
    const prisma = makePrisma();
    await expect(
      updateQualificationHandicaps(prisma as never, 't1', [
        { entryId: 'e1', taHandicapSeconds: 0 },
        { entryId: 'e1', taHandicapSeconds: -1 },
      ]),
    ).rejects.toThrow('Duplicate entry IDs');

    const missing = makePrisma({ current: [{ id: 'e1', taHandicapSeconds: 0 }], affected: 1 });
    await expect(
      updateQualificationHandicaps(missing as never, 't1', [
        { entryId: 'e1', taHandicapSeconds: 0 },
        { entryId: 'e2', taHandicapSeconds: -1 },
      ]),
    ).rejects.toBeInstanceOf(TaEntryNotFoundError);
  });

  it('reports a write conflict when the affected row count changes', async () => {
    const current = [{ id: 'e1', playerId: 'p1', taHandicapSeconds: 0, player: { nickname: 'P1' } }];
    const prisma = makePrisma({ current, affected: 0 });
    await expect(
      updateQualificationHandicaps(prisma as never, 't1', [{ entryId: 'e1', taHandicapSeconds: -1 }]),
    ).rejects.toBeInstanceOf(TaHandicapUpdateConflictError);
  });
});

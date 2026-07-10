import { Prisma, type PrismaClient } from '@prisma/client';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import { normalizeTaHandicapSeconds, type TaHandicapSeconds } from '@/lib/ta/battle-royale';

export interface HandicapUpdate {
  entryId: string;
  taHandicapSeconds: TaHandicapSeconds;
}

export class TaEntryNotFoundError extends Error {
  constructor() {
    super('One or more TA qualification entries were not found');
    this.name = 'TaEntryNotFoundError';
  }
}

export class TaHandicapUpdateConflictError extends Error {
  constructor() {
    super('TA handicap update conflicted with another update');
    this.name = 'TaHandicapUpdateConflictError';
  }
}

export async function updateQualificationHandicaps(
  prisma: PrismaClient,
  tournamentId: string,
  updates: readonly HandicapUpdate[],
) {
  if (updates.length === 0) return { entries: [], previousById: new Map<string, TaHandicapSeconds>() };

  const uniqueIds = new Set(updates.map((update) => update.entryId));
  if (uniqueIds.size !== updates.length) {
    throw new Error('Duplicate entry IDs are not allowed');
  }

  const currentEntries = await prisma.tTEntry.findMany({
    where: {
      tournamentId,
      stage: 'qualification',
      id: { in: [...uniqueIds] },
    },
    select: {
      id: true,
      playerId: true,
      taHandicapSeconds: true,
      player: { select: PLAYER_PUBLIC_SELECT },
    },
  });
  if (currentEntries.length !== updates.length) {
    throw new TaEntryNotFoundError();
  }

  const previousById = new Map(
    currentEntries.map((entry) => [entry.id, normalizeTaHandicapSeconds(entry.taHandicapSeconds)]),
  );
  const whenClauses = updates.map((update) => Prisma.sql`WHEN ${update.entryId} THEN ${update.taHandicapSeconds}`);
  const ids = updates.map((update) => update.entryId);
  const affected = await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "TTEntry"
      SET "taHandicapSeconds" = CASE "id"
        ${Prisma.join(whenClauses, ' ')}
        ELSE "taHandicapSeconds"
      END,
      "version" = "version" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
      WHERE "tournamentId" = ${tournamentId}
        AND "stage" = 'qualification'
        AND "id" IN (${Prisma.join(ids)})
    `,
  );
  if (Number(affected) !== updates.length) {
    throw new TaHandicapUpdateConflictError();
  }

  const entries = await prisma.tTEntry.findMany({
    where: { tournamentId, stage: 'qualification', id: { in: ids } },
    include: { player: { select: PLAYER_PUBLIC_SELECT } },
    orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
  });
  return { entries, previousById };
}

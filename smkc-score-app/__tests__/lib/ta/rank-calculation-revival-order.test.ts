import {
  rerankStageAfterDelete,
  sortByStage,
  type EntryWithTotal,
} from '@/lib/ta/rank-calculation';
import type { PrismaClient } from '@prisma/client';

function makeEntry(id: string, totalTime: number | null, stage = 'revival_1'): EntryWithTotal {
  return {
    id,
    totalTime,
    lives: 0,
    eliminated: false,
    stage,
    courseScores: {},
    qualificationPoints: 0,
  };
}

function sqlFromExecuteRawCall(call: unknown[]): string {
  const templateStrings = call[0] as TemplateStringsArray;
  const values = call.slice(1);

  return templateStrings.raw.reduce((sql, chunk, index) => {
    const value = values[index];
    return `${sql}${chunk}${typeof value === 'string' ? value : ''}`;
  }, '');
}

describe('TA revival deterministic rank order', () => {
  it.each(['revival_1', 'revival_2'])('uses entry id as the equal-time tiebreaker for %s', (stage) => {
    const entries = [
      makeEntry('z-entry', 1000, stage),
      makeEntry('a-entry', 1000, stage),
      makeEntry('faster-entry', 900, stage),
      makeEntry('incomplete-entry', null, stage),
    ];

    expect(sortByStage(entries, stage).map((entry) => entry.id)).toEqual([
      'faster-entry',
      'a-entry',
      'z-entry',
    ]);
  });

  it('keeps delete reranking on the same totalTime/id ordering contract', async () => {
    const executeRaw = jest.fn().mockResolvedValue(2);
    const prisma = { $executeRaw: executeRaw } as unknown as PrismaClient;

    await rerankStageAfterDelete('tournament-1', 'revival_1', prisma);

    expect(executeRaw).toHaveBeenCalledTimes(1);
    const sqlText = sqlFromExecuteRawCall(executeRaw.mock.calls[0]);
    expect(sqlText).toContain('ROW_NUMBER() OVER (ORDER BY totalTime ASC, id ASC)');
    expect(sqlText).toContain('totalTime IS NOT NULL');
  });
});

import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { isTaBattleRoyaleStartConflict } from '@/lib/ta/battle-royale-start-conflict';

function createPrismaError(code: string) {
  return new PrismaClientKnownRequestError('Prisma error', {
    code,
    clientVersion: 'test',
  });
}

describe('isTaBattleRoyaleStartConflict', () => {
  it('Prismaのユニーク制約違反を開始競合として扱う', () => {
    expect(isTaBattleRoyaleStartConflict(createPrismaError('P2002'))).toBe(true);
  });

  it.each([
    new Error('database unavailable'),
    createPrismaError('P2024'),
    { code: 'P2002' },
    { code: 2002 },
    null,
    undefined,
  ])('ユニーク制約違反以外は開始競合として扱わない', (error) => {
    expect(isTaBattleRoyaleStartConflict(error)).toBe(false);
  });
});

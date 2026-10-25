// jest.setup.cjs replaces @prisma/client with lightweight fakes for every suite. This
// regression test must exercise the real generated Prisma 7 error class instead, so
// `instanceof` is checked against the class the runtime actually throws.
jest.unmock('@prisma/client');

import { Prisma } from '@prisma/client';
import { isTaBattleRoyaleStartConflict } from '@/lib/ta/battle-royale-start-conflict';

const { PrismaClientKnownRequestError } = Prisma;

function createPrismaError(code: string) {
  return new PrismaClientKnownRequestError('Prisma error', {
    code,
    clientVersion: 'test',
  });
}

describe('isTaBattleRoyaleStartConflict', () => {
  it('exercises the real Prisma runtime error class (guards jest.unmock above)', () => {
    const runtime = jest.requireActual<{ PrismaClientKnownRequestError: unknown }>('@prisma/client/runtime/client');
    expect(PrismaClientKnownRequestError).toBe(runtime.PrismaClientKnownRequestError);
  });

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

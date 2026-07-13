import { isTaBattleRoyaleStartConflict } from '@/lib/ta/battle-royale-start-conflict';

describe('isTaBattleRoyaleStartConflict', () => {
  it('Prismaのユニーク制約違反を開始競合として扱う', () => {
    expect(isTaBattleRoyaleStartConflict({ code: 'P2002' })).toBe(true);
  });

  it.each([new Error('database unavailable'), { code: 'P2024' }, { code: 2002 }, null, undefined])(
    'ユニーク制約違反以外は開始競合として扱わない',
    (error) => {
      expect(isTaBattleRoyaleStartConflict(error)).toBe(false);
    },
  );
});

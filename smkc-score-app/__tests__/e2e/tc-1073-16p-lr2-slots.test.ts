import { generateBracketStructure, getNextMatchInfo } from '@/lib/double-elimination';

describe('TC-1073 16-player finals LR2 slot routing', () => {
  it('keeps Winners QF losers in player1 slots and Losers R1 winners in player2 slots', () => {
    const bracket = generateBracketStructure(16);

    const lr2Expectations = [
      { lr2: 20, qf: 12, lr1: 16 },
      { lr2: 21, qf: 11, lr1: 17 },
      { lr2: 22, qf: 10, lr1: 18 },
      { lr2: 23, qf: 9, lr1: 19 },
    ];

    for (const { lr2, qf, lr1 } of lr2Expectations) {
      expect(getNextMatchInfo(bracket, qf, false)).toEqual({
        nextMatchNumber: lr2,
        position: 1,
      });
      expect(getNextMatchInfo(bracket, lr1, true)).toEqual({
        nextMatchNumber: lr2,
        position: 2,
      });
    }
  });
});

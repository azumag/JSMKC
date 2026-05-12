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

  it('TC-1396 keeps QF loser slots in bracket data instead of recalculating them', () => {
    const bracket = generateBracketStructure(16);

    expect(
      bracket
        .filter((match) => match.round === 'winners_qf')
        .map((match) => ({
          matchNumber: match.matchNumber,
          loserGoesTo: match.loserGoesTo,
          loserPosition: match.loserPosition,
        })),
    ).toEqual([
      { matchNumber: 9, loserGoesTo: 23, loserPosition: 1 },
      { matchNumber: 10, loserGoesTo: 22, loserPosition: 1 },
      { matchNumber: 11, loserGoesTo: 21, loserPosition: 1 },
      { matchNumber: 12, loserGoesTo: 20, loserPosition: 1 },
    ]);
  });
});

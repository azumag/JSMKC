import { resolveBracketWinnerFlags, type BracketWinnerMatch } from '@/lib/bracket-winner-flags';
import type { BracketMatch } from '@/types/bracket';

const bracketMatch: BracketMatch = {
  matchNumber: 1,
  round: 'winners_qf',
  bracket: 'winners',
};

function completedMatch(overrides: Partial<BracketWinnerMatch> = {}): BracketWinnerMatch {
  return {
    completed: true,
    player1Id: 'p1',
    player2Id: 'p2',
    score1: 0,
    score2: 0,
    ...overrides,
  };
}

describe('resolveBracketWinnerFlags winner override precedence', () => {
  it('keeps a persisted player1 override authoritative over score and custom resolver results', () => {
    const resolver = jest.fn(() => 'p2');

    expect(
      resolveBracketWinnerFlags(
        completedMatch({ winnerOverrideId: 'p1', score1: 0, score2: 5 }),
        bracketMatch,
        5,
        resolver,
      ),
    ).toEqual({ isWinner1: true, isWinner2: false });
    expect(resolver).not.toHaveBeenCalled();
  });

  it('fails closed for an unmatched persisted override instead of falling through to other winner sources', () => {
    const resolver = jest.fn(() => 'p2');

    expect(
      resolveBracketWinnerFlags(
        completedMatch({ winnerOverrideId: 'missing-player', score1: 0, score2: 5 }),
        bracketMatch,
        5,
        resolver,
      ),
    ).toEqual({ isWinner1: false, isWinner2: false });
    expect(resolver).not.toHaveBeenCalled();
  });

  it('delegates to the custom resolver when the persisted override is explicitly null', () => {
    const resolver = jest.fn(() => 'p2');

    expect(
      resolveBracketWinnerFlags(
        completedMatch({ winnerOverrideId: null, score1: 5, score2: 0 }),
        bracketMatch,
        5,
        resolver,
      ),
    ).toEqual({ isWinner1: false, isWinner2: true });
    expect(resolver).toHaveBeenCalledTimes(1);
  });
});

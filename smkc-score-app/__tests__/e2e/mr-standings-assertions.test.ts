import { assertMrStandingStats, normalizeMrStandingsPayload } from '../../e2e/lib/mr-standings-assertions';

describe('MR standings E2E assertions', () => {
  const standingsPayload = {
    data: {
      qualifications: [
        {
          playerId: 'p1',
          matchesPlayed: 1,
          wins: 1,
          ties: 0,
          losses: 0,
          points: 2,
          score: 2,
        },
        {
          playerId: 'p2',
          matchesPlayed: 1,
          wins: 0,
          ties: 0,
          losses: 1,
          points: -2,
          score: 0,
        },
      ],
    },
  };

  it('normalizes wrapped standings API responses', () => {
    expect(normalizeMrStandingsPayload(standingsPayload)).toHaveLength(2);
  });

  it('accepts expected MR report recalculation stats', () => {
    expect(() => {
      assertMrStandingStats(standingsPayload, 'p1', {
        matchesPlayed: 1,
        wins: 1,
        ties: 0,
        losses: 0,
        points: 2,
        score: 2,
      });
    }).not.toThrow();
  });

  it('fails with a targeted stat diff', () => {
    expect(() => {
      assertMrStandingStats(standingsPayload, 'p2', {
        matchesPlayed: 1,
        wins: 0,
        ties: 1,
        losses: 0,
        points: 0,
        score: 1,
      });
    }).toThrow('MR standings ties for p2: expected 1, got 0');
  });
});

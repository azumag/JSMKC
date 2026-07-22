import {
  getBmFinalsTargetWins,
  getGpFinalsMaxCups,
  getGpFinalsTargetWins,
  getMrFinalsMaxRounds,
  getMrFinalsTargetWins,
} from '@/lib/finals-target-wins';

describe('finals-target-wins', () => {
  it('returns BM target wins for playoff and finals rounds', () => {
    expect(getBmFinalsTargetWins({ stage: 'playoff', round: 'playoff_r1' })).toBe(3);
    expect(getBmFinalsTargetWins({ stage: 'playoff', round: 'playoff_r2' })).toBe(4);
    expect(getBmFinalsTargetWins({ round: 'winners_r1' })).toBe(5);
    expect(getBmFinalsTargetWins({ round: 'winners_sf' })).toBe(7);
    expect(getBmFinalsTargetWins({ round: 'grand_final' })).toBe(7);
  });

  it('returns MR target wins for playoff and finals rounds', () => {
    expect(getMrFinalsTargetWins({ stage: 'playoff', round: 'playoff_r1' })).toBe(3);
    expect(getMrFinalsTargetWins({ stage: 'playoff', round: 'playoff_r2' })).toBe(4);
    expect(getMrFinalsTargetWins({ round: 'winners_r1' })).toBe(5);
    expect(getMrFinalsTargetWins({ round: 'winners_sf' })).toBe(7);
    expect(getMrFinalsTargetWins({ round: 'losers_sf' })).toBe(9);
    expect(getMrFinalsTargetWins({ round: 'grand_final' })).toBe(9);
    expect(getMrFinalsTargetWins({ round: 'grand_final_reset' })).toBe(9);
  });

  it('returns GP target wins for playoff and finals rounds', () => {
    expect(getGpFinalsTargetWins({ stage: 'playoff', round: 'playoff_r1' })).toBe(1);
    expect(getGpFinalsTargetWins({ round: 'winners_r1' })).toBe(2);
    expect(getGpFinalsTargetWins({ round: 'winners_qf' })).toBe(2);
    expect(getGpFinalsTargetWins({ round: 'losers_r3' })).toBe(2);
    expect(getGpFinalsTargetWins({ round: 'winners_sf' })).toBe(2);
    expect(getGpFinalsTargetWins({ round: 'losers_sf' })).toBe(3);
    expect(getGpFinalsTargetWins({ round: 'grand_final' })).toBe(3);
  });

  it('maps GP target wins to max cup counts', () => {
    expect(getGpFinalsMaxCups({ stage: 'playoff', round: 'playoff_r1' })).toBe(1);
    expect(getGpFinalsMaxCups({ round: 'winners_r1' })).toBe(3);
    expect(getGpFinalsMaxCups({ round: 'winners_sf' })).toBe(3);
    expect(getGpFinalsMaxCups({ round: 'grand_final' })).toBe(5);
  });

  it('keeps the shared top-four target band explicit for BM, MR, and GP', () => {
    const topFourRounds = ['winners_final', 'losers_sf', 'losers_final', 'grand_final', 'grand_final_reset'];

    for (const round of topFourRounds) {
      expect(getBmFinalsTargetWins({ round })).toBe(7);
      expect(getMrFinalsTargetWins({ round })).toBe(9);
      expect(getGpFinalsTargetWins({ round })).toBe(3);
    }

    expect(getBmFinalsTargetWins({ round: 'winners_sf' })).toBe(7);
    expect(getMrFinalsTargetWins({ round: 'winners_sf' })).toBe(7);
    expect(getGpFinalsTargetWins({ round: 'winners_sf' })).toBe(2);
  });

  it('accepts match-shaped GP finals context objects for max cup counts', () => {
    const winnersMatch = { id: 'm1', round: 'winners_sf', stage: 'finals', player1Id: 'p1', player2Id: 'p2' };
    const grandFinalMatch = { id: 'm16', round: 'grand_final', stage: 'finals', player1Id: 'p1', player2Id: 'p2' };

    expect(getGpFinalsMaxCups(winnersMatch)).toBe(3);
    expect(getGpFinalsMaxCups(grandFinalMatch)).toBe(5);
  });

  it('maps MR target wins to max round counts', () => {
    expect(getMrFinalsMaxRounds({ stage: 'playoff', round: 'playoff_r1' })).toBe(5);
    expect(getMrFinalsMaxRounds({ stage: 'playoff', round: 'playoff_r2' })).toBe(7);
    expect(getMrFinalsMaxRounds({ round: 'winners_sf' })).toBe(13);
    expect(getMrFinalsMaxRounds({ round: 'losers_sf' })).toBe(17);
    expect(getMrFinalsMaxRounds({ round: 'grand_final' })).toBe(17);
  });

  it('uses a persisted round setting consistently for validation and detail lengths', () => {
    const configured = { stage: 'finals', round: 'winners_r1', targetWins: 7 };

    expect(getBmFinalsTargetWins(configured)).toBe(7);
    expect(getMrFinalsTargetWins(configured)).toBe(7);
    expect(getGpFinalsTargetWins(configured)).toBe(7);
    expect(getMrFinalsMaxRounds(configured)).toBe(13);
    expect(getGpFinalsMaxCups(configured)).toBe(13);
  });
});

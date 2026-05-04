import {
  getBmFinalsTargetWins,
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
    expect(getGpFinalsTargetWins({ round: 'grand_final' })).toBe(3);
  });

  it('maps MR target wins to max round counts', () => {
    expect(getMrFinalsMaxRounds({ stage: 'playoff', round: 'playoff_r1' })).toBe(5);
    expect(getMrFinalsMaxRounds({ stage: 'playoff', round: 'playoff_r2' })).toBe(7);
    expect(getMrFinalsMaxRounds({ round: 'winners_sf' })).toBe(13);
    expect(getMrFinalsMaxRounds({ round: 'losers_sf' })).toBe(17);
    expect(getMrFinalsMaxRounds({ round: 'grand_final' })).toBe(17);
  });
});

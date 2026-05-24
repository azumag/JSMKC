import { getBmFinalsTargetWins, getMrFinalsTargetWins } from '@/lib/finals-target-wins';
import { computeCurrentPhaseFormat } from '@/lib/overlay/phase';

describe('TC-2196 overlay phase format stage context', () => {
  it('keeps BM playoff overlay first-to values aligned with finals target helpers', () => {
    expect(
      computeCurrentPhaseFormat({
        qualificationConfirmed: true,
        taCurrentPhase: 'qualification',
        taLatestPhaseRoundNumber: null,
        latestFinalsStage: 'playoff',
        latestFinalsRound: 'playoff_r1',
        latestFinalsMode: 'bm',
      }),
    ).toBe(`First to ${getBmFinalsTargetWins({ stage: 'playoff', round: 'playoff_r1' })}`);

    expect(
      computeCurrentPhaseFormat({
        qualificationConfirmed: true,
        taCurrentPhase: 'qualification',
        taLatestPhaseRoundNumber: null,
        latestFinalsStage: 'playoff',
        latestFinalsRound: 'playoff_r2',
        latestFinalsMode: 'bm',
      }),
    ).toBe(`First to ${getBmFinalsTargetWins({ stage: 'playoff', round: 'playoff_r2' })}`);
  });

  it('keeps MR playoff overlay first-to values aligned with finals target helpers', () => {
    expect(
      computeCurrentPhaseFormat({
        qualificationConfirmed: true,
        taCurrentPhase: 'qualification',
        taLatestPhaseRoundNumber: null,
        latestFinalsStage: 'playoff',
        latestFinalsRound: 'playoff_r1',
        latestFinalsMode: 'mr',
      }),
    ).toBe(`First to ${getMrFinalsTargetWins({ stage: 'playoff', round: 'playoff_r1' })}`);

    expect(
      computeCurrentPhaseFormat({
        qualificationConfirmed: true,
        taCurrentPhase: 'qualification',
        taLatestPhaseRoundNumber: null,
        latestFinalsStage: 'playoff',
        latestFinalsRound: 'playoff_r2',
        latestFinalsMode: 'mr',
      }),
    ).toBe(`First to ${getMrFinalsTargetWins({ stage: 'playoff', round: 'playoff_r2' })}`);
  });
});

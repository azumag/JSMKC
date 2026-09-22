import { computeCurrentPhaseFormat, type ComputeCurrentPhaseInput } from '@/lib/overlay/phase';
import { getBmFinalsTargetWins, getGpFinalsTargetWins, getMrFinalsTargetWins } from '@/lib/finals-target-wins';

const baseInput: ComputeCurrentPhaseInput = {
  qualificationConfirmed: true,
  taCurrentPhase: 'qualification',
  taLatestPhaseRoundNumber: null,
  latestFinalsRound: 'grand_final',
  latestFinalsStage: 'finals',
  latestFinalsMode: 'bm',
};

describe('computeCurrentPhaseFormat persisted targetWins validation', () => {
  it.each([
    ['bm', getBmFinalsTargetWins({ stage: 'finals', round: 'grand_final' })],
    ['mr', getMrFinalsTargetWins({ stage: 'finals', round: 'grand_final' })],
    ['gp', getGpFinalsTargetWins({ stage: 'finals', round: 'grand_final' })],
  ] as const)('fails closed to the %s round default for invalid persisted values', (mode, expectedDefault) => {
    for (const invalidTargetWins of [100, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        computeCurrentPhaseFormat({
          ...baseInput,
          latestFinalsMode: mode,
          latestFinalsTargetWins: invalidTargetWins,
        }),
      ).toBe(`First to ${expectedDefault}`);
    }
  });

  it.each(['bm', 'mr', 'gp'] as const)('preserves a valid persisted value for %s', (mode) => {
    expect(
      computeCurrentPhaseFormat({
        ...baseInput,
        latestFinalsMode: mode,
        latestFinalsTargetWins: 99,
      }),
    ).toBe('First to 99');
  });
});

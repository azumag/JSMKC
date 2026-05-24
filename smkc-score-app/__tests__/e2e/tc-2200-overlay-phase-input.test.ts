import {
  computeCurrentPhaseFormat,
  type ComputeCurrentPhaseInput,
} from '@/lib/overlay/phase';
import { getBmFinalsTargetWins } from '@/lib/finals-target-wins';

type IsRequired<T, K extends keyof T> = object extends Pick<T, K> ? false : true;
type ExpectTrue<T extends true> = T;
type LatestFinalsStageIsRequired = ExpectTrue<
  IsRequired<ComputeCurrentPhaseInput, 'latestFinalsStage'>
>;

void (null as unknown as LatestFinalsStageIsRequired);

describe('TC-2200 overlay phase input shape', () => {
  it('requires callers to pass null when no latest finals stage exists', () => {
    const input: ComputeCurrentPhaseInput = {
      qualificationConfirmed: true,
      taCurrentPhase: 'qualification',
      taLatestPhaseRoundNumber: null,
      latestFinalsRound: 'grand_final',
      latestFinalsStage: null,
      latestFinalsMode: 'bm',
    };

    expect(computeCurrentPhaseFormat(input)).toBe(
      `First to ${getBmFinalsTargetWins({ round: 'grand_final' })}`,
    );
  });
});

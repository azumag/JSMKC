import { validateBalancedCdmSidePreviewSchedule } from '@/lib/qualification-balanced-cdm-preview-validation';

const SUPPORTED_SMALL_GROUP_SIZES = [7, 8, 9, 10, 11, 12] as const;

describe('validateBalancedCdmSidePreviewSchedule', () => {
  it.each(SUPPORTED_SMALL_GROUP_SIZES)(
    'validates the balanced-side hybrid invariants for %i players',
    (playerCount) => {
      const playerIds = Array.from({ length: playerCount }, (_, index) => `P${index + 1}`);

      expect(validateBalancedCdmSidePreviewSchedule(playerIds)).toEqual({
        playerCount,
        valid: true,
        failedInvariants: [],
        checks: {
          preservesCdmTotalDays: true,
          preservesCdmPairSet: true,
          preservesCdmDayPlacement: true,
          preservesCdmBreakPlacement: true,
          preservesCircleSideOrientation: true,
        },
      });
    },
  );

  it('returns null when the player count has no compatible CDM fixture', () => {
    const playerIds = Array.from({ length: 13 }, (_, index) => `P${index + 1}`);

    expect(validateBalancedCdmSidePreviewSchedule(playerIds)).toBeNull();
  });

  it('does not depend on synthetic seed-shaped player IDs', () => {
    const playerIds = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank', 'grace'];

    expect(validateBalancedCdmSidePreviewSchedule(playerIds)).toMatchObject({
      playerCount: 7,
      valid: true,
      failedInvariants: [],
    });
  });
});

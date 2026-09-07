import { buildQualificationScheduleDiagnostics } from '@/lib/qualification-schedule-diagnostics';

describe('buildQualificationScheduleDiagnostics', () => {
  it('reports effective policy and CDM fixture feasibility per populated group and mode', () => {
    const result = buildQualificationScheduleDiagnostics('cdm', {
      bm: [
        ...Array.from({ length: 14 }, () => ({ group: 'A' })),
        ...Array.from({ length: 13 }, () => ({ group: 'B' })),
      ],
      mr: Array.from({ length: 20 }, () => ({ group: 'C' })),
      gp: [],
    });

    expect(result).toEqual({
      bm: [
        {
          group: 'A',
          configuredMethod: 'cdm',
          playerCount: 14,
          effectiveMethod: 'cdm',
          reason: 'cdm-requested',
          cdmFixtureCapacity: 16,
          cdmBreakSlotCount: 2,
        },
        {
          group: 'B',
          configuredMethod: 'cdm',
          playerCount: 13,
          effectiveMethod: 'circle',
          reason: 'cdm-small-group-legacy-circle',
          cdmFixtureCapacity: null,
          cdmBreakSlotCount: null,
        },
      ],
      mr: [
        {
          group: 'C',
          configuredMethod: 'cdm',
          playerCount: 20,
          effectiveMethod: 'cdm',
          reason: 'cdm-requested',
          cdmFixtureCapacity: 20,
          cdmBreakSlotCount: 0,
        },
      ],
      gp: [],
    });
  });

  it('keeps explicitly configured circle tournaments on circle while still showing CDM feasibility', () => {
    const result = buildQualificationScheduleDiagnostics('circle', {
      bm: Array.from({ length: 20 }, () => ({ group: 'B' })),
      mr: [],
      gp: [],
    });

    expect(result.bm).toEqual([
      {
        group: 'B',
        configuredMethod: 'circle',
        playerCount: 20,
        effectiveMethod: 'circle',
        reason: 'configured-circle',
        cdmFixtureCapacity: 20,
        cdmBreakSlotCount: 0,
      },
    ]);
  });
});

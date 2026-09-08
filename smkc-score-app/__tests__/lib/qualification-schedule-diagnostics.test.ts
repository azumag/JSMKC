import {
  buildQualificationScheduleDiagnostics,
  summarizeQualificationScheduleDiagnostics,
} from '@/lib/qualification-schedule-diagnostics';

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
          generationSupported: true,
          cdmFixtureCapacity: 16,
          cdmBreakSlotCount: 2,
        },
        {
          group: 'B',
          configuredMethod: 'cdm',
          playerCount: 13,
          effectiveMethod: 'circle',
          reason: 'cdm-small-group-legacy-circle',
          generationSupported: true,
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
          generationSupported: true,
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
        generationSupported: true,
        cdmFixtureCapacity: 20,
        cdmBreakSlotCount: 0,
      },
    ]);
  });
});

describe('summarizeQualificationScheduleDiagnostics', () => {
  it('counts and buckets the groups affected by pending #3054 decisions without changing policy', () => {
    const diagnostics = buildQualificationScheduleDiagnostics('cdm', {
      bm: [
        ...Array.from({ length: 11 }, () => ({ group: 'A' })),
        ...Array.from({ length: 12 }, () => ({ group: 'B' })),
        ...Array.from({ length: 13 }, () => ({ group: 'C' })),
        ...Array.from({ length: 14 }, () => ({ group: 'D' })),
      ],
      mr: Array.from({ length: 21 }, () => ({ group: 'E' })),
      gp: Array.from({ length: 12 }, () => ({ group: 'F' })),
    });

    expect(summarizeQualificationScheduleDiagnostics(diagnostics)).toEqual({
      totalGroupCount: 6,
      legacyCircleGroupCount: 4,
      legacyCircleCdmReadyGroupCount: 3,
      legacyCircleCdmExactFitGroupCount: 2,
      legacyCircleCdmBreakRequiredGroupCount: 1,
      legacyCircleCdmUnavailableGroupCount: 1,
      legacyCircleSizeBreakdown: [
        {
          playerCount: 11,
          groupCount: 1,
          cdmFixtureCapacity: 12,
          cdmBreakSlotCount: 1,
        },
        {
          playerCount: 12,
          groupCount: 2,
          cdmFixtureCapacity: 12,
          cdmBreakSlotCount: 0,
        },
        {
          playerCount: 13,
          groupCount: 1,
          cdmFixtureCapacity: null,
          cdmBreakSlotCount: null,
        },
      ],
      legacyCircleModeBreakdown: [
        {
          mode: 'bm',
          groupCount: 3,
          cdmReadyGroupCount: 2,
          cdmExactFitGroupCount: 1,
          cdmBreakRequiredGroupCount: 1,
          cdmUnavailableGroupCount: 1,
        },
        {
          mode: 'gp',
          groupCount: 1,
          cdmReadyGroupCount: 1,
          cdmExactFitGroupCount: 1,
          cdmBreakRequiredGroupCount: 0,
          cdmUnavailableGroupCount: 0,
        },
      ],
      cdmFixtureUnavailableGroupCount: 2,
      cdmBreakRequiredGroupCount: 2,
      generationBlockedGroupCount: 1,
    });
  });
});

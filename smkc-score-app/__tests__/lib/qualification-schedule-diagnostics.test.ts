import {
  buildQualificationScheduleDiagnostics,
  buildQualificationSchedulePolicyMatrix,
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

describe('buildQualificationSchedulePolicyMatrix', () => {
  it('exposes the full 7..21 decision range without requiring populated tournament groups', () => {
    const result = buildQualificationSchedulePolicyMatrix('cdm').map((decision) => ({
      playerCount: decision.playerCount,
      effectiveMethod: decision.effectiveMethod,
      cdmFixtureCapacity: decision.cdmFixtureCapacity,
      cdmBreakSlotCount: decision.cdmBreakSlotCount,
      generationSupported: decision.generationSupported,
    }));

    expect(result).toEqual([
      { playerCount: 7, effectiveMethod: 'circle', cdmFixtureCapacity: 8, cdmBreakSlotCount: 1, generationSupported: true },
      { playerCount: 8, effectiveMethod: 'circle', cdmFixtureCapacity: 8, cdmBreakSlotCount: 0, generationSupported: true },
      { playerCount: 9, effectiveMethod: 'circle', cdmFixtureCapacity: 10, cdmBreakSlotCount: 1, generationSupported: true },
      { playerCount: 10, effectiveMethod: 'circle', cdmFixtureCapacity: 10, cdmBreakSlotCount: 0, generationSupported: true },
      { playerCount: 11, effectiveMethod: 'circle', cdmFixtureCapacity: 12, cdmBreakSlotCount: 1, generationSupported: true },
      { playerCount: 12, effectiveMethod: 'circle', cdmFixtureCapacity: 12, cdmBreakSlotCount: 0, generationSupported: true },
      { playerCount: 13, effectiveMethod: 'circle', cdmFixtureCapacity: null, cdmBreakSlotCount: null, generationSupported: true },
      { playerCount: 14, effectiveMethod: 'cdm', cdmFixtureCapacity: 16, cdmBreakSlotCount: 2, generationSupported: true },
      { playerCount: 15, effectiveMethod: 'cdm', cdmFixtureCapacity: 16, cdmBreakSlotCount: 1, generationSupported: true },
      { playerCount: 16, effectiveMethod: 'cdm', cdmFixtureCapacity: 16, cdmBreakSlotCount: 0, generationSupported: true },
      { playerCount: 17, effectiveMethod: 'cdm', cdmFixtureCapacity: 18, cdmBreakSlotCount: 1, generationSupported: true },
      { playerCount: 18, effectiveMethod: 'cdm', cdmFixtureCapacity: 18, cdmBreakSlotCount: 0, generationSupported: true },
      { playerCount: 19, effectiveMethod: 'cdm', cdmFixtureCapacity: 20, cdmBreakSlotCount: 1, generationSupported: true },
      { playerCount: 20, effectiveMethod: 'cdm', cdmFixtureCapacity: 20, cdmBreakSlotCount: 0, generationSupported: true },
      { playerCount: 21, effectiveMethod: 'cdm', cdmFixtureCapacity: null, cdmBreakSlotCount: null, generationSupported: false },
    ]);
  });

  it('keeps every matrix entry on circle for explicitly configured circle tournaments', () => {
    expect(buildQualificationSchedulePolicyMatrix('circle').every((decision) => decision.effectiveMethod === 'circle')).toBe(
      true,
    );
  });
});

describe('summarizeQualificationScheduleDiagnostics', () => {
  it('counts and buckets the groups and players affected by pending #3054 decisions without changing policy', () => {
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
      legacyCirclePlayerCount: 48,
      legacyCircleCdmReadyGroupCount: 3,
      legacyCircleCdmReadyPlayerCount: 35,
      legacyCircleCdmExactFitGroupCount: 2,
      legacyCircleCdmBreakRequiredGroupCount: 1,
      legacyCircleCdmBreakSlotCount: 1,
      legacyCircleCdmUnavailableGroupCount: 1,
      legacyCircleCdmUnavailablePlayerCount: 13,
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
          playerCount: 36,
          cdmReadyGroupCount: 2,
          cdmReadyPlayerCount: 23,
          cdmExactFitGroupCount: 1,
          cdmBreakRequiredGroupCount: 1,
          cdmBreakSlotCount: 1,
          cdmUnavailableGroupCount: 1,
          cdmUnavailablePlayerCount: 13,
        },
        {
          mode: 'gp',
          groupCount: 1,
          playerCount: 12,
          cdmReadyGroupCount: 1,
          cdmReadyPlayerCount: 12,
          cdmExactFitGroupCount: 1,
          cdmBreakRequiredGroupCount: 0,
          cdmBreakSlotCount: 0,
          cdmUnavailableGroupCount: 0,
          cdmUnavailablePlayerCount: 0,
        },
      ],
      cdmFixtureUnavailableGroupCount: 2,
      cdmBreakRequiredGroupCount: 2,
      generationBlockedGroupCount: 1,
    });
  });
});

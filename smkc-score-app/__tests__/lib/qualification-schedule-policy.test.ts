import {
  getQualificationSchedulePolicyDecision,
  resolveQualificationScheduleMethodForGroup,
} from '@/lib/qualification-schedule-policy';

describe('resolveQualificationScheduleMethodForGroup', () => {
  it('keeps explicitly legacy tournaments on circle scheduling for every group size', () => {
    for (const playerCount of [2, 7, 12, 13, 14, 16, 20, 21]) {
      expect(resolveQualificationScheduleMethodForGroup('circle', playerCount)).toBe('circle');
    }
  });

  it('keeps CDM-first tournaments on circle scheduling through 13 players', () => {
    for (const playerCount of [2, 7, 8, 10, 12, 13]) {
      expect(resolveQualificationScheduleMethodForGroup('cdm', playerCount)).toBe('circle');
    }
  });

  it('uses CDM scheduling from 14 players upward so unsupported sizes fail explicitly downstream', () => {
    for (const playerCount of [14, 15, 16, 17, 18, 19, 20, 21]) {
      expect(resolveQualificationScheduleMethodForGroup('cdm', playerCount)).toBe('cdm');
    }
  });

  it('documents the TT proposal boundary: fixture availability below 14 does not currently opt a group into CDM', () => {
    // `generateRoundRobinSchedule(..., { method: 'cdm' })` has fixture support for
    // 7-12 players, but the tournament policy intentionally falls back to the
    // legacy circle schedule for all groups up to 13 players. Issue #3054 must
    // explicitly decide whether TT should change this policy before behavior is
    // altered.
    expect(resolveQualificationScheduleMethodForGroup('cdm', 12)).toBe('circle');
    expect(resolveQualificationScheduleMethodForGroup('cdm', 14)).toBe('cdm');
  });
});

describe('getQualificationSchedulePolicyDecision', () => {
  it('explains an explicitly configured circle tournament while exposing the available CDM fixture', () => {
    expect(getQualificationSchedulePolicyDecision('circle', 20)).toEqual({
      configuredMethod: 'circle',
      playerCount: 20,
      effectiveMethod: 'circle',
      reason: 'configured-circle',
      generationSupported: true,
      cdmFixtureCapacity: 20,
      cdmBreakSlotCount: 0,
    });
  });

  it('makes the current 13-player fallback and missing fixture explicit', () => {
    expect(getQualificationSchedulePolicyDecision('cdm', 13)).toEqual({
      configuredMethod: 'cdm',
      playerCount: 13,
      effectiveMethod: 'circle',
      reason: 'cdm-small-group-legacy-circle',
      generationSupported: true,
      cdmFixtureCapacity: null,
      cdmBreakSlotCount: null,
    });
  });

  it('reports the 14-player CDM request with the 16-slot fixture and two BREAK slots', () => {
    expect(getQualificationSchedulePolicyDecision('cdm', 14)).toEqual({
      configuredMethod: 'cdm',
      playerCount: 14,
      effectiveMethod: 'cdm',
      reason: 'cdm-requested',
      generationSupported: true,
      cdmFixtureCapacity: 16,
      cdmBreakSlotCount: 2,
    });
  });

  it('does not claim downstream fixture support for unsupported CDM requests', () => {
    expect(getQualificationSchedulePolicyDecision('cdm', 21)).toEqual({
      configuredMethod: 'cdm',
      playerCount: 21,
      effectiveMethod: 'cdm',
      reason: 'cdm-requested',
      generationSupported: false,
      cdmFixtureCapacity: null,
      cdmBreakSlotCount: null,
    });
  });
});

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
  it('explains an explicitly configured circle tournament', () => {
    expect(getQualificationSchedulePolicyDecision('circle', 20)).toEqual({
      configuredMethod: 'circle',
      playerCount: 20,
      effectiveMethod: 'circle',
      reason: 'configured-circle',
    });
  });

  it('makes the current 13-player fallback explicit for diagnostics and future UI', () => {
    expect(getQualificationSchedulePolicyDecision('cdm', 13)).toEqual({
      configuredMethod: 'cdm',
      playerCount: 13,
      effectiveMethod: 'circle',
      reason: 'cdm-small-group-legacy-circle',
    });
  });

  it('makes the 14-player CDM request explicit without claiming downstream fixture support', () => {
    expect(getQualificationSchedulePolicyDecision('cdm', 14)).toEqual({
      configuredMethod: 'cdm',
      playerCount: 14,
      effectiveMethod: 'cdm',
      reason: 'cdm-requested',
    });

    expect(getQualificationSchedulePolicyDecision('cdm', 21)).toEqual({
      configuredMethod: 'cdm',
      playerCount: 21,
      effectiveMethod: 'cdm',
      reason: 'cdm-requested',
    });
  });
});

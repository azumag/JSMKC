import { resolveQualificationScheduleMethodForGroup } from '@/lib/qualification-schedule-policy';

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

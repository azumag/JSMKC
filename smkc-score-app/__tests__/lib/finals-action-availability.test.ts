import {
  canCreateFinalsFromQualification,
  canResetFinalsFromQualification,
} from '@/lib/finals-action-availability';

describe('canCreateFinalsFromQualification', () => {
  it('returns true only after qualification is confirmed and matches are complete', () => {
    expect(canCreateFinalsFromQualification({
      qualificationConfirmed: true,
      qualificationCount: 8,
      matchCount: 12,
      allMatchesCompleted: true,
    })).toBe(true);
  });

  it('returns false before qualification is confirmed', () => {
    expect(canCreateFinalsFromQualification({
      qualificationConfirmed: false,
      qualificationCount: 8,
      matchCount: 12,
      allMatchesCompleted: true,
    })).toBe(false);
  });

  it('returns false when there are no matches or unfinished matches', () => {
    expect(canCreateFinalsFromQualification({
      qualificationConfirmed: true,
      qualificationCount: 8,
      matchCount: 0,
      allMatchesCompleted: true,
    })).toBe(false);

    expect(canCreateFinalsFromQualification({
      qualificationConfirmed: true,
      qualificationCount: 8,
      matchCount: 12,
      allMatchesCompleted: false,
    })).toBe(false);
  });
});

describe('canResetFinalsFromQualification', () => {
  it('returns true only when a bracket exists and qualification is unlocked', () => {
    expect(canResetFinalsFromQualification({
      qualificationConfirmed: false,
      finalsExists: true,
    })).toBe(true);
  });

  it('returns false while qualification is locked', () => {
    expect(canResetFinalsFromQualification({
      qualificationConfirmed: true,
      finalsExists: true,
    })).toBe(false);
  });

  it('returns false before bracket existence is known or when no bracket exists', () => {
    expect(canResetFinalsFromQualification({
      qualificationConfirmed: false,
      finalsExists: undefined,
    })).toBe(false);

    expect(canResetFinalsFromQualification({
      qualificationConfirmed: false,
      finalsExists: false,
    })).toBe(false);
  });
});

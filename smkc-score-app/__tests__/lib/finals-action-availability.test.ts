import { canCreateFinalsFromQualification } from '@/lib/finals-action-availability';

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

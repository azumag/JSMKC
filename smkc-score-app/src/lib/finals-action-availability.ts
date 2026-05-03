interface QualificationFinalsActionArgs {
  qualificationConfirmed: boolean;
  qualificationCount: number;
  matchCount: number;
  allMatchesCompleted: boolean;
}

interface QualificationFinalsResetArgs {
  qualificationConfirmed: boolean;
  finalsExists: boolean | undefined;
}

/**
 * Finals/playoff generation on the qualification page is only meaningful once
 * the admin has locked qualification standings and every match is complete.
 */
export function canCreateFinalsFromQualification({
  qualificationConfirmed,
  qualificationCount,
  matchCount,
  allMatchesCompleted,
}: QualificationFinalsActionArgs): boolean {
  return qualificationConfirmed && qualificationCount > 0 && matchCount > 0 && allMatchesCompleted;
}

/**
 * Bracket reset is intentionally available only after qualification is unlocked.
 */
export function canResetFinalsFromQualification({
  qualificationConfirmed,
  finalsExists,
}: QualificationFinalsResetArgs): boolean {
  return !qualificationConfirmed && finalsExists === true;
}

import { COURSES, CUPS } from '@/lib/constants';

type CourseAbbr = (typeof COURSES)[number];
type CupName = (typeof CUPS)[number];

export type CdmQualificationRoundFixture = Readonly<{
  roundNumber: number;
  courses: readonly [CourseAbbr, CourseAbbr, CourseAbbr, CourseAbbr];
  cup: CupName;
}>;

/**
 * CDM 2026 qualification cards extracted from `RR 2025 Start.xlsm` → Tracks.
 * The one-based index is the shared roundNumber used by MR and GP.
 */
export const CDM_QUALIFICATION_ROUND_FIXTURES = [
  { roundNumber: 1, courses: ['MC2', 'GV1', 'DP3', 'GV3'], cup: 'Star' },
  { roundNumber: 2, courses: ['GV2', 'KB1', 'CI2', 'MC3'], cup: 'Mushroom' },
  { roundNumber: 3, courses: ['KB2', 'MC4', 'VL2', 'BC3'], cup: 'Special' },
  { roundNumber: 4, courses: ['VL1', 'BC2', 'MC1', 'CI1'], cup: 'Flower' },
  { roundNumber: 5, courses: ['DP2', 'DP1', 'RR', 'BC1'], cup: 'Star' },
  { roundNumber: 6, courses: ['CI2', 'DP3', 'DP2', 'GV2'], cup: 'Special' },
  { roundNumber: 7, courses: ['BC1', 'MC3', 'KB2', 'BC2'], cup: 'Mushroom' },
  { roundNumber: 8, courses: ['VL2', 'MC4', 'KB1', 'VL1'], cup: 'Flower' },
  { roundNumber: 9, courses: ['MC2', 'CI1', 'BC3', 'RR'], cup: 'Special' },
  { roundNumber: 10, courses: ['GV1', 'MC1', 'GV3', 'DP1'], cup: 'Star' },
  { roundNumber: 11, courses: ['DP2', 'DP3', 'KB2', 'MC2'], cup: 'Flower' },
  { roundNumber: 12, courses: ['BC1', 'GV2', 'VL1', 'BC2'], cup: 'Mushroom' },
  { roundNumber: 13, courses: ['BC3', 'DP1', 'CI2', 'GV3'], cup: 'Star' },
  { roundNumber: 14, courses: ['GV1', 'MC3', 'RR', 'KB1'], cup: 'Mushroom' },
  { roundNumber: 15, courses: ['MC1', 'VL2', 'MC4', 'CI1'], cup: 'Flower' },
  { roundNumber: 16, courses: ['DP1', 'MC2', 'KB1', 'GV3'], cup: 'Special' },
  { roundNumber: 17, courses: ['BC3', 'KB2', 'MC3', 'BC2'], cup: 'Star' },
  { roundNumber: 18, courses: ['DP2', 'MC4', 'RR', 'CI1'], cup: 'Mushroom' },
  { roundNumber: 19, courses: ['GV2', 'VL1', 'CI2', 'VL2'], cup: 'Flower' },
  { roundNumber: 20, courses: ['BC1', 'MC1', 'DP3', 'GV1'], cup: 'Special' },
] as const satisfies readonly CdmQualificationRoundFixture[];

export function getCdmQualificationRoundFixture(roundNumber: number) {
  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > CDM_QUALIFICATION_ROUND_FIXTURES.length) {
    throw new Error(`CDM qualification round must be 1-${CDM_QUALIFICATION_ROUND_FIXTURES.length}: ${roundNumber}`);
  }
  const fixture = CDM_QUALIFICATION_ROUND_FIXTURES[roundNumber - 1];
  if (fixture.roundNumber !== roundNumber) {
    throw new Error(`CDM qualification fixture sequence is invalid at round ${roundNumber}`);
  }
  return fixture;
}

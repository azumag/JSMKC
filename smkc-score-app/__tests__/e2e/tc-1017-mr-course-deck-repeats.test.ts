import { e2eCaseSection, readRepoFile, sectionBetween } from '../helpers/e2e-cases';

describe('TC-1017 MR course deck repeat guard', () => {
  const qualificationRoute = readRepoFile(
    'smkc-score-app',
    'src',
    'lib',
    'api-factories',
    'qualification-route.ts',
  );

  it('documents the MR qualification deck-repeat scenario', () => {
    const section = e2eCaseSection('TC-1017');

    expect(section).toContain('issue #1017');
    expect(section).toContain('MR_QUALIFICATION_COURSE_DECK_REPEATS');
    expect(section).toContain('TOTAL_MR_RACES');
    expect(section).toContain('tc-1017-mr-course-deck-repeats.test.ts');
  });

  it('keeps MR course-deck repeats independent from the per-match race count', () => {
    const deckBuilder = sectionBetween(
      qualificationRoute,
      'export function generateShuffledCourseList()',
      '/**\n * Generate the qualification cup deck for GP match assignment',
    );

    expect(qualificationRoute).toContain('export const MR_QUALIFICATION_COURSE_DECK_REPEATS = 4;');
    expect(deckBuilder).toContain('MR_QUALIFICATION_COURSE_DECK_REPEATS');
    expect(deckBuilder).not.toContain('TOTAL_MR_RACES');
  });
});

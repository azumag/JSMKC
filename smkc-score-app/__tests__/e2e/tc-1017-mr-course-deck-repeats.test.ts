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

  it('documents that the TC-1017 length test does not need a random mock', () => {
    const section = e2eCaseSection('TC-1662');

    expect(section).toContain('issue #1662');
    expect(section).toContain('Math.random');
    expect(section).toContain('配列長');
  });

  it('documents that the TC-1017 static guard validates the extracted block', () => {
    const section = e2eCaseSection('TC-1664');

    expect(section).toContain('sectionBetween');
    expect(section).toContain('MR_QUALIFICATION_COURSE_DECK_REPEATS');
    expect(section).toContain('toHaveLength(COURSES.length * MR_QUALIFICATION_COURSE_DECK_REPEATS)');
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

  it('keeps the TC-1017 unit assertion free of unused Math.random mocking', () => {
    const unitTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'api-factories',
      'qualification-route.test.ts',
    );
    const testBlock = sectionBetween(
      unitTest,
      "it('should size MR qualification course decks from the deck repeat policy, not per-match race count'",
      "it('should reject non-positive, fractional, and non-finite MR qualification round numbers before assigning courses'",
    );

    expect(testBlock.trim()).not.toBe('');
    expect(testBlock).toContain('MR_QUALIFICATION_COURSE_DECK_REPEATS');
    expect(testBlock).toContain('toHaveLength(COURSES.length * MR_QUALIFICATION_COURSE_DECK_REPEATS)');
    expect(testBlock).toContain('generateShuffledCourseList()');
    expect(testBlock).not.toContain('Math.random');
    expect(testBlock).not.toContain('mockReturnValue');
    expect(testBlock).not.toContain('mockRestore');
  });
});

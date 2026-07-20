import { e2eCaseSection, readRepoFile } from '../helpers/e2e-cases';

describe('TC-1578 qualification points tooltip source', () => {
  const helper = readRepoFile('smkc-score-app', 'e2e', 'lib', 'common.js');
  const driftTest = readRepoFile('smkc-score-app', '__tests__', 'docs', 'e2e-cases-drift.test.ts');
  const testFile = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'static',
    'tc-1578-qualification-points-tooltip-source.test.ts',
  );

  it('documents the i18n-backed tooltip source scenario', () => {
    const section = e2eCaseSection('TC-1578');

    expect(section).toContain('issue #1578');
    expect(section).toContain('messages/ja.json');
    expect(section).toContain('messages/en.json');
    expect(section).toContain('qualification-points-labels.test.ts');
  });

  it('keeps the E2E helper reading tooltip titles from message files', () => {
    expect(helper).toContain("require('../../messages/ja.json').common");
    expect(helper).toContain("require('../../messages/en.json').common");
    expect(helper).toContain('getQualificationPointsTooltipTitles');
    expect(helper).not.toContain("title === '予選点（0-1000に正規化した勝点）'");
    expect(helper).not.toContain("title === 'Qualification points (0-1000 normalized)'");
  });

  it('keeps drift coverage from duplicating localized tooltip strings', () => {
    expect(driftTest).toContain('getQualificationPointsTooltipTitles');
    expect(driftTest).not.toContain("expect(helper).toContain('予選点（0-1000に正規化した勝点）')");
    expect(driftTest).not.toContain("expect(helper).toContain('Qualification points (0-1000 normalized)')");
  });

  it('keeps follow-up guards for strict locale label initialization', () => {
    const tc1584 = e2eCaseSection('TC-1584');
    const tc1585 = e2eCaseSection('TC-1585');

    expect(tc1584).toContain('issue #1584');
    expect(tc1584).toContain('filter(Boolean)');
    expect(tc1584).toContain('欠損');
    expect(tc1585).toContain('issue #1585');
    expect(tc1585).toContain('LOCALE_COMMON_MESSAGES');
    expect(helper).toContain('function getRequiredCommonMessage');
    expect(helper).toContain('messages/${locale}.json common.${key} is required');
    /* Whitespace/line-break tolerant: Prettier decides whether `.map(...)`
     * chains onto the same line or wraps, and that layout choice isn't the
     * behavior this guard cares about. */
    expect(helper).toMatch(
      /const QUALIFICATION_POINTS_HEADER_LABELS = LOCALE_COMMON_MESSAGES\s*\.?\s*map\(\s*\(entry\)\s*=>\s*getRequiredCommonMessage\(entry, 'qualificationPointsShort'\)/,
    );
    expect(helper).toMatch(
      /const QUALIFICATION_POINTS_TOOLTIP_TITLES = LOCALE_COMMON_MESSAGES\s*\.?\s*map\(\s*\(entry\)\s*=>\s*getRequiredCommonMessage\(entry, 'qualificationPointsTooltip'\)/,
    );
    expect(helper).not.toMatch(/QUALIFICATION_POINTS_(?:HEADER_LABELS|TOOLTIP_TITLES)[\s\S]{0,200}filter\(Boolean\)/);
    expect(helper).not.toContain('Object.values(COMMON_MESSAGES_BY_LOCALE)');
  });

  it('keeps follow-up coverage documented without depending on unrelated require order', () => {
    const tc1587 = e2eCaseSection('TC-1587');
    const tc1588 = e2eCaseSection('TC-1588');
    const tc1590 = e2eCaseSection('TC-1590');
    const tc1591 = e2eCaseSection('TC-1591');
    // Split forbidden strings so this self-inspection guard does not match itself.
    const forbiddenSectionHelper = 'section' + 'Between';
    const chromiumRequire = "const { chromium } = require('play" + "wright');";

    expect(tc1587).toContain('issue #1587');
    expect(tc1587).toContain('jest.isolateModules');
    expect(tc1588).toContain('issue #1588');
    expect(tc1588).toContain('chromium');
    expect(tc1588).toContain('正規表現');
    expect(tc1590).toContain('issue #1590');
    expect(tc1590).toContain('dontMock');
    expect(tc1591).toContain('issue #1591');
    expect(tc1591).toContain('自分自身');
    expect(testFile).not.toContain(forbiddenSectionHelper);
    expect(testFile).not.toContain(chromiumRequire);
  });
});

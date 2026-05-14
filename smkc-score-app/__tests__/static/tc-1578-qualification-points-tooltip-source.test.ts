import { e2eCaseSection, readRepoFile, sectionBetween } from '../helpers/e2e-cases';

describe('TC-1578 qualification points tooltip source', () => {
  const helper = readRepoFile('smkc-score-app', 'e2e', 'lib', 'common.js');
  const driftTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'docs',
    'e2e-cases-drift.test.ts',
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
    const labelInitialization = sectionBetween(
      helper,
      'const LOCALE_COMMON_MESSAGES = [',
      "const { chromium } = require('playwright');",
    );

    expect(tc1584).toContain('issue #1584');
    expect(tc1584).toContain('filter(Boolean)');
    expect(tc1584).toContain('欠損');
    expect(tc1585).toContain('issue #1585');
    expect(tc1585).toContain('LOCALE_COMMON_MESSAGES');
    expect(helper).toContain('function getRequiredCommonMessage');
    expect(helper).toContain('messages/${locale}.json common.${key} is required');
    expect(labelInitialization).not.toContain('filter(Boolean)');
    expect(labelInitialization).not.toContain('Object.values(COMMON_MESSAGES_BY_LOCALE)');
  });
});

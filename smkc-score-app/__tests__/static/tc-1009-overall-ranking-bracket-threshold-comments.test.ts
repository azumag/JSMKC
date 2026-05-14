import { e2eCaseSection, readRepoFile, sectionBetween } from '../helpers/e2e-cases';

describe('TC-1009 overall-ranking bracket threshold comments', () => {
  it('documents the review follow-up scenario', () => {
    const section = e2eCaseSection('TC-1009');

    expect(section).toContain('issue #1009');
    expect(section).toContain('isSixteenPlayerOrTop24Bracket');
    expect(section).toContain('generateBracketStructure(8)');
    expect(section).toContain('generateBracketStructure(16)');
    expect(section).toContain('tc-1009-overall-ranking-bracket-threshold-comments.test.ts');
  });

  it('keeps each 16-player finals matchNumber threshold explained at the source site', () => {
    const source = readRepoFile('smkc-score-app', 'src', 'lib', 'points', 'overall-ranking.ts');
    const helper = sectionBetween(
      source,
      'function isSixteenPlayerOrTop24Bracket',
      'function toMatchRecord',
    );

    expect(helper).toContain('generateBracketStructure(8)');
    expect(helper).toContain('generateBracketStructure(16)');
    expect(helper).toContain('losers_r4: 26-27');
    expect(helper).toContain('m.round === "losers_r4"');

    for (const [round, lowerBound, range] of [
      ['losers_r1', 16, '16-19'],
      ['losers_r2', 20, '20-23'],
      ['losers_r3', 24, '24-25'],
      ['losers_sf', 28, '28'],
      ['losers_final', 29, '29'],
      ['grand_final', 30, '30'],
      ['grand_final_reset', 31, '31'],
    ] as const) {
      expect(helper).toContain(`${round}: ${range}`);
      expect(helper).toContain(`m.round === "${round}" && m.matchNumber >= ${lowerBound}`);
    }
  });
});

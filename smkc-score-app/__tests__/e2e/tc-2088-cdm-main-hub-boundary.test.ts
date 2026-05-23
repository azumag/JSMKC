import { e2eCaseSection, readRepoFile } from '../helpers/e2e-cases';

describe('TC-2088 CDM Main Hub boundary coverage', () => {
  it('documents the exactly-60 Main Hub boundary scenario', () => {
    const section = e2eCaseSection('TC-2088');

    expect(section).toContain('issue #2088');
    expect(section).toContain('B61');
    expect(section).toContain('B62');
    expect(section).toContain('undefined');
    expect(section).toContain('__tests__/app/api/tournaments/[id]/export/route.test.ts');
  });

  it('keeps the unit test asserting B62 stays unwritten at exactly 60 players', () => {
    const routeTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'app',
      'api',
      'tournaments',
      '[id]',
      'export',
      'route.test.ts',
    );

    expect(routeTest).toContain('should write the Main Hub player rows for exactly 60 players');
    expect(routeTest).toContain('Array.from({ length: 60 }');
    expect(routeTest).toContain('workbook.Sheets["Main Hub"].B61.v');
    expect(routeTest).toContain('workbook.Sheets["Main Hub"].B62).toBeUndefined()');
  });
});

import { readRepoFile, e2eCaseSection } from '../helpers/e2e-cases';

describe('TC-1033 review follow-up coverage', () => {
  const tcTa = readRepoFile('smkc-score-app', 'e2e', 'tc-ta.js');

  it('documents the API-order-independent sudden-death target setup', () => {
    const section = e2eCaseSection('TC-1033');

    expect(section).toContain('issue #1033/#1637/#1638');
    expect(section).toContain('API の `entries` 返却順に依存せず');
    expect(section).toContain('`playerId` 順に並べた最後の2名');
  });

  it('keeps the runner deterministic and grouped after TC-815', () => {
    expect(tcTa).toContain('function orderTaEntriesForDeterministicResultSlots(entries)');
    expect(tcTa).toContain('localeCompare');
    expect(tcTa).toContain('const entries = orderTaEntriesForDeterministicResultSlots');
    expect(tcTa).toContain('const expectedTargetIds = entries.slice(6).map');
    expect(tcTa).toContain('targetIdsMatch');

    const tc815Index = tcTa.indexOf("{ name: 'TC-815', fn: runTc815 }");
    const tc1033Index = tcTa.indexOf("{ name: 'TC-1033', fn: runTc1033 }");
    const tc817Index = tcTa.indexOf("{ name: 'TC-817', fn: runTc817 }");
    expect(tc815Index).toBeGreaterThanOrEqual(0);
    expect(tc1033Index).toBeGreaterThan(tc815Index);
    expect(tc1033Index).toBeLessThan(tc817Index);
  });
});

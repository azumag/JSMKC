import fs from 'fs';
import path from 'path';

describe('archive E2E case registration', () => {
  const casesPath = path.join(process.cwd(), '..', 'E2E_TEST_CASES.md');
  const cases = fs.readFileSync(casesPath, 'utf8');

  it.each(['TC-ARC-01', 'TC-ARC-02', 'TC-ARC-03', 'TC-ARC-04', 'TC-ARC-06'])(
    'documents %s as a runnable archive script case',
    (tc) => {
      const section = cases.slice(cases.indexOf(`## ${tc}:`), cases.indexOf('\n---', cases.indexOf(`## ${tc}:`)));
      expect(section).toContain(`tc-archive.js ${tc}`);
      expect(section).toContain('npm run e2e:preview:archive');
      expect(section).not.toContain('未スクリプト化');
    },
  );

  it('documents TC-ARC-06 as concrete archive match/player payload coverage', () => {
    const section = cases.slice(
      cases.indexOf('## TC-ARC-06:'),
      cases.indexOf('\n---', cases.indexOf('## TC-ARC-06:')),
    );

    expect(section).toContain('modes.bm.matches[0]');
    expect(section).toContain("stage === 'qualification'");
    expect(section).toContain('player1.id');
    expect(section).toContain('player2.id');
  });

  it('documents TC-ARC-05 as TA archive phase1/phase2 fallback coverage', () => {
    const section = cases.slice(
      cases.indexOf('## TC-ARC-05:'),
      cases.indexOf('\n---', cases.indexOf('## TC-ARC-05:')),
    );

    expect(section).toContain('/api/tournaments/:id/ta/phases?phase=phase1');
    expect(section).toContain('/api/tournaments/:id/ta/phases?phase=phase2');
    expect(section).toContain('round history');
    expect(section).toContain('lives === 0');
    expect(section).toContain('smkc-score-app/__tests__/app/api/tournaments/[id]/ta/phases/route.test.ts');
  });

  it('documents that preview archive coverage writes to a dedicated R2 bucket', () => {
    const section = cases.slice(
      cases.indexOf('## TC-ARC-03:'),
      cases.indexOf('\n---', cases.indexOf('## TC-ARC-03:')),
    );

    expect(section).toContain('smkc-archives-preview');
    expect(section).toMatch(/smkc-archives(?!-preview)/);
  });
});

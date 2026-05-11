import fs from 'fs';
import path from 'path';

describe('archive E2E case registration', () => {
  const casesPath = path.join(process.cwd(), '..', 'E2E_TEST_CASES.md');
  const cases = fs.readFileSync(casesPath, 'utf8');

  it.each(['TC-ARC-01', 'TC-ARC-02', 'TC-ARC-03', 'TC-ARC-04'])(
    'documents %s as a runnable archive script case',
    (tc) => {
      const section = cases.slice(cases.indexOf(`## ${tc}:`), cases.indexOf('\n---', cases.indexOf(`## ${tc}:`)));
      expect(section).toContain(`tc-archive.js ${tc}`);
      expect(section).toContain('npm run e2e:preview:archive');
      expect(section).not.toContain('未スクリプト化');
    },
  );

  it('documents that preview archive coverage writes to a dedicated R2 bucket', () => {
    const section = cases.slice(
      cases.indexOf('## TC-ARC-03:'),
      cases.indexOf('\n---', cases.indexOf('## TC-ARC-03:')),
    );

    expect(section).toContain('smkc-archives-preview');
    expect(section).toContain('smkc-archives');
  });
});

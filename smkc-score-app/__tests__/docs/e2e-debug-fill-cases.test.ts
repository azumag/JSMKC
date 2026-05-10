import fs from 'fs';
import path from 'path';

describe('debug-fill E2E case registration', () => {
  const casesPath = path.join(process.cwd(), '..', 'E2E_TEST_CASES.md');
  const cases = fs.readFileSync(casesPath, 'utf8');

  it.each(['TC-DBG-01', 'TC-DBG-02', 'TC-DBG-03', 'TC-DBG-04'])(
    'documents %s as a runnable debug-fill script case',
    (tc) => {
      const section = cases.slice(cases.indexOf(`## ${tc}:`), cases.indexOf('\n---', cases.indexOf(`## ${tc}:`)));
      expect(section).toContain(`tc-debug-fill.js ${tc}`);
      expect(section).toContain('npm run e2e:preview:debug-fill');
      expect(section).not.toContain('未スクリプト化');
    },
  );
});

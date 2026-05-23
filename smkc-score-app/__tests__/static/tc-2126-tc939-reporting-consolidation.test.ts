import fs from 'fs';
import path from 'path';

import { e2eCaseSection } from '../helpers/e2e-cases';

describe('TC-2126 TC-939 reporting test consolidation', () => {
  const appRoot = process.cwd();
  const removedE2eTestPath = path.join(appRoot, '__tests__/e2e/tc-939-reporting.test.ts');
  const libTestPath = path.join(appRoot, '__tests__/lib/tc939-reporting.test.ts');
  const libTestSource = fs.readFileSync(libTestPath, 'utf8');

  it('keeps duplicate TC-939 reporting coverage out of the e2e test folder', () => {
    expect(fs.existsSync(removedE2eTestPath)).toBe(false);
    expect(libTestSource).toContain('reports both independent TC-939 failure reasons');
    expect(libTestSource).toContain('Tab click caused a full document reload');
    expect(libTestSource).toContain('Hydrated tab className contains extra whitespace');
  });

  it('documents TC-2126 as lib-test consolidation without restoring the removed file reference', () => {
    const section = e2eCaseSection('TC-2126');
    const tc939Section = e2eCaseSection('TC-939');

    expect(section).toContain('issue #2126');
    expect(section).toContain('__tests__/lib/tc939-reporting.test.ts');
    expect(section).toContain('__tests__/e2e/tc-939-reporting.test.ts');
    expect(section).toContain('存在しないことを確認する');
    expect(tc939Section).toContain('__tests__/lib/tc939-reporting.test.ts');
    expect(tc939Section).not.toContain('__tests__/e2e/tc-939-reporting.test.ts');
  });
});

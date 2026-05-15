import { e2eCaseSection, readRepoFile } from '../helpers/e2e-cases';

describe('TC-1002 overlay toast require contract', () => {
  const testSource = readRepoFile('smkc-score-app', '__tests__', 'e2e', 'overlay-toast-assertions.test.ts');

  it('documents the CommonJS helper loading contract in the E2E scenario list', () => {
    const section = e2eCaseSection('TC-1002');

    expect(section).toContain('issue #1002');
    expect(section).toContain('overlay-toast-assertions.test.ts');
    expect(section).toContain('tc-1002-overlay-toast-require-contract.test.ts');
  });

  it('loads the CommonJS helper synchronously without an async setup hook', () => {
    expect(testSource).toContain("require('../../e2e/lib/overlay-toast-assertions.js')");
    expect(testSource).not.toContain('beforeAll(async');
    expect(testSource).not.toContain('await import(');
  });

  it('keeps the require rationale comment concise', () => {
    expect(testSource).toContain('TC-1002');
    expect(testSource).not.toContain('Promise boundary');
  });
});

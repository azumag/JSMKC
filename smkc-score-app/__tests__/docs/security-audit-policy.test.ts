import { readRepoFile } from '../helpers/e2e-cases';

describe('security audit policy documentation', () => {
  const policy = readRepoFile('docs', 'security-audit-policy.md');
  const ci = readRepoFile('.github', 'workflows', 'ci.yml');
  const helper = readRepoFile('smkc-score-app', 'scripts', 'security-audit.js');
  const ciConfigTest = readRepoFile('smkc-score-app', '__tests__', 'docs', 'ci-config.test.ts');
  const helperTest = readRepoFile('smkc-score-app', '__tests__', 'scripts', 'security-audit.test.ts');

  it('documents the fail-closed helper used by CI', () => {
    expect(policy).toContain('`node scripts/security-audit.js`');
    expect(policy).toContain('high / critical');
    expect(policy).toContain('Fail-closed');
    expect(ci).toContain('node scripts/security-audit.js');
  });

  it('keeps temporary exception details in the helper instead of the stable policy', () => {
    expect(policy).not.toMatch(/GHSA-[a-z0-9-]+/i);
    expect(policy).not.toContain('deepmerge-ts');
    expect(helper).toContain('const ALLOWED_ADVISORY =');
    expect(helper).toContain('const ALLOWED_VERSION =');
    expect(helper).toContain('const ALLOWED_PRISMA_DEV_RANGE =');
  });

  it('documents manifest drift as a fail-closed condition', () => {
    expect(policy).toContain('root の devDependency 宣言');
    expect(policy).toContain('manifest / lockfile の前提が変化する');
    expect(helperTest).toContain('Prisma devDependency range changes');
  });

  it('documents that unit tests run before the blocking audit', () => {
    expect(policy).toContain('unit test');
    expect(policy).toContain('security audit より前');
    expect(policy).toContain('security audit 自体は blocking');
  });

  it('documents TC-2460 as a behavior contract instead of a raw npm audit command', () => {
    expect(policy).toContain('TC-2460');
    expect(policy).toContain('特定の `npm audit` コマンド文字列ではなく');
    expect(policy).toContain(
      'CI が `node scripts/security-audit.js` を入口として high / critical finding を blocking に扱う',
    );
  });

  it('references the regression tests at their real repository paths', () => {
    expect(policy).toContain('`smkc-score-app/__tests__/docs/ci-config.test.ts`');
    expect(policy).toContain('`smkc-score-app/__tests__/scripts/security-audit.test.ts`');
    expect(policy).toContain('`smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts`');
    expect(ciConfigTest).toContain('TC-2460');
    expect(helperTest).toContain('evaluateAuditReport');
  });
});

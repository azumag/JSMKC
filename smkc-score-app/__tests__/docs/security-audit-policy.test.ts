import { readRepoFile } from '../helpers/e2e-cases';

describe('security audit policy documentation', () => {
  const policy = readRepoFile('docs', 'security-audit-policy.md');
  const ci = readRepoFile('.github', 'workflows', 'ci.yml');
  const helper = readRepoFile('smkc-score-app', 'scripts', 'security-audit.js');

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
  });

  it('documents that unit tests run before the blocking audit', () => {
    expect(policy).toContain('unit test');
    expect(policy).toContain('security audit より前');
    expect(policy).toContain('security audit 自体は blocking');
  });
});

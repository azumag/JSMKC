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
    expect(policy).not.toContain('GHSA-ggr8-5vv4-36mx');
    expect(policy).not.toContain('deepmerge-ts 7.1.5');
    expect(helper).toContain("const ALLOWED_ADVISORY = 'GHSA-ggr8-5vv4-36mx'");
    expect(helper).toContain("const ALLOWED_VERSION = '7.1.5'");
  });

  it('documents that unit tests run before the blocking audit', () => {
    expect(policy).toContain('unit test');
    expect(policy).toContain('security audit より前');
    expect(policy).toContain('security audit 自体は blocking');
  });
});

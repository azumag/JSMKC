import fs from 'node:fs';
import path from 'node:path';

import { readRepoFile } from '../helpers/e2e-cases';

describe('security audit policy documentation', () => {
  const policy = readRepoFile('docs', 'security-audit-policy.md');
  const ci = readRepoFile('.github', 'workflows', 'ci.yml');
  const helper = readRepoFile('smkc-score-app', 'scripts', 'security-audit.js');
  const lockfileHelper = readRepoFile('smkc-score-app', 'scripts', 'security-audit-lockfile.js');

  it('documents the fail-closed helper used by CI', () => {
    expect(policy).toContain('`node scripts/security-audit.js`');
    expect(policy).toContain('high / critical');
    expect(policy).toContain('Fail-closed');
    expect(ci).toContain('node scripts/security-audit.js');
  });

  it('documents that no advisory allowlist exists and the helper enforces it', () => {
    expect(policy).toContain('許可リスト（既知 advisory の除外）は持たない');
    expect(policy).not.toMatch(/GHSA-[a-z0-9-]+/i);
    expect(policy).not.toContain('deepmerge-ts');
    expect(helper).not.toMatch(/ALLOWED_ADVISORY|TEMPORARY_EXCEPTION|allowed:/);
    expect(helper).toContain('const BLOCKING_SEVERITIES = new Set([');
    expect(helper).toContain('function evaluateAuditReport(report)');
  });

  it('documents the lockfile preflight that runs before the audit in CI', () => {
    expect(policy).toContain('node scripts/security-audit-lockfile.js');
    expect(ci.indexOf('node scripts/security-audit-lockfile.js')).toBeLessThan(
      ci.indexOf('node scripts/security-audit.js'),
    );
    expect(helper).toContain("require('./security-audit-lockfile.js')");
    expect(lockfileHelper).toContain("const rootPackage = lockfile.packages['']");
  });

  it('documents the pinned npm runtime and canonical registry guards inside the helper', () => {
    expect(policy).toContain('packageManager の exact pin');
    expect(policy).toContain('`--registry=https://registry.npmjs.org/`');
    expect(policy).toContain('`0` / `1`');
    expect(helper).toContain("require('./verify-npm-version.js')");
    expect(helper).toContain('verifyNpmRuntime({ manifest });');
    expect(helper).toContain('verifyNpmAuditRegistry();');
    expect(helper).toContain('`--registry=${CANONICAL_NPM_AUDIT_REGISTRY}`');
    expect(helper).toContain('function isExpectedAuditExitStatus(status)');
    expect(helper).toContain('function hasConsistentAuditExitStatus(report, status)');
  });

  it('documents audit report schema drift as a fail-closed condition', () => {
    expect(policy).toContain('`error` field');
    expect(policy).toContain('`auditReportVersion`');
    expect(policy).toContain('`metadata.vulnerabilities`');
    expect(policy).toContain('`metadata.dependencies`');
    expect(helper).toContain("Object.prototype.hasOwnProperty.call(report, 'error')");
    expect(helper).toContain('const EXPECTED_AUDIT_REPORT_VERSION = 2');
    expect(helper).toContain('function hasExpectedAuditSummary(report, { required = false } = {})');
    expect(helper).toContain('function hasExpectedAuditDependencySummary(report, { required = false } = {})');
    expect(helper).toContain('function hasValidVulnerabilityEntries(vulnerabilities)');
    expect(helper).toContain('function hasConsistentVulnerabilitySummary(report, vulnerabilities)');
  });

  it('documents TC-2460 as a behavior contract instead of a raw npm audit command', () => {
    expect(policy).toContain('TC-2460');
    expect(policy).toContain('特定の `npm audit` コマンド文字列ではなく');
    expect(policy).toContain(
      'CI が `node scripts/security-audit.js` を入口として high / critical finding を blocking に扱う',
    );
  });

  it('references the regression tests at their real repository paths', () => {
    const referenced = [...policy.matchAll(/`smkc-score-app\/(__tests__\/[^`]+)`/g)].map((m) => m[1]);

    expect(referenced.length).toBeGreaterThan(0);
    for (const relative of referenced) {
      expect(fs.existsSync(path.resolve(__dirname, '..', '..', relative))).toBe(true);
    }
  });
});

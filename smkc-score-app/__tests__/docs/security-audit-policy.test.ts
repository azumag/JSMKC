import { readRepoFile } from '../helpers/e2e-cases';

describe('security audit policy documentation', () => {
  const policy = readRepoFile('docs', 'security-audit-policy.md');
  const ci = readRepoFile('.github', 'workflows', 'ci.yml');
  const helper = readRepoFile('smkc-score-app', 'scripts', 'security-audit.js');
  const lockfileHelper = readRepoFile('smkc-score-app', 'scripts', 'security-audit-lockfile.js');
  const ciConfigTest = readRepoFile('smkc-score-app', '__tests__', 'docs', 'ci-config.test.ts');
  const helperTest = readRepoFile('smkc-score-app', '__tests__', 'scripts', 'security-audit.test.ts');
  const summaryTest = readRepoFile('smkc-score-app', '__tests__', 'scripts', 'security-audit-summary.test.ts');
  const reportShapeTest = readRepoFile('smkc-score-app', '__tests__', 'scripts', 'security-audit-report-shape.test.ts');
  const errorReportTest = readRepoFile('smkc-score-app', '__tests__', 'scripts', 'security-audit-error-report.test.ts');
  const expiryTest = readRepoFile('smkc-score-app', '__tests__', 'scripts', 'security-audit-expiry.test.ts');
  const lockfileTest = readRepoFile('smkc-score-app', '__tests__', 'scripts', 'security-audit-lockfile.test.ts');

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

  it('enforces a review deadline for the temporary exception', () => {
    expect(policy).toContain('2026-10-06T00:00:00.000Z');
    expect(policy).toContain('再レビュー期限');
    expect(policy).toContain('例外を自動延長しない');
    expect(helper).toContain("const TEMPORARY_EXCEPTION_REVIEW_DEADLINE = '2026-10-06T00:00:00.000Z'");
    expect(helper).toContain('function isTemporaryExceptionExpired(now = new Date(), deadlineMs =');
    expect(helper).toContain('result.allowed.length > 0 && isTemporaryExceptionExpired()');
    expect(expiryTest).toContain('fails closed at the review deadline');
    expect(policy).toContain('期限文字列の解析結果が `NaN` / 非有限値');
    expect(expiryTest).toContain('fails closed when the parsed review deadline is invalid');
  });

  it('documents the lockfile root package snapshot precondition', () => {
    expect(policy).toContain('`packages[\"\"]` の root package snapshot');
    expect(policy).toContain('root snapshot の drift');
    expect(lockfileHelper).toContain("const rootPackage = lockfile.packages['']");
    expect(lockfileTest).toContain('accepts a minimal v3 lockfile with an object root package snapshot');
  });

  it('documents manifest drift as a fail-closed condition', () => {
    expect(policy).toContain('実際の `package.json` を独立に読み');
    expect(policy).toContain('`package-lock.json` root snapshot');
    expect(policy).toContain('manifest / lockfile の前提が変化する');
    expect(policy).toContain('`dependencies` / `devDependencies`');
    expect(policy).toContain('container drift');
    expect(helper).toContain("fs.readFileSync('package.json', 'utf8')");
    expect(helper).toContain('function isOptionalObjectMap(value)');
    expect(helperTest).toContain('Prisma devDependency range changes');
    expect(helperTest).toContain('package.json Prisma devDependency drifts');
    expect(helperTest).toContain('package.json also declares Prisma as a production dependency');
    expect(helperTest).toContain('package.json dependencies is not an object map');
    expect(helperTest).toContain('lockfile root dependencies snapshot is not an object map');
  });

  it('documents audit summary count drift as a fail-closed condition', () => {
    expect(policy).toContain('`metadata.vulnerabilities`');
    expect(policy).toContain('summary 件数と vulnerability graph の severity 件数が矛盾する');
    expect(policy).toContain('`total` と graph entry 総数が一致しない');
    expect(policy).toContain('未知の summary key');
    expect(helperTest).toContain('summary high count is %i but the graph contains 3');
    expect(helperTest).toContain('summary reports a critical severity absent from the graph');
    expect(summaryTest).toContain('non-blocking severity count disagrees with the graph');
    expect(summaryTest).toContain('summary total disagrees with the graph entry count');
    expect(summaryTest).toContain('summary contains an unknown key');
  });

  it('documents audit report schema drift as a fail-closed condition', () => {
    expect(policy).toContain('top-level に `error` field');
    expect(policy).toContain('CI entrypoint では `auditReportVersion` を必須');
    expect(policy).toContain('現在検証済みの npm audit report schema version `2`');
    expect(policy).toContain('`metadata` が存在する場合');
    expect(policy).toContain('metadata container');
    expect(policy).toContain('`vulnerabilities` graph 自体');
    expect(policy).toContain('未知の severity');
    expect(policy).toContain('`isDirect` が存在する場合は boolean');
    expect(policy).toContain('`range` が存在する場合は string');
    expect(policy).toContain('direct advisory object には non-empty string');
    expect(policy).toContain('`name` / `dependency` / `title` / `severity`');
    expect(policy).toContain('`source` ID、CWE 分類、CVSS score / vector');
    expect(policy).toContain('未知 field を許可しない');
    expect(policy).toContain('optional な `source` は正の integer');
    expect(policy).toContain('`via` が存在する場合');
    expect(policy).toContain('`effects` / `nodes`');
    expect(policy).toContain('各 entry の `name` / `isDirect` / `range` / `nodes`');
    expect(helper).toContain("Object.prototype.hasOwnProperty.call(report, 'error')");
    expect(helper).toContain('const EXPECTED_AUDIT_REPORT_VERSION = 2');
    expect(helper).toContain('function hasExpectedAuditReportVersion(report, { required = false } = {})');
    expect(helper).toContain('hasExpectedAuditReportVersion(report, { required: true })');
    expect(helper).toContain('const KNOWN_SEVERITIES = new Set(SUMMARY_SEVERITIES)');
    expect(helper).toContain('function hasValidAuditMetadata(metadata)');
    expect(helper).toContain('function isValidDirectAdvisoryEntry(entry)');
    expect(helper).toContain('const ALLOWED_ADVISORY_SOURCE =');
    expect(helper).toContain('const ALLOWED_ADVISORY_TITLE =');
    expect(helper).toContain('const DIRECT_ADVISORY_OBJECT_KEYS = new Set([');
    expect(helper).toContain('const ALLOWED_ADVISORY_CWE =');
    expect(helper).toContain('const ALLOWED_ADVISORY_CVSS_SCORE =');
    expect(helper).toContain('function isValidCvss(value)');
    expect(errorReportTest).toContain('fails closed whenever npm audit includes an explicit error field');
    expect(reportShapeTest).toContain('requires auditReportVersion 2 on the real CI entrypoint');
    expect(reportShapeTest).toContain('fails closed when npm audit report version drifts');
    expect(reportShapeTest).toContain('fails closed when audit metadata is not an object');
    expect(reportShapeTest).toContain('fails closed when vulnerabilities is an array');
    expect(reportShapeTest).toContain('fails closed when a vulnerability has an unknown severity');
    expect(reportShapeTest).toContain('fails closed when vulnerability via is not an array');
    expect(reportShapeTest).toContain('fails closed when vulnerability via contains an unsupported entry');
    expect(reportShapeTest).toContain('fails closed when direct advisory %s has an invalid value');
    expect(reportShapeTest).toContain('fails closed when direct advisory risk metadata %s is invalid');
    expect(helperTest).toContain('direct advisory title changes');
    expect(helperTest).toContain('allowed direct advisory gains an unknown field');
    expect(helperTest).toContain('direct advisory source id changes');
    expect(helperTest).toContain('direct advisory CWE metadata changes');
    expect(helperTest).toContain('direct advisory CVSS metadata changes');
    expect(reportShapeTest).toContain('fails closed when vulnerability %s has an invalid type');
    expect(reportShapeTest).toContain('fails closed when vulnerability %s is not an array');
    expect(reportShapeTest).toContain('fails closed when vulnerability %s contains a non-string member');
    expect(helperTest).toContain('reported at a different install node');
    expect(helperTest).toContain('directness changes');
    expect(helperTest).toContain('propagated audit range changes');
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
    expect(policy).toContain('`smkc-score-app/__tests__/scripts/security-audit-summary.test.ts`');
    expect(policy).toContain('`smkc-score-app/__tests__/scripts/security-audit-report-shape.test.ts`');
    expect(policy).toContain('`smkc-score-app/__tests__/scripts/security-audit-error-report.test.ts`');
    expect(policy).toContain('`smkc-score-app/__tests__/scripts/security-audit-expiry.test.ts`');
    expect(policy).toContain('`smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts`');
    expect(ciConfigTest).toContain('TC-2460');
    expect(helperTest).toContain('evaluateAuditReport');
    expect(summaryTest).toContain('evaluateAuditReport');
    expect(reportShapeTest).toContain('evaluateAuditReport');
    expect(errorReportTest).toContain('evaluateAuditReport');
  });
});

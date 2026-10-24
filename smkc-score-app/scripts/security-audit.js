'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  hasExpectedSecurityAuditLockfileShape,
  hasMatchingSecurityAuditPackageIdentity,
  hasMatchingSecurityAuditManifestSnapshot,
} = require('./security-audit-lockfile.js');
const { formatUpstreamProbeFailure, sanitizeUpstreamDiagnostic } = require('./security-audit-upstream-diagnostic.js');
const { loadPackageManifest, verifyNpmRuntime } = require('./verify-npm-version.js');

const EXPECTED_AUDIT_REPORT_VERSION = 2;
const CANONICAL_NPM_AUDIT_REGISTRY = 'https://registry.npmjs.org/';
const AUDIT_REPORT_OBJECT_KEYS = new Set(['auditReportVersion', 'vulnerabilities', 'metadata']);
const AUDIT_METADATA_OBJECT_KEYS = new Set(['vulnerabilities', 'dependencies']);
const DEPENDENCY_SUMMARY_KEYS = ['prod', 'dev', 'optional', 'peer', 'peerOptional', 'total'];
const DEPENDENCY_SUMMARY_KEY_SET = new Set(DEPENDENCY_SUMMARY_KEYS);
const FIX_AVAILABLE_OBJECT_KEYS = new Set(['name', 'version', 'isSemVerMajor']);
const CVSS_OBJECT_KEYS = new Set(['score', 'vectorString']);
const DIRECT_ADVISORY_OBJECT_KEYS = new Set([
  'source',
  'name',
  'dependency',
  'title',
  'url',
  'severity',
  'cwe',
  'cvss',
  'range',
]);
const VULNERABILITY_OBJECT_KEYS = new Set([
  'name',
  'severity',
  'isDirect',
  'via',
  'effects',
  'range',
  'nodes',
  'fixAvailable',
]);
const SUMMARY_SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];
const NPM_AUDIT_EXIT_SEVERITIES = ['low', 'moderate', 'high', 'critical'];
const KNOWN_SEVERITIES = new Set(SUMMARY_SEVERITIES);
// 修正方針: high/critical の finding は例外なしで失敗させる（#3114 の一時例外は削除済み）。
// 依存の脆弱性を許容する仕組みを再導入する場合は、ここではなく docs/security-audit-policy.md の手順で
// 根拠・期限・承認を記録したうえで設計し直すこと。
const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

function hasKnownDirectAdvisoryFields(entry) {
  return (
    entry &&
    typeof entry === 'object' &&
    !Array.isArray(entry) &&
    Object.keys(entry).every((key) => DIRECT_ADVISORY_OBJECT_KEYS.has(key))
  );
}

function isValidDirectAdvisoryEntry(entry) {
  return (
    hasKnownDirectAdvisoryFields(entry) &&
    (entry.source === undefined || (Number.isInteger(entry.source) && entry.source > 0)) &&
    typeof entry.name === 'string' &&
    entry.name.length > 0 &&
    typeof entry.dependency === 'string' &&
    entry.dependency.length > 0 &&
    (entry.title === undefined || (typeof entry.title === 'string' && entry.title.length > 0)) &&
    KNOWN_SEVERITIES.has(entry.severity) &&
    (entry.cwe === undefined ||
      (Array.isArray(entry.cwe) && entry.cwe.every((cwe) => typeof cwe === 'string' && cwe.length > 0))) &&
    isValidCvss(entry.cvss) &&
    typeof entry.range === 'string' &&
    typeof entry.url === 'string' &&
    entry.url.length > 0
  );
}

function isValidCvss(value) {
  if (value === undefined) {
    return true;
  }

  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === CVSS_OBJECT_KEYS.size &&
    Object.keys(value).every((key) => CVSS_OBJECT_KEYS.has(key)) &&
    Number.isFinite(value.score) &&
    value.score >= 0 &&
    value.score <= 10 &&
    (value.vectorString === null || (typeof value.vectorString === 'string' && value.vectorString.length > 0))
  );
}

function isValidViaEntries(via, requireAdvisoryMetadata) {
  if (via === undefined) {
    return true;
  }

  return (
    Array.isArray(via) &&
    via.every(
      (entry) =>
        typeof entry === 'string' ||
        (entry &&
          typeof entry === 'object' &&
          !Array.isArray(entry) &&
          (!requireAdvisoryMetadata || isValidDirectAdvisoryEntry(entry))),
    )
  );
}

function isOptionalStringArray(value) {
  return value === undefined || (Array.isArray(value) && value.every((entry) => typeof entry === 'string'));
}

function isOptionalBoolean(value) {
  return value === undefined || typeof value === 'boolean';
}

function isOptionalString(value) {
  return value === undefined || typeof value === 'string';
}

function isObjectMap(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isValidFixAvailable(value) {
  if (value === undefined || typeof value === 'boolean') {
    return true;
  }

  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === FIX_AVAILABLE_OBJECT_KEYS.size &&
    Object.keys(value).every((key) => FIX_AVAILABLE_OBJECT_KEYS.has(key)) &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    typeof value.version === 'string' &&
    value.version.length > 0 &&
    typeof value.isSemVerMajor === 'boolean'
  );
}

function hasKnownAuditReportFields(report) {
  return (
    report &&
    typeof report === 'object' &&
    !Array.isArray(report) &&
    Object.keys(report).every((key) => AUDIT_REPORT_OBJECT_KEYS.has(key))
  );
}

function hasExpectedAuditReportVersion(report, { required = false } = {}) {
  if (report?.auditReportVersion === undefined) {
    return !required;
  }
  return report.auditReportVersion === EXPECTED_AUDIT_REPORT_VERSION;
}

function hasExpectedAuditSummary(report, { required = false } = {}) {
  const summary = report?.metadata?.vulnerabilities;
  if (summary === undefined) {
    return !required;
  }
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return false;
  }
  if (!required) {
    return true;
  }

  return (
    SUMMARY_SEVERITIES.every((severity) => Object.prototype.hasOwnProperty.call(summary, severity)) &&
    Object.prototype.hasOwnProperty.call(summary, 'total')
  );
}

function hasExpectedAuditDependencySummary(report, { required = false } = {}) {
  const dependencies = report?.metadata?.dependencies;
  if (dependencies === undefined) {
    return !required;
  }
  if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
    return false;
  }
  if (Object.keys(dependencies).some((key) => !DEPENDENCY_SUMMARY_KEY_SET.has(key))) {
    return false;
  }
  if (required && DEPENDENCY_SUMMARY_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(dependencies, key))) {
    return false;
  }

  return Object.values(dependencies).every((count) => Number.isInteger(count) && count >= 0);
}

function hasConsistentAuditDependencyTotal(report, lockfile, { required = false } = {}) {
  const dependencies = report?.metadata?.dependencies;
  if (dependencies === undefined) {
    return !required;
  }
  if (!hasExpectedAuditDependencySummary(report, { required })) {
    return false;
  }

  const packages = lockfile?.packages;
  if (!isObjectMap(packages)) {
    return false;
  }

  const installedPackageCount = Object.keys(packages).filter((packagePath) => packagePath !== '').length;
  return dependencies.total === installedPackageCount;
}

function hasValidAuditMetadata(metadata) {
  return (
    metadata === undefined ||
    (metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      Object.keys(metadata).every((key) => AUDIT_METADATA_OBJECT_KEYS.has(key)))
  );
}

function hasValidVulnerabilityEntries(vulnerabilities) {
  if (!vulnerabilities || typeof vulnerabilities !== 'object' || Array.isArray(vulnerabilities)) {
    return false;
  }

  return Object.entries(vulnerabilities).every(([packageName, vulnerability]) => {
    if (
      !vulnerability ||
      typeof vulnerability !== 'object' ||
      Array.isArray(vulnerability) ||
      Object.keys(vulnerability).some((key) => !VULNERABILITY_OBJECT_KEYS.has(key)) ||
      !KNOWN_SEVERITIES.has(vulnerability.severity)
    ) {
      return false;
    }

    const requireAdvisoryMetadata = !BLOCKING_SEVERITIES.has(vulnerability.severity);
    return (
      (vulnerability.name === undefined || vulnerability.name === packageName) &&
      isOptionalBoolean(vulnerability.isDirect) &&
      isOptionalString(vulnerability.range) &&
      isValidViaEntries(vulnerability.via, requireAdvisoryMetadata) &&
      isOptionalStringArray(vulnerability.effects) &&
      isOptionalStringArray(vulnerability.nodes) &&
      isValidFixAvailable(vulnerability.fixAvailable)
    );
  });
}

function hasConsistentVulnerabilitySummary(report, vulnerabilities) {
  const summary = report?.metadata?.vulnerabilities;
  if (summary === undefined) {
    return true;
  }
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return false;
  }

  const allowedSummaryKeys = new Set([...SUMMARY_SEVERITIES, 'total']);
  if (Object.keys(summary).some((key) => !allowedSummaryKeys.has(key))) {
    return false;
  }

  const graphCounts = Object.fromEntries(SUMMARY_SEVERITIES.map((severity) => [severity, 0]));
  for (const vulnerability of Object.values(vulnerabilities)) {
    graphCounts[vulnerability.severity] += 1;
  }

  for (const severity of SUMMARY_SEVERITIES) {
    const count = summary[severity] ?? 0;
    if (!Number.isInteger(count) || count < 0 || count !== graphCounts[severity]) {
      return false;
    }
  }

  if (summary.total !== undefined) {
    if (
      !Number.isInteger(summary.total) ||
      summary.total < 0 ||
      summary.total !== Object.keys(vulnerabilities).length
    ) {
      return false;
    }
  }

  return true;
}

// report の構造（キー・バージョン・件数の整合）を検証したうえで、high/critical の finding が
// 1 件でもあれば失敗とする。構造が壊れている report は、件数 0 と誤判定しないよう必ず失敗させる。
function evaluateAuditReport(report) {
  if (
    !report ||
    Object.prototype.hasOwnProperty.call(report, 'error') ||
    !hasKnownAuditReportFields(report) ||
    !hasExpectedAuditReportVersion(report) ||
    !hasValidAuditMetadata(report.metadata) ||
    !hasExpectedAuditDependencySummary(report) ||
    !hasValidVulnerabilityEntries(report.vulnerabilities) ||
    !hasConsistentVulnerabilitySummary(report, report.vulnerabilities)
  ) {
    return { ok: false, unexpected: ['invalid-audit-report'] };
  }

  const blocking = Object.entries(report.vulnerabilities)
    .filter(([, vulnerability]) => BLOCKING_SEVERITIES.has(vulnerability?.severity))
    .map(([name]) => name);

  return { ok: blocking.length === 0, unexpected: blocking };
}

function isCanonicalNpmAuditRegistry(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  try {
    const registry = new URL(value.trim());
    return (
      registry.protocol === 'https:' &&
      registry.hostname === 'registry.npmjs.org' &&
      registry.port === '' &&
      registry.pathname === '/' &&
      registry.username === '' &&
      registry.password === '' &&
      registry.search === '' &&
      registry.hash === ''
    );
  } catch {
    return false;
  }
}

function verifyNpmAuditRegistry() {
  const configured = spawnSync('npm', ['config', 'get', 'registry'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (configured.error || configured.signal || configured.status !== 0 || !configured.stdout) {
    const reason =
      configured.error?.message ||
      (configured.signal ? `npm config terminated by signal ${configured.signal}` : '') ||
      (!configured.stdout
        ? 'npm config get registry produced no output'
        : `npm config get registry exited with status ${configured.status}`);
    throw new Error(`Failed to verify npm audit registry: ${reason}`);
  }

  const registry = configured.stdout.trim();
  if (!isCanonicalNpmAuditRegistry(registry)) {
    throw new Error(`npm audit registry must be ${CANONICAL_NPM_AUDIT_REGISTRY}; received ${registry || '<empty>'}`);
  }

  return registry;
}

function runNpmAuditFromValidatedSnapshot(manifestSource, lockfileSource) {
  if (typeof manifestSource !== 'string' || typeof lockfileSource !== 'string') {
    throw new Error('Validated npm audit snapshot sources must be UTF-8 strings');
  }

  const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsmkc-security-audit-input-'));
  try {
    fs.writeFileSync(path.join(snapshotDir, 'package.json'), manifestSource, 'utf8');
    fs.writeFileSync(path.join(snapshotDir, 'package-lock.json'), lockfileSource, 'utf8');

    return spawnSync(
      'npm',
      ['audit', '--json', '--audit-level=low', '--package-lock-only', `--registry=${CANONICAL_NPM_AUDIT_REGISTRY}`],
      {
        cwd: snapshotDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } finally {
    fs.rmSync(snapshotDir, { recursive: true, force: true });
  }
}

function isExpectedAuditExitStatus(status) {
  return status === 0 || status === 1;
}

function hasConsistentAuditExitStatus(report, status) {
  if (!isExpectedAuditExitStatus(status)) {
    return false;
  }

  const summary = report?.metadata?.vulnerabilities;
  if (
    !summary ||
    typeof summary !== 'object' ||
    Array.isArray(summary) ||
    !SUMMARY_SEVERITIES.every((severity) => Number.isInteger(summary[severity]) && summary[severity] >= 0)
  ) {
    return false;
  }

  const expectedStatus = NPM_AUDIT_EXIT_SEVERITIES.some((severity) => summary[severity] > 0) ? 1 : 0;
  return status === expectedStatus;
}

function main() {
  let manifestSource;
  let manifest;
  try {
    manifestSource = fs.readFileSync('package.json', 'utf8');
    manifest = loadPackageManifest(() => manifestSource);
  } catch (error) {
    process.stderr.write(formatUpstreamProbeFailure('Failed to read package.json for security audit', error));
    process.exit(1);
  }

  let npmRuntimeVersion;
  try {
    npmRuntimeVersion = verifyNpmRuntime({ manifest });
  } catch (error) {
    process.stderr.write(formatUpstreamProbeFailure('Failed to verify npm runtime for security audit', error));
    process.exit(1);
  }
  process.stdout.write(`npm runtime version verified: ${npmRuntimeVersion}\n`);

  let lockfileSource;
  let lockfile;
  try {
    lockfileSource = fs.readFileSync('package-lock.json', 'utf8');
    lockfile = JSON.parse(lockfileSource);
  } catch (error) {
    process.stderr.write(formatUpstreamProbeFailure('Failed to read package-lock.json for security audit', error));
    process.exit(1);
  }

  if (!hasExpectedSecurityAuditLockfileShape(lockfile)) {
    process.stderr.write(
      'Security audit requires package-lock.json lockfileVersion 3 with a packages object, object-valued package entries and a root package snapshot; review lockfile schema drift before continuing.\n',
    );
    process.exit(1);
  }

  if (!hasMatchingSecurityAuditPackageIdentity(manifest, lockfile)) {
    process.stderr.write(
      'Security audit requires package.json name/version to match package-lock.json top-level and root package identity; refresh the lockfile before continuing.\n',
    );
    process.exit(1);
  }

  if (!hasMatchingSecurityAuditManifestSnapshot(manifest, lockfile)) {
    process.stderr.write(
      'Security audit requires package.json dependency declarations to match the package-lock.json root package snapshot; refresh the lockfile before continuing.\n',
    );
    process.exit(1);
  }

  let npmAuditRegistry;
  try {
    npmAuditRegistry = verifyNpmAuditRegistry();
  } catch (error) {
    process.stderr.write(formatUpstreamProbeFailure('Failed to verify npm audit registry', error));
    process.exit(1);
  }
  process.stdout.write(`npm audit registry verified: ${npmAuditRegistry}\n`);

  let audit;
  try {
    audit = runNpmAuditFromValidatedSnapshot(manifestSource, lockfileSource);
  } catch (error) {
    process.stderr.write(formatUpstreamProbeFailure('Failed to run npm audit from validated snapshot', error));
    process.exit(1);
  }

  if (audit.error || audit.signal || !audit.stdout || !isExpectedAuditExitStatus(audit.status)) {
    const reason =
      audit.error?.message ||
      (audit.signal ? `npm audit terminated by signal ${audit.signal}` : '') ||
      (!audit.stdout ? 'npm audit produced no JSON output' : `npm audit exited with unexpected status ${audit.status}`);
    const safeReason = sanitizeUpstreamDiagnostic(reason);
    process.stderr.write(`${safeReason || 'npm audit failed without a diagnostic'}\n`);
    const safeAuditStderr = sanitizeUpstreamDiagnostic(audit.stderr || '');
    if (safeAuditStderr) {
      process.stderr.write(`${safeAuditStderr}\n`);
    }
    process.exit(1);
  }

  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch (error) {
    process.stderr.write(formatUpstreamProbeFailure('Failed to parse npm audit JSON', error));
    const safeAuditStderr = sanitizeUpstreamDiagnostic(audit.stderr || '');
    if (safeAuditStderr) {
      process.stderr.write(`${safeAuditStderr}\n`);
    }
    process.exit(1);
  }

  if (!hasExpectedAuditReportVersion(report, { required: true })) {
    process.stderr.write(
      `npm audit report version must be ${EXPECTED_AUDIT_REPORT_VERSION}; received ${String(report?.auditReportVersion)}\n`,
    );
    process.exit(1);
  }

  if (!hasExpectedAuditSummary(report, { required: true })) {
    process.stderr.write('npm audit metadata.vulnerabilities must include all severity counts and total\n');
    process.exit(1);
  }

  if (!hasConsistentAuditExitStatus(report, audit.status)) {
    process.stderr.write('npm audit exit status must match metadata.vulnerabilities at the pinned low audit level\n');
    process.exit(1);
  }

  if (!hasExpectedAuditDependencySummary(report, { required: true })) {
    process.stderr.write(
      'npm audit metadata.dependencies must include prod, dev, optional, peer, peerOptional and total as non-negative integers\n',
    );
    process.exit(1);
  }

  if (!hasConsistentAuditDependencyTotal(report, lockfile, { required: true })) {
    process.stderr.write(
      'npm audit metadata.dependencies.total must match the installed package count in package-lock.json\n',
    );
    process.exit(1);
  }

  const result = evaluateAuditReport(report);

  if (!result.ok) {
    process.stderr.write(`Blocking npm audit finding(s): ${result.unexpected.join(', ')}\n`);
    process.stderr.write(audit.stdout);
    const safeAuditStderr = sanitizeUpstreamDiagnostic(audit.stderr || '');
    if (safeAuditStderr) {
      process.stderr.write(`${safeAuditStderr}\n`);
    }
    process.exit(1);
  }

  process.stdout.write('npm audit: no high/critical vulnerabilities found.\n');
}

if (require.main === module) {
  main();
}

module.exports = {
  evaluateAuditReport,
  hasConsistentAuditDependencyTotal,
  hasConsistentAuditExitStatus,
  hasExpectedAuditDependencySummary,
  hasExpectedAuditReportVersion,
  hasExpectedAuditSummary,
  isCanonicalNpmAuditRegistry,
  isExpectedAuditExitStatus,
  runNpmAuditFromValidatedSnapshot,
  verifyNpmAuditRegistry,
};

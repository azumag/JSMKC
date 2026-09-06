'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const EXPECTED_AUDIT_REPORT_VERSION = 2;
const TEMPORARY_EXCEPTION_REVIEW_DEADLINE = '2026-10-06T00:00:00.000Z';
const TEMPORARY_EXCEPTION_REVIEW_DEADLINE_MS = Date.parse(TEMPORARY_EXCEPTION_REVIEW_DEADLINE);
const ALLOWED_ADVISORY = 'GHSA-ggr8-5vv4-36mx';
const ALLOWED_ADVISORY_RANGE = '<8.0.0';
const ALLOWED_ADVISORY_SOURCE = 1145093;
const ALLOWED_ADVISORY_TITLE = 'DeepmergeTS has stack exhaustion when merging recursive object graphs';
const ALLOWED_ADVISORY_CWE = ['CWE-674'];
const ALLOWED_ADVISORY_CVSS_SCORE = 0;
const ALLOWED_ADVISORY_CVSS_VECTOR = null;
const ALLOWED_ROOT = 'deepmerge-ts';
const ALLOWED_NODE = 'node_modules/deepmerge-ts';
const ALLOWED_VERSION = '7.1.5';
const ALLOWED_RESOLVED = 'https://registry.npmjs.org/deepmerge-ts/-/deepmerge-ts-7.1.5.tgz';
const ALLOWED_INTEGRITY =
  'sha512-HOJkrhaYsweh+W+e74Yn7YStZOilkoPb6fycpwNLKzSPtruFs48nYis0zy5yJz1+ktUhHxoRDJ27RQAWLIJVJw==';
const ALLOWED_PRISMA_DEV_RANGE = '^6.19.3';
const ALLOWED_PRISMA_NODE = 'node_modules/prisma';
const ALLOWED_PRISMA_CONFIG_NODE = 'node_modules/@prisma/config';
const ALLOWED_PRISMA_VERSION = '6.19.3';
const ALLOWED_PRISMA_CONFIG_VERSION = '6.19.3';
const ALLOWED_FIX_NAME = 'prisma';
const ALLOWED_FIX_VERSION = '6.12.0';
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
const ALLOWED_PRISMA_AUDIT_RANGE = '6.13.0-dev.1 - 8.1.0-dev.4';
const ALLOWED_PRISMA_RESOLVED = 'https://registry.npmjs.org/prisma/-/prisma-6.19.3.tgz';
const ALLOWED_PRISMA_CONFIG_RESOLVED = 'https://registry.npmjs.org/@prisma/config/-/config-6.19.3.tgz';
const ALLOWED_PRISMA_INTEGRITY =
  'sha512-++ZJ0ijLrDJF6hNB4t4uxg2br3fC4H9Yc9tcbjr2fcNFP3rh/SBNrAgjhsqBU4Ght8JPrVofG/ZkXfnSfnYsFg==';
const ALLOWED_PRISMA_CONFIG_INTEGRITY =
  'sha512-CBPT44BjlQxEt8kiMEauji2WHTDoVBOKl7UlewXmUgBPnr/oPRZC3psci5chJnYmH0ivEIog2OU9PGWoki3DLQ==';
const SUMMARY_SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];
const KNOWN_SEVERITIES = new Set(SUMMARY_SEVERITIES);
const BLOCKING_SEVERITIES = new Set(['high', 'critical']);
const ALLOWED_GRAPH = {
  'deepmerge-ts': {
    via: [],
    effects: ['@prisma/config'],
    nodes: [ALLOWED_NODE],
    isDirect: false,
    range: ALLOWED_ADVISORY_RANGE,
  },
  '@prisma/config': {
    via: ['deepmerge-ts'],
    effects: ['prisma'],
    nodes: [ALLOWED_PRISMA_CONFIG_NODE],
    isDirect: false,
    range: ALLOWED_PRISMA_AUDIT_RANGE,
  },
  prisma: {
    via: ['@prisma/config'],
    effects: [],
    nodes: [ALLOWED_PRISMA_NODE],
    isDirect: true,
    range: ALLOWED_PRISMA_AUDIT_RANGE,
  },
};

function objectViaEntries(vulnerability) {
  return (vulnerability?.via || []).filter((entry) => entry && typeof entry === 'object');
}

function stringViaEntries(vulnerability) {
  return (vulnerability?.via || []).filter((entry) => typeof entry === 'string');
}

function hasKnownDirectAdvisoryFields(entry) {
  return (
    entry &&
    typeof entry === 'object' &&
    !Array.isArray(entry) &&
    Object.keys(entry).every((key) => DIRECT_ADVISORY_OBJECT_KEYS.has(key))
  );
}

function isExpectedDirectAdvisory(entry) {
  const url = String(entry?.url || '');
  return (
    hasKnownDirectAdvisoryFields(entry) &&
    entry?.source === ALLOWED_ADVISORY_SOURCE &&
    entry?.name === ALLOWED_ROOT &&
    entry?.dependency === ALLOWED_ROOT &&
    entry?.title === ALLOWED_ADVISORY_TITLE &&
    entry?.severity === 'high' &&
    url === `https://github.com/advisories/${ALLOWED_ADVISORY}` &&
    entry?.range === ALLOWED_ADVISORY_RANGE &&
    sameStringMembers(entry?.cwe, ALLOWED_ADVISORY_CWE) &&
    entry?.cvss?.score === ALLOWED_ADVISORY_CVSS_SCORE &&
    entry?.cvss?.vectorString === ALLOWED_ADVISORY_CVSS_VECTOR
  );
}

function sameStringMembers(actual, expected) {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((entry) => typeof entry !== 'string')
  ) {
    return false;
  }

  const actualSet = new Set(actual);
  return actualSet.size === expected.length && expected.every((entry) => actualSet.has(entry));
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

function isOptionalObjectMap(value) {
  return value === undefined || isObjectMap(value);
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

function hasExpectedTemporaryFixState(value) {
  return (
    isValidFixAvailable(value) &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.name === ALLOWED_FIX_NAME &&
    value.version === ALLOWED_FIX_VERSION &&
    value.isSemVerMajor === true
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

function hasValidAuditMetadata(metadata) {
  return metadata === undefined || (metadata && typeof metadata === 'object' && !Array.isArray(metadata));
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

function matchesExpectedGraph(vulnerabilities) {
  return Object.entries(ALLOWED_GRAPH).every(([name, expected]) => {
    const vulnerability = vulnerabilities[name];
    if (
      !vulnerability ||
      vulnerability.severity !== 'high' ||
      !Array.isArray(vulnerability.via) ||
      !hasExpectedTemporaryFixState(vulnerability.fixAvailable)
    ) {
      return false;
    }

    const viaDependencies = stringViaEntries(vulnerability);
    const advisoryEntries = objectViaEntries(vulnerability);
    if (vulnerability.via.length !== viaDependencies.length + advisoryEntries.length) {
      return false;
    }

    if (
      vulnerability.name !== name ||
      vulnerability.isDirect !== expected.isDirect ||
      vulnerability.range !== expected.range ||
      !sameStringMembers(viaDependencies, expected.via) ||
      !sameStringMembers(vulnerability.effects || [], expected.effects) ||
      !sameStringMembers(vulnerability.nodes, expected.nodes)
    ) {
      return false;
    }

    if (name === ALLOWED_ROOT) {
      return advisoryEntries.length === 1 && isExpectedDirectAdvisory(advisoryEntries[0]);
    }

    return advisoryEntries.length === 0;
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

function buildEffectClosure(vulnerabilities, rootName) {
  const closure = new Set([rootName]);
  const queue = [rootName];

  while (queue.length > 0) {
    const current = queue.shift();
    const vulnerability = vulnerabilities[current];
    for (const effect of vulnerability?.effects || []) {
      if (!closure.has(effect)) {
        closure.add(effect);
        queue.push(effect);
      }
    }
  }

  return closure;
}

function evaluateAuditReport(report, lockfile, manifest = lockfile?.packages?.['']) {
  if (
    !report ||
    Object.prototype.hasOwnProperty.call(report, 'error') ||
    !hasExpectedAuditReportVersion(report) ||
    !hasValidAuditMetadata(report.metadata) ||
    !hasValidVulnerabilityEntries(report.vulnerabilities)
  ) {
    return { ok: false, allowed: [], unexpected: ['invalid-audit-report'] };
  }

  const vulnerabilities = report.vulnerabilities;
  const blockingEntries = Object.entries(vulnerabilities).filter(([, vulnerability]) =>
    BLOCKING_SEVERITIES.has(vulnerability?.severity),
  );

  if (!hasConsistentVulnerabilitySummary(report, vulnerabilities)) {
    return { ok: false, allowed: [], unexpected: ['invalid-audit-report'] };
  }

  if (blockingEntries.length === 0) {
    return { ok: true, allowed: [], unexpected: [] };
  }

  const deepmergeLock = lockfile?.packages?.[ALLOWED_NODE];
  const prismaLock = lockfile?.packages?.[ALLOWED_PRISMA_NODE];
  const prismaConfigLock = lockfile?.packages?.[ALLOWED_PRISMA_CONFIG_NODE];
  const rootPackage = lockfile?.packages?.[''];
  const rootDevDependencies = rootPackage?.devDependencies;
  const rootDependencies = rootPackage?.dependencies;
  const manifestDevDependencies = manifest?.devDependencies;
  const manifestDependencies = manifest?.dependencies;
  const prismaIsExpectedDevOnly =
    isObjectMap(rootDevDependencies) &&
    isOptionalObjectMap(rootDependencies) &&
    rootDevDependencies.prisma === ALLOWED_PRISMA_DEV_RANGE &&
    !Object.prototype.hasOwnProperty.call(rootDependencies || {}, 'prisma');
  const manifestPrismaIsExpectedDevOnly =
    isObjectMap(manifestDevDependencies) &&
    isOptionalObjectMap(manifestDependencies) &&
    manifestDevDependencies.prisma === ALLOWED_PRISMA_DEV_RANGE &&
    !Object.prototype.hasOwnProperty.call(manifestDependencies || {}, 'prisma');
  const prismaContextIsExpected =
    prismaLock?.version === ALLOWED_PRISMA_VERSION &&
    prismaLock?.resolved === ALLOWED_PRISMA_RESOLVED &&
    prismaLock?.integrity === ALLOWED_PRISMA_INTEGRITY &&
    prismaLock?.devOptional === true &&
    prismaLock?.dependencies?.['@prisma/config'] === ALLOWED_PRISMA_CONFIG_VERSION &&
    prismaConfigLock?.version === ALLOWED_PRISMA_CONFIG_VERSION &&
    prismaConfigLock?.resolved === ALLOWED_PRISMA_CONFIG_RESOLVED &&
    prismaConfigLock?.integrity === ALLOWED_PRISMA_CONFIG_INTEGRITY &&
    prismaConfigLock?.devOptional === true &&
    prismaConfigLock?.dependencies?.['deepmerge-ts'] === ALLOWED_VERSION;
  const expectedLockState =
    deepmergeLock?.version === ALLOWED_VERSION &&
    deepmergeLock?.resolved === ALLOWED_RESOLVED &&
    deepmergeLock?.integrity === ALLOWED_INTEGRITY &&
    deepmergeLock?.devOptional === true &&
    prismaIsExpectedDevOnly &&
    manifestPrismaIsExpectedDevOnly &&
    prismaContextIsExpected;

  if (!expectedLockState || !matchesExpectedGraph(vulnerabilities)) {
    return {
      ok: false,
      allowed: [],
      unexpected: blockingEntries.map(([name]) => name),
    };
  }

  const closure = buildEffectClosure(vulnerabilities, ALLOWED_ROOT);
  const allowed = [];
  const unexpected = [];

  for (const [name, vulnerability] of blockingEntries) {
    const hasDifferentDirectAdvisory = objectViaEntries(vulnerability).some(
      (entry) => !isExpectedDirectAdvisory(entry),
    );
    const hasUnexpectedViaDependency = stringViaEntries(vulnerability).some((dependency) => !closure.has(dependency));
    const matchesKnownSeverity = vulnerability.severity === 'high';

    if (closure.has(name) && matchesKnownSeverity && !hasDifferentDirectAdvisory && !hasUnexpectedViaDependency) {
      allowed.push(name);
    } else {
      unexpected.push(name);
    }
  }

  return { ok: unexpected.length === 0, allowed, unexpected };
}

function isExpectedAuditExitStatus(status) {
  return status === 0 || status === 1;
}

function isTemporaryExceptionExpired(now = new Date(), deadlineMs = TEMPORARY_EXCEPTION_REVIEW_DEADLINE_MS) {
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
  return !Number.isFinite(nowMs) || !Number.isFinite(deadlineMs) || nowMs >= deadlineMs;
}

function main() {
  const audit = spawnSync('npm', ['audit', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (audit.error || audit.signal || !audit.stdout || !isExpectedAuditExitStatus(audit.status)) {
    const reason =
      audit.error?.message ||
      (audit.signal ? `npm audit terminated by signal ${audit.signal}` : '') ||
      (!audit.stdout ? 'npm audit produced no JSON output' : `npm audit exited with unexpected status ${audit.status}`);
    process.stderr.write(`${reason}\n`);
    process.stderr.write(audit.stderr || '');
    process.exit(1);
  }

  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch (error) {
    process.stderr.write(`Failed to parse npm audit JSON: ${error.message}\n`);
    process.stderr.write(audit.stderr || '');
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

  const lockfile = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const result = evaluateAuditReport(report, lockfile, manifest);

  if (!result.ok) {
    process.stderr.write(
      `Blocking npm audit finding(s): ${result.unexpected.join(', ') || 'allowlist precondition failed'}\n`,
    );
    process.stderr.write(audit.stdout);
    process.stderr.write(audit.stderr || '');
    process.exit(1);
  }

  if (result.allowed.length > 0 && isTemporaryExceptionExpired()) {
    process.stderr.write(
      `Temporary npm audit exception review deadline reached (${TEMPORARY_EXCEPTION_REVIEW_DEADLINE}); re-check #3114 and upstream before extending or removing the exception.\n`,
    );
    process.exit(1);
  }

  if (result.allowed.length > 0) {
    process.stdout.write(
      `Allowed temporary dev-only Prisma audit chain (${ALLOWED_ADVISORY}, ${ALLOWED_ADVISORY_RANGE}): ${result.allowed.join(', ')}\n`,
    );
    process.stdout.write(
      `The exception is pinned to the canonical deepmerge-ts ${ALLOWED_VERSION} npm artifact and the canonical installed Prisma ${ALLOWED_PRISMA_VERSION} -> @prisma/config ${ALLOWED_PRISMA_CONFIG_VERSION} -> deepmerge-ts ${ALLOWED_VERSION} package/lockfile context as dev-only; it will fail closed if the manifest declaration, package source, integrity, dependency graph, severity, advisory metadata, remediation availability or lock state changes, and must be reviewed again by ${TEMPORARY_EXCEPTION_REVIEW_DEADLINE}.\n`,
    );
  } else {
    process.stdout.write('npm audit: no high/critical vulnerabilities found.\n');
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  evaluateAuditReport,
  hasExpectedAuditReportVersion,
  hasExpectedAuditSummary,
  isExpectedAuditExitStatus,
  isTemporaryExceptionExpired,
};

'use strict';

const fs = require('node:fs');
const {
  getTemporaryExceptionReviewDeadline,
  hasExpectedTemporaryExceptionContext,
  isTemporaryExceptionExpired,
} = require('./security-audit.js');
const {
  hasExpectedSecurityAuditLockfileShape,
  hasMatchingSecurityAuditManifestSnapshot,
  hasMatchingSecurityAuditPackageIdentity,
} = require('./security-audit-lockfile.js');
const { loadPackageManifest } = require('./verify-npm-version.js');

const TRACKING_ISSUE = 3114;
const TRACKED_ADVISORY = 'GHSA-ggr8-5vv4-36mx';
const TRACKED_ADVISORY_RANGE = '<8.0.0';
const TRACKED_DEPENDENCY_PATHS = {
  prisma: 'node_modules/prisma',
  prismaConfig: 'node_modules/@prisma/config',
  deepmergeTs: 'node_modules/deepmerge-ts',
};
const SAFE_VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+_-]*$/;
const SAFE_REQUIREMENT_PATTERN = /^[ -~]{1,200}$/;
const SAFE_GITHUB_OUTPUT_PATTERN = /^[ -~]{1,200}$/;
const COMPARABLE_SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const SIMPLE_REQUIREMENT_PATTERN = /^(?:\^|~|>=)?\s*(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/;
const PATCHED_DEEPMERGE_VERSION = Object.freeze({ major: 8, minor: 0, patch: 0 });
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function parseCliOptions(argv = process.argv.slice(2)) {
  const unknownArguments = argv.filter((argument) => argument !== '--json');

  if (unknownArguments.length > 0) {
    throw new Error(`Unknown option${unknownArguments.length === 1 ? '' : 's'}: ${unknownArguments.join(', ')}`);
  }

  return { json: argv.includes('--json') };
}

function getTrackedDependencyVersions(lockfile) {
  const packages = lockfile?.packages;

  return Object.fromEntries(
    Object.entries(TRACKED_DEPENDENCY_PATHS).map(([key, packagePath]) => {
      const version = packages?.[packagePath]?.version;
      return [key, typeof version === 'string' && SAFE_VERSION_PATTERN.test(version) ? version : null];
    }),
  );
}

function parseComparableSemver(version) {
  if (typeof version !== 'string') {
    return null;
  }

  const match = COMPARABLE_SEMVER_PATTERN.exec(version);
  if (!match) {
    return null;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) {
    return null;
  }

  return {
    major,
    minor,
    patch,
    prerelease: match[4] ?? null,
  };
}

function isPatchedDeepmergeVersion(version) {
  const parsed = parseComparableSemver(version);
  if (!parsed) {
    return false;
  }

  if (parsed.major !== PATCHED_DEEPMERGE_VERSION.major) {
    return parsed.major > PATCHED_DEEPMERGE_VERSION.major;
  }
  if (parsed.minor !== PATCHED_DEEPMERGE_VERSION.minor) {
    return parsed.minor > PATCHED_DEEPMERGE_VERSION.minor;
  }
  if (parsed.patch !== PATCHED_DEEPMERGE_VERSION.patch) {
    return parsed.patch > PATCHED_DEEPMERGE_VERSION.patch;
  }

  return parsed.prerelease === null;
}

function getPrismaConfigDeepmergeRequirement(lockfile) {
  const requirement = lockfile?.packages?.[TRACKED_DEPENDENCY_PATHS.prismaConfig]?.dependencies?.['deepmerge-ts'];
  return typeof requirement === 'string' && SAFE_REQUIREMENT_PATTERN.test(requirement) ? requirement : null;
}

function isPatchedDeepmergeRequirement(requirement) {
  if (typeof requirement !== 'string') {
    return false;
  }

  const match = SIMPLE_REQUIREMENT_PATTERN.exec(requirement);
  return Boolean(match && isPatchedDeepmergeVersion(match[1]));
}

function hasForwardRemediationCandidate(lockfile) {
  const versions = getTrackedDependencyVersions(lockfile);
  const requirement = getPrismaConfigDeepmergeRequirement(lockfile);

  return isPatchedDeepmergeVersion(versions.deepmergeTs) && isPatchedDeepmergeRequirement(requirement);
}

function getDaysUntilReviewDeadline(deadline, now = new Date()) {
  const deadlineMs = Date.parse(deadline);
  const nowMs = now.getTime();

  if (!Number.isFinite(deadlineMs) || !Number.isFinite(nowMs)) {
    return null;
  }

  const deltaMs = deadlineMs - nowMs;
  if (deltaMs >= 0) {
    return Math.ceil(deltaMs / MILLISECONDS_PER_DAY);
  }

  return -Math.ceil(Math.abs(deltaMs) / MILLISECONDS_PER_DAY);
}

function getSecurityAuditExceptionStatus({ manifest, lockfile, now = new Date() }) {
  const deadline = getTemporaryExceptionReviewDeadline();
  const checkedAt = Number.isFinite(now.getTime()) ? now.toISOString() : null;
  const daysUntilDeadline = getDaysUntilReviewDeadline(deadline, now);
  const versions = getTrackedDependencyVersions(lockfile);
  const requirements = {
    prismaConfigDeepmergeTs: getPrismaConfigDeepmergeRequirement(lockfile),
  };
  const identity = {
    trackingIssue: TRACKING_ISSUE,
    advisory: TRACKED_ADVISORY,
    advisoryRange: TRACKED_ADVISORY_RANGE,
  };

  if (!hasExpectedSecurityAuditLockfileShape(lockfile)) {
    return {
      ...identity,
      state: 'invalid-input',
      reason: 'lockfile-shape-invalid',
      deadline,
      checkedAt,
      daysUntilDeadline,
      versions,
      requirements,
      message: 'package-lock.json does not satisfy the security audit lockfile preconditions',
    };
  }

  if (!hasMatchingSecurityAuditPackageIdentity(manifest, lockfile)) {
    return {
      ...identity,
      state: 'invalid-input',
      reason: 'package-identity-mismatch',
      deadline,
      checkedAt,
      daysUntilDeadline,
      versions,
      requirements,
      message: 'package.json and package-lock.json package identity do not match',
    };
  }

  if (!hasMatchingSecurityAuditManifestSnapshot(manifest, lockfile)) {
    return {
      ...identity,
      state: 'invalid-input',
      reason: 'manifest-lockfile-snapshot-mismatch',
      deadline,
      checkedAt,
      daysUntilDeadline,
      versions,
      requirements,
      message: 'package.json dependency declarations do not match the package-lock.json root snapshot',
    };
  }

  if (hasForwardRemediationCandidate(lockfile)) {
    return {
      ...identity,
      state: 'forward-remediation-candidate',
      reason: 'forward-remediation-candidate',
      deadline,
      checkedAt,
      daysUntilDeadline,
      versions,
      requirements,
      message:
        'the installed deepmerge-ts version and @prisma/config dependency edge both point to >=8.0.0; run the full security audit and CI before removing the #3114 exception',
    };
  }

  if (!hasExpectedTemporaryExceptionContext(lockfile, manifest)) {
    return {
      ...identity,
      state: 'context-changed',
      reason: 'temporary-exception-context-changed',
      deadline,
      checkedAt,
      daysUntilDeadline,
      versions,
      requirements,
      message:
        'the exact #3114 temporary exception context is no longer present; run the full security audit before removing the exception',
    };
  }

  if (isTemporaryExceptionExpired(now)) {
    return {
      ...identity,
      state: 'expired',
      reason: 'temporary-exception-expired',
      deadline,
      checkedAt,
      daysUntilDeadline,
      versions,
      requirements,
      message: 'the #3114 temporary exception review deadline has been reached',
    };
  }

  return {
    ...identity,
    state: 'active',
    deadline,
    checkedAt,
    daysUntilDeadline,
    versions,
    requirements,
    message: 'the exact #3114 temporary exception context is still active',
  };
}

function formatSecurityAuditExceptionStatus(status, { json = false } = {}) {
  if (json) {
    return `${JSON.stringify(status)}\n`;
  }

  return (
    `security audit exception status: ${status.state}\n` +
    `status reason: ${status.reason ?? 'none'}\n` +
    `tracking issue: #${status.trackingIssue}\n` +
    `tracked advisory: ${status.advisory} (${status.advisoryRange})\n` +
    `status checked at: ${status.checkedAt ?? 'unavailable'}\n` +
    `review deadline: ${status.deadline}\n` +
    `days until review deadline: ${status.daysUntilDeadline ?? 'unavailable'}\n` +
    `prisma: ${status.versions.prisma ?? 'unavailable'}\n` +
    `@prisma/config: ${status.versions.prismaConfig ?? 'unavailable'}\n` +
    `@prisma/config -> deepmerge-ts requirement: ${status.requirements.prismaConfigDeepmergeTs ?? 'unavailable'}\n` +
    `deepmerge-ts: ${status.versions.deepmergeTs ?? 'unavailable'}\n` +
    `${status.message}\n`
  );
}

function writeGitHubOutputs(status, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) {
    return;
  }

  const outputs = {
    state: status.state,
    ...(status.reason ? { reason: status.reason } : {}),
    tracking_issue: String(status.trackingIssue),
    advisory: status.advisory,
    advisory_range: status.advisoryRange,
    checked_at: status.checkedAt ?? 'unavailable',
    deadline: status.deadline,
    days_until_deadline: String(status.daysUntilDeadline ?? 'unavailable'),
    prisma_version: status.versions.prisma ?? 'unavailable',
    prisma_config_version: status.versions.prismaConfig ?? 'unavailable',
    prisma_config_deepmerge_requirement: status.requirements.prismaConfigDeepmergeTs ?? 'unavailable',
    deepmerge_ts_version: status.versions.deepmergeTs ?? 'unavailable',
  };

  for (const [key, value] of Object.entries(outputs)) {
    if (typeof value !== 'string' || !SAFE_GITHUB_OUTPUT_PATTERN.test(value)) {
      throw new Error(`refusing unsafe GitHub Actions output for ${key}`);
    }
  }

  fs.appendFileSync(
    outputPath,
    `${Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`,
    'utf8',
  );
}

function main() {
  let cliOptions;

  try {
    cliOptions = parseCliOptions();
  } catch (error) {
    process.stderr.write(`Invalid security audit status arguments: ${error.message}\n`);
    process.exit(1);
  }

  let manifest;
  let lockfile;

  try {
    manifest = loadPackageManifest(() => fs.readFileSync('package.json', 'utf8'));
    lockfile = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  } catch (error) {
    process.stderr.write(`Failed to read security audit inputs: ${error.message}\n`);
    process.exit(1);
  }

  const status = getSecurityAuditExceptionStatus({ manifest, lockfile });
  process.stdout.write(formatSecurityAuditExceptionStatus(status, cliOptions));

  try {
    writeGitHubOutputs(status);
  } catch (error) {
    process.stderr.write(`Failed to publish security audit status outputs: ${error.message}\n`);
    process.exit(1);
  }

  if (status.state !== 'active') {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  formatSecurityAuditExceptionStatus,
  getDaysUntilReviewDeadline,
  getPrismaConfigDeepmergeRequirement,
  getSecurityAuditExceptionStatus,
  getTrackedDependencyVersions,
  hasForwardRemediationCandidate,
  isPatchedDeepmergeRequirement,
  isPatchedDeepmergeVersion,
  parseCliOptions,
  parseComparableSemver,
  writeGitHubOutputs,
};

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
  const identity = {
    trackingIssue: TRACKING_ISSUE,
    advisory: TRACKED_ADVISORY,
    advisoryRange: TRACKED_ADVISORY_RANGE,
  };

  if (
    !hasExpectedSecurityAuditLockfileShape(lockfile) ||
    !hasMatchingSecurityAuditPackageIdentity(manifest, lockfile) ||
    !hasMatchingSecurityAuditManifestSnapshot(manifest, lockfile)
  ) {
    return {
      ...identity,
      state: 'invalid-input',
      deadline,
      checkedAt,
      daysUntilDeadline,
      versions,
      message: 'package.json / package-lock.json do not satisfy the security audit preconditions',
    };
  }

  if (!hasExpectedTemporaryExceptionContext(lockfile, manifest)) {
    return {
      ...identity,
      state: 'context-changed',
      deadline,
      checkedAt,
      daysUntilDeadline,
      versions,
      message:
        'the exact #3114 temporary exception context is no longer present; run the full security audit before removing the exception',
    };
  }

  if (isTemporaryExceptionExpired(now)) {
    return {
      ...identity,
      state: 'expired',
      deadline,
      checkedAt,
      daysUntilDeadline,
      versions,
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
    message: 'the exact #3114 temporary exception context is still active',
  };
}

function formatSecurityAuditExceptionStatus(status, { json = false } = {}) {
  if (json) {
    return `${JSON.stringify(status)}\n`;
  }

  return (
    `security audit exception status: ${status.state}\n` +
    `tracking issue: #${status.trackingIssue}\n` +
    `tracked advisory: ${status.advisory} (${status.advisoryRange})\n` +
    `status checked at: ${status.checkedAt ?? 'unavailable'}\n` +
    `review deadline: ${status.deadline}\n` +
    `days until review deadline: ${status.daysUntilDeadline ?? 'unavailable'}\n` +
    `prisma: ${status.versions.prisma ?? 'unavailable'}\n` +
    `@prisma/config: ${status.versions.prismaConfig ?? 'unavailable'}\n` +
    `deepmerge-ts: ${status.versions.deepmergeTs ?? 'unavailable'}\n` +
    `${status.message}\n`
  );
}

function writeGitHubOutputs(status, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) {
    return;
  }

  const prismaVersion = status.versions.prisma ?? 'unavailable';
  const prismaConfigVersion = status.versions.prismaConfig ?? 'unavailable';
  const deepmergeTsVersion = status.versions.deepmergeTs ?? 'unavailable';
  const checkedAt = status.checkedAt ?? 'unavailable';
  const daysUntilDeadline = status.daysUntilDeadline ?? 'unavailable';

  fs.appendFileSync(
    outputPath,
    `state=${status.state}\ntracking_issue=${status.trackingIssue}\nadvisory=${status.advisory}\nadvisory_range=${status.advisoryRange}\nchecked_at=${checkedAt}\ndeadline=${status.deadline}\ndays_until_deadline=${daysUntilDeadline}\nprisma_version=${prismaVersion}\nprisma_config_version=${prismaConfigVersion}\ndeepmerge_ts_version=${deepmergeTsVersion}\n`,
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
  getSecurityAuditExceptionStatus,
  getTrackedDependencyVersions,
  parseCliOptions,
  writeGitHubOutputs,
};

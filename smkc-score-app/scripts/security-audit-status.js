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

const TRACKED_DEPENDENCY_PATHS = {
  prisma: 'node_modules/prisma',
  prismaConfig: 'node_modules/@prisma/config',
  deepmergeTs: 'node_modules/deepmerge-ts',
};

function getTrackedDependencyVersions(lockfile) {
  const packages = lockfile?.packages;

  return Object.fromEntries(
    Object.entries(TRACKED_DEPENDENCY_PATHS).map(([key, packagePath]) => {
      const version = packages?.[packagePath]?.version;
      return [key, typeof version === 'string' ? version : null];
    }),
  );
}

function getSecurityAuditExceptionStatus({ manifest, lockfile, now = new Date() }) {
  const deadline = getTemporaryExceptionReviewDeadline();
  const versions = getTrackedDependencyVersions(lockfile);

  if (
    !hasExpectedSecurityAuditLockfileShape(lockfile) ||
    !hasMatchingSecurityAuditPackageIdentity(manifest, lockfile) ||
    !hasMatchingSecurityAuditManifestSnapshot(manifest, lockfile)
  ) {
    return {
      state: 'invalid-input',
      deadline,
      versions,
      message: 'package.json / package-lock.json do not satisfy the security audit preconditions',
    };
  }

  if (!hasExpectedTemporaryExceptionContext(lockfile, manifest)) {
    return {
      state: 'context-changed',
      deadline,
      versions,
      message:
        'the exact #3114 temporary exception context is no longer present; run the full security audit before removing the exception',
    };
  }

  if (isTemporaryExceptionExpired(now)) {
    return {
      state: 'expired',
      deadline,
      versions,
      message: 'the #3114 temporary exception review deadline has been reached',
    };
  }

  return {
    state: 'active',
    deadline,
    versions,
    message: 'the exact #3114 temporary exception context is still active',
  };
}

function writeGitHubOutputs(status, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) {
    return;
  }

  const prismaVersion = status.versions.prisma ?? 'unavailable';
  const prismaConfigVersion = status.versions.prismaConfig ?? 'unavailable';
  const deepmergeTsVersion = status.versions.deepmergeTs ?? 'unavailable';

  fs.appendFileSync(
    outputPath,
    `state=${status.state}\ndeadline=${status.deadline}\nprisma_version=${prismaVersion}\nprisma_config_version=${prismaConfigVersion}\ndeepmerge_ts_version=${deepmergeTsVersion}\n`,
    'utf8',
  );
}

function main() {
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
  process.stdout.write(`security audit exception status: ${status.state}\n`);
  process.stdout.write(`review deadline: ${status.deadline}\n`);
  process.stdout.write(`prisma: ${status.versions.prisma ?? 'unavailable'}\n`);
  process.stdout.write(`@prisma/config: ${status.versions.prismaConfig ?? 'unavailable'}\n`);
  process.stdout.write(`deepmerge-ts: ${status.versions.deepmergeTs ?? 'unavailable'}\n`);
  process.stdout.write(`${status.message}\n`);

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

module.exports = { getSecurityAuditExceptionStatus, getTrackedDependencyVersions, writeGitHubOutputs };

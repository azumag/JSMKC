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

function getSecurityAuditExceptionStatus({ manifest, lockfile, now = new Date() }) {
  const deadline = getTemporaryExceptionReviewDeadline();

  if (
    !hasExpectedSecurityAuditLockfileShape(lockfile) ||
    !hasMatchingSecurityAuditPackageIdentity(manifest, lockfile) ||
    !hasMatchingSecurityAuditManifestSnapshot(manifest, lockfile)
  ) {
    return {
      state: 'invalid-input',
      deadline,
      message: 'package.json / package-lock.json do not satisfy the security audit preconditions',
    };
  }

  if (!hasExpectedTemporaryExceptionContext(lockfile, manifest)) {
    return {
      state: 'context-changed',
      deadline,
      message:
        'the exact #3114 temporary exception context is no longer present; run the full security audit before removing the exception',
    };
  }

  if (isTemporaryExceptionExpired(now)) {
    return {
      state: 'expired',
      deadline,
      message: 'the #3114 temporary exception review deadline has been reached',
    };
  }

  return {
    state: 'active',
    deadline,
    message: 'the exact #3114 temporary exception context is still active',
  };
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
  process.stdout.write(`${status.message}\n`);

  if (status.state !== 'active') {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { getSecurityAuditExceptionStatus };

'use strict';

const fs = require('node:fs');

const EXPECTED_LOCKFILE_VERSION = 3;

function hasExpectedSecurityAuditLockfileShape(lockfile) {
  if (
    !lockfile ||
    typeof lockfile !== 'object' ||
    Array.isArray(lockfile) ||
    lockfile.lockfileVersion !== EXPECTED_LOCKFILE_VERSION ||
    !lockfile.packages ||
    typeof lockfile.packages !== 'object' ||
    Array.isArray(lockfile.packages)
  ) {
    return false;
  }

  const rootPackage = lockfile.packages[''];
  return Boolean(rootPackage && typeof rootPackage === 'object' && !Array.isArray(rootPackage));
}

function main() {
  let lockfile;
  try {
    lockfile = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  } catch (error) {
    process.stderr.write(`Failed to read package-lock.json for security audit: ${error.message}\n`);
    process.exit(1);
  }

  if (!hasExpectedSecurityAuditLockfileShape(lockfile)) {
    process.stderr.write(
      `Security audit requires package-lock.json lockfileVersion ${EXPECTED_LOCKFILE_VERSION} with a packages object and root package snapshot; review lockfile schema drift before continuing.\n`,
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { hasExpectedSecurityAuditLockfileShape };

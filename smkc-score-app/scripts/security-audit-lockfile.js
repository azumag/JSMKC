'use strict';

const fs = require('node:fs');

const EXPECTED_LOCKFILE_VERSION = 3;

function hasExpectedSecurityAuditLockfileShape(lockfile) {
  return Boolean(
    lockfile &&
      typeof lockfile === 'object' &&
      !Array.isArray(lockfile) &&
      lockfile.lockfileVersion === EXPECTED_LOCKFILE_VERSION &&
      lockfile.packages &&
      typeof lockfile.packages === 'object' &&
      !Array.isArray(lockfile.packages),
  );
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
      `Security audit requires package-lock.json lockfileVersion ${EXPECTED_LOCKFILE_VERSION} with a packages object; review lockfile schema drift before continuing.\n`,
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { hasExpectedSecurityAuditLockfileShape };

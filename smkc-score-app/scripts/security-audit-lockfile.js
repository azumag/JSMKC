'use strict';

const fs = require('node:fs');

const EXPECTED_LOCKFILE_VERSION = 3;
const DEPENDENCY_SNAPSHOT_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

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

  if (
    Object.values(lockfile.packages).some(
      (packageEntry) => !packageEntry || typeof packageEntry !== 'object' || Array.isArray(packageEntry),
    )
  ) {
    return false;
  }

  return Object.prototype.hasOwnProperty.call(lockfile.packages, '');
}

function isOptionalDependencyMap(value) {
  return value === undefined || Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasMatchingSecurityAuditPackageIdentity(manifest, lockfile) {
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    typeof manifest.name !== 'string' ||
    manifest.name.length === 0 ||
    typeof manifest.version !== 'string' ||
    manifest.version.length === 0 ||
    !hasExpectedSecurityAuditLockfileShape(lockfile)
  ) {
    return false;
  }

  const rootPackage = lockfile.packages[''];
  return (
    lockfile.name === manifest.name &&
    lockfile.version === manifest.version &&
    rootPackage.name === manifest.name &&
    rootPackage.version === manifest.version
  );
}

function hasMatchingSecurityAuditManifestSnapshot(manifest, lockfile) {
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    !hasExpectedSecurityAuditLockfileShape(lockfile)
  ) {
    return false;
  }

  const rootPackage = lockfile.packages[''];
  return DEPENDENCY_SNAPSHOT_FIELDS.every((field) => {
    const manifestMap = manifest[field];
    const lockfileMap = rootPackage[field];
    if (!isOptionalDependencyMap(manifestMap) || !isOptionalDependencyMap(lockfileMap)) {
      return false;
    }

    const manifestEntries = Object.entries(manifestMap || {});
    const lockfileEntries = Object.entries(lockfileMap || {});
    return (
      manifestEntries.length === lockfileEntries.length &&
      manifestEntries.every(
        ([name, range]) =>
          typeof range === 'string' &&
          range.length > 0 &&
          Object.prototype.hasOwnProperty.call(lockfileMap || {}, name) &&
          lockfileMap[name] === range,
      ) &&
      lockfileEntries.every(([, range]) => typeof range === 'string' && range.length > 0)
    );
  });
}

function main() {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  } catch (error) {
    process.stderr.write(`Failed to read package.json for security audit: ${error.message}\n`);
    process.exit(1);
  }

  let lockfile;
  try {
    lockfile = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  } catch (error) {
    process.stderr.write(`Failed to read package-lock.json for security audit: ${error.message}\n`);
    process.exit(1);
  }

  if (!hasExpectedSecurityAuditLockfileShape(lockfile)) {
    process.stderr.write(
      `Security audit requires package-lock.json lockfileVersion ${EXPECTED_LOCKFILE_VERSION} with a packages object, object-valued package entries and a root package snapshot; review lockfile schema drift before continuing.\n`,
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
}

if (require.main === module) {
  main();
}

module.exports = {
  hasExpectedSecurityAuditLockfileShape,
  hasMatchingSecurityAuditPackageIdentity,
  hasMatchingSecurityAuditManifestSnapshot,
};

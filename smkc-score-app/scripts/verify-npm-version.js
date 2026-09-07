'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

function parsePinnedNpmVersion(packageManager) {
  if (typeof packageManager !== 'string') {
    return null;
  }

  const match = /^npm@(\d+\.\d+\.\d+)$/.exec(packageManager.trim());
  return match?.[1] ?? null;
}

function isExpectedNpmVersion(packageManager, runtimeVersion) {
  const expectedVersion = parsePinnedNpmVersion(packageManager);
  return expectedVersion !== null && typeof runtimeVersion === 'string' && runtimeVersion.trim() === expectedVersion;
}

function loadPackageManifest(readPackageJson = () => fs.readFileSync('package.json', 'utf8')) {
  try {
    return JSON.parse(readPackageJson());
  } catch (error) {
    throw new Error(`Failed to read package.json while verifying npm version: ${error.message}`);
  }
}

function verifyNpmRuntime({
  manifest,
  readPackageJson = () => fs.readFileSync('package.json', 'utf8'),
  runNpmVersion = () =>
    spawnSync('npm', ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
} = {}) {
  const resolvedManifest = manifest === undefined ? loadPackageManifest(readPackageJson) : manifest;
  const expectedVersion = parsePinnedNpmVersion(resolvedManifest?.packageManager);
  if (!expectedVersion) {
    throw new Error('package.json packageManager must pin an exact npm x.y.z version');
  }

  const npmVersion = runNpmVersion();
  if (npmVersion.error || npmVersion.signal || npmVersion.status !== 0 || !npmVersion.stdout) {
    const reason =
      npmVersion.error?.message ||
      (npmVersion.signal ? `npm --version terminated by signal ${npmVersion.signal}` : '') ||
      (!npmVersion.stdout
        ? 'npm --version produced no output'
        : `npm --version exited with status ${npmVersion.status}`);
    const stderr = typeof npmVersion.stderr === 'string' ? npmVersion.stderr.trim() : '';
    throw new Error(stderr ? `${reason}: ${stderr}` : reason);
  }

  const runtimeVersion = npmVersion.stdout.trim();
  if (!isExpectedNpmVersion(resolvedManifest?.packageManager, runtimeVersion)) {
    throw new Error(
      `npm runtime version mismatch: expected ${expectedVersion}, received ${runtimeVersion || '(empty)'}`,
    );
  }

  return runtimeVersion;
}

function main() {
  try {
    const runtimeVersion = verifyNpmRuntime();
    process.stdout.write(`npm runtime version verified: ${runtimeVersion}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  isExpectedNpmVersion,
  loadPackageManifest,
  parsePinnedNpmVersion,
  verifyNpmRuntime,
};

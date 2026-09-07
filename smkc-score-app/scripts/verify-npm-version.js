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

function main() {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  } catch (error) {
    process.stderr.write(`Failed to read package.json while verifying npm version: ${error.message}\n`);
    process.exit(1);
  }

  const expectedVersion = parsePinnedNpmVersion(manifest.packageManager);
  if (!expectedVersion) {
    process.stderr.write('package.json packageManager must pin an exact npm x.y.z version\n');
    process.exit(1);
  }

  const npmVersion = spawnSync('npm', ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (npmVersion.error || npmVersion.signal || npmVersion.status !== 0 || !npmVersion.stdout) {
    const reason =
      npmVersion.error?.message ||
      (npmVersion.signal ? `npm --version terminated by signal ${npmVersion.signal}` : '') ||
      (!npmVersion.stdout ? 'npm --version produced no output' : `npm --version exited with status ${npmVersion.status}`);
    process.stderr.write(`${reason}\n`);
    process.stderr.write(npmVersion.stderr || '');
    process.exit(1);
  }

  const runtimeVersion = npmVersion.stdout.trim();
  if (!isExpectedNpmVersion(manifest.packageManager, runtimeVersion)) {
    process.stderr.write(`npm runtime version mismatch: expected ${expectedVersion}, received ${runtimeVersion || '(empty)'}\n`);
    process.exit(1);
  }

  process.stdout.write(`npm runtime version verified: ${runtimeVersion}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  isExpectedNpmVersion,
  parsePinnedNpmVersion,
};

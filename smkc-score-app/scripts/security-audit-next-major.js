'use strict';

const fs = require('node:fs');
const {
  formatCompatiblePrismaReleaseStatus,
  getPrismaVersionSelector,
  inspectCompatiblePrismaRelease,
  parseCliOptions,
  writeGitHubOutputs,
} = require('./security-audit-upstream.js');

const CARET_SEMVER_SELECTOR_PATTERN = /^\^\s*(\d+)\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function getNextMajorPrismaSelector(manifest) {
  const currentPrismaSelector = getPrismaVersionSelector(manifest);
  const match = CARET_SEMVER_SELECTOR_PATTERN.exec(currentPrismaSelector);

  if (!match) {
    throw new Error('package.json devDependencies.prisma must use a caret SemVer selector for next-major probing');
  }

  const currentMajor = Number(match[1]);
  if (!Number.isSafeInteger(currentMajor) || currentMajor >= Number.MAX_SAFE_INTEGER) {
    throw new Error('package.json devDependencies.prisma has an unsupported major version');
  }

  return `^${currentMajor + 1}.0.0`;
}

function inspectNextMajorPrismaRelease({ manifest, npmView }) {
  const currentPrismaSelector = getPrismaVersionSelector(manifest);
  const nextMajorPrismaSelector = getNextMajorPrismaSelector(manifest);
  const nextMajorStatus = inspectCompatiblePrismaRelease({
    manifest: { devDependencies: { prisma: nextMajorPrismaSelector } },
    npmView,
  });

  return {
    ...nextMajorStatus,
    currentPrismaSelector,
  };
}

function formatNextMajorPrismaReleaseStatus(status, { json = false } = {}) {
  if (json) {
    return `${JSON.stringify(status)}\n`;
  }

  return (
    `current manifest prisma selector: ${status.currentPrismaSelector}\n` +
    `next-major prisma selector: ${status.prismaSelector}\n` +
    formatCompatiblePrismaReleaseStatus(status)
  );
}

function writeNextMajorGitHubOutputs(status, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) {
    return;
  }

  writeGitHubOutputs(status, outputPath);
  fs.appendFileSync(outputPath, `current_prisma_selector=${status.currentPrismaSelector}\n`, 'utf8');
}

function main() {
  let cliOptions;

  try {
    cliOptions = parseCliOptions();
  } catch (error) {
    process.stderr.write(`Invalid next-major Prisma upstream arguments: ${error.message}\n`);
    process.exit(1);
  }

  let manifest;

  try {
    manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  } catch (error) {
    process.stderr.write(`Failed to read package.json: ${error.message}\n`);
    process.exit(1);
  }

  try {
    const status = inspectNextMajorPrismaRelease({ manifest });
    process.stdout.write(formatNextMajorPrismaReleaseStatus(status, cliOptions));
    writeNextMajorGitHubOutputs(status);
  } catch (error) {
    process.stderr.write(`Failed to inspect next-major Prisma release: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  CARET_SEMVER_SELECTOR_PATTERN,
  formatNextMajorPrismaReleaseStatus,
  getNextMajorPrismaSelector,
  inspectNextMajorPrismaRelease,
  writeNextMajorGitHubOutputs,
};

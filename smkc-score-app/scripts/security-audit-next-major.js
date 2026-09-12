'use strict';

const fs = require('node:fs');
const {
  getPrismaVersionSelector,
  inspectCompatiblePrismaRelease,
  parseCliOptions,
  runNpmView,
  selectLatestVersion,
  writeGitHubOutputs,
} = require('./security-audit-upstream.js');

const CARET_SEMVER_SELECTOR_PATTERN = /^\^\s*(\d+)\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SAFE_OUTPUT_PATTERN = /^[ -~]{1,200}$/;

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

function inspectPublishedRemediationPackageSet(status, npmView) {
  if (status?.state !== 'compatible-forward-remediation-available') {
    return {
      state: 'not-applicable',
      reason: 'upstream-remediation-not-applicable',
      prismaClientSelector: null,
      prismaClientVersion: null,
      prismaAdapterD1Selector: null,
      prismaAdapterD1Version: null,
    };
  }

  const candidateVersion = status.latestCompatiblePrismaVersion;
  const prismaClientSelector = candidateVersion;
  const prismaAdapterD1Selector = candidateVersion;
  let prismaClientVersion = null;
  let prismaAdapterD1Version = null;

  try {
    prismaClientVersion = selectLatestVersion(npmView(`@prisma/client@${prismaClientSelector}`, 'version'));
  } catch {
    return {
      state: 'unavailable',
      reason: 'prisma-client-registry-unavailable',
      prismaClientSelector,
      prismaClientVersion,
      prismaAdapterD1Selector,
      prismaAdapterD1Version,
    };
  }

  if (prismaClientVersion !== candidateVersion) {
    return {
      state: 'incomplete',
      reason: 'runtime-package-version-mismatch',
      prismaClientSelector,
      prismaClientVersion,
      prismaAdapterD1Selector,
      prismaAdapterD1Version,
    };
  }

  try {
    prismaAdapterD1Version = selectLatestVersion(npmView(`@prisma/adapter-d1@${prismaAdapterD1Selector}`, 'version'));
  } catch {
    return {
      state: 'unavailable',
      reason: 'adapter-d1-registry-unavailable',
      prismaClientSelector,
      prismaClientVersion,
      prismaAdapterD1Selector,
      prismaAdapterD1Version,
    };
  }

  const packageSetReady = prismaAdapterD1Version === candidateVersion;

  return {
    state: packageSetReady ? 'ready' : 'incomplete',
    reason: packageSetReady ? 'published-package-set-ready' : 'runtime-package-version-mismatch',
    prismaClientSelector,
    prismaClientVersion,
    prismaAdapterD1Selector,
    prismaAdapterD1Version,
  };
}

function inspectNextMajorPrismaRelease({ manifest, npmView = runNpmView }) {
  const currentPrismaSelector = getPrismaVersionSelector(manifest);
  const nextMajorPrismaSelector = getNextMajorPrismaSelector(manifest);
  const nextMajorStatus = inspectCompatiblePrismaRelease({
    manifest: { devDependencies: { prisma: nextMajorPrismaSelector } },
    npmView,
  });
  const publishedRemediationPackageSet = inspectPublishedRemediationPackageSet(nextMajorStatus, npmView);

  return {
    ...nextMajorStatus,
    currentPrismaSelector,
    publishedRemediationPackageSet,
  };
}

function getPublishedRemediationCandidate(status) {
  if (
    status?.state !== 'compatible-forward-remediation-available' ||
    status?.publishedRemediationPackageSet?.state !== 'ready'
  ) {
    return null;
  }

  return status.latestCompatiblePrismaVersion;
}

function formatNextMajorPrismaReleaseStatus(status, { json = false } = {}) {
  if (json) {
    return `${JSON.stringify(status)}\n`;
  }

  const publishedRemediationCandidate = getPublishedRemediationCandidate(status);
  const publishedRemediationPackageSet = status.publishedRemediationPackageSet ?? {
    state: 'unavailable',
    reason: 'not-checked',
    prismaClientSelector: null,
    prismaClientVersion: null,
    prismaAdapterD1Selector: null,
    prismaAdapterD1Version: null,
  };

  return (
    `next-major Prisma upstream status: ${status.state}\n` +
    `registry: ${status.registry}\n` +
    `current manifest prisma selector: ${status.currentPrismaSelector}\n` +
    `next-major prisma selector: ${status.prismaSelector}\n` +
    `latest next-major prisma: ${status.latestCompatiblePrismaVersion}\n` +
    `published remediation candidate: ${publishedRemediationCandidate ?? 'none'}\n` +
    `published remediation package set: ${publishedRemediationPackageSet.state}\n` +
    `published remediation package set reason: ${publishedRemediationPackageSet.reason ?? 'unspecified'}\n` +
    `candidate @prisma/client selector: ${publishedRemediationPackageSet.prismaClientSelector ?? 'none'}\n` +
    `candidate @prisma/client: ${publishedRemediationPackageSet.prismaClientVersion ?? 'none'}\n` +
    `candidate @prisma/adapter-d1 selector: ${publishedRemediationPackageSet.prismaAdapterD1Selector ?? 'none'}\n` +
    `candidate @prisma/adapter-d1: ${publishedRemediationPackageSet.prismaAdapterD1Version ?? 'none'}\n` +
    `prisma -> @prisma/config selector: ${status.prismaConfigSelector}\n` +
    `latest next-major @prisma/config: ${status.latestCompatiblePrismaConfigVersion}\n` +
    `@prisma/config -> deepmerge-ts requirement: ${status.prismaConfigDeepmergeRequirement ?? 'absent'}\n`
  );
}

function writeNextMajorGitHubOutputs(status, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) {
    return;
  }

  if (typeof status.currentPrismaSelector !== 'string' || !SAFE_OUTPUT_PATTERN.test(status.currentPrismaSelector)) {
    throw new Error('refusing unsafe GitHub Actions output for current_prisma_selector');
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
  getPublishedRemediationCandidate,
  inspectNextMajorPrismaRelease,
  inspectPublishedRemediationPackageSet,
  writeNextMajorGitHubOutputs,
};

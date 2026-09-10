'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { isPatchedDeepmergeRequirement, parseComparableSemver } = require('./security-audit-status.js');

const CANONICAL_NPM_REGISTRY = 'https://registry.npmjs.org/';
const NPM_VIEW_TIMEOUT_MS = 60_000;
const SAFE_OUTPUT_PATTERN = /^[^\r\n]{1,200}$/;

function getPrismaVersionSelector(manifest) {
  const selector = manifest?.devDependencies?.prisma;

  if (typeof selector !== 'string' || !SAFE_OUTPUT_PATTERN.test(selector)) {
    throw new Error('package.json devDependencies.prisma must be a non-empty single-line string');
  }

  return selector;
}

function getPrismaConfigVersionSelector(prismaDependencies) {
  const selector = prismaDependencies?.['@prisma/config'];

  if (typeof selector !== 'string' || !SAFE_OUTPUT_PATTERN.test(selector)) {
    throw new Error('Prisma package metadata must contain a safe @prisma/config dependency selector');
  }

  return selector;
}

function parseNpmViewJson(stdout, label) {
  if (typeof stdout !== 'string' || stdout.trim() === '') {
    throw new Error(`npm view returned empty output for ${label}`);
  }

  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`npm view returned invalid JSON for ${label}: ${error.message}`);
  }
}

function runNpmView(selector, field, spawn = spawnSync) {
  const result = spawn('npm', ['view', selector, field, '--json', `--registry=${CANONICAL_NPM_REGISTRY}`], {
    encoding: 'utf8',
    timeout: NPM_VIEW_TIMEOUT_MS,
  });

  if (result.error) {
    throw new Error(`failed to run npm view for ${selector}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    throw new Error(`npm view failed for ${selector}${stderr ? `: ${stderr}` : ''}`);
  }

  return parseNpmViewJson(result.stdout, `${selector} ${field}`);
}

function compareComparableSemver(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) {
      return left[key] - right[key];
    }
  }

  if (left.prerelease === right.prerelease) {
    return 0;
  }
  if (left.prerelease === null) {
    return 1;
  }
  if (right.prerelease === null) {
    return -1;
  }

  return left.prerelease.localeCompare(right.prerelease);
}

function normalizeVersionCandidates(npmViewValue) {
  if (typeof npmViewValue === 'string') {
    return [npmViewValue];
  }

  if (Array.isArray(npmViewValue)) {
    return npmViewValue;
  }

  if (npmViewValue && typeof npmViewValue === 'object') {
    return Object.values(npmViewValue).map((value) => {
      if (typeof value === 'string') {
        return value;
      }

      if (value && typeof value === 'object' && typeof value.version === 'string') {
        return value.version;
      }

      throw new Error('npm view returned an invalid Prisma version collection');
    });
  }

  throw new Error('npm view returned an invalid Prisma version collection');
}

function selectLatestVersion(npmViewValue) {
  const versions = normalizeVersionCandidates(npmViewValue);

  if (versions.length === 0) {
    throw new Error('npm view returned no compatible Prisma versions');
  }

  const parsedVersions = versions.map((version) => {
    if (typeof version !== 'string' || !SAFE_OUTPUT_PATTERN.test(version)) {
      throw new Error('npm view returned an invalid Prisma version');
    }

    const parsed = parseComparableSemver(version);
    if (!parsed) {
      throw new Error(`npm view returned a non-semver Prisma version: ${version}`);
    }

    return { parsed, version };
  });
  const stableVersions = parsedVersions.filter(({ parsed }) => parsed.prerelease === null);

  if (stableVersions.length === 0) {
    throw new Error('npm view returned no stable compatible Prisma versions');
  }

  stableVersions.sort((left, right) => compareComparableSemver(left.parsed, right.parsed));
  return stableVersions.at(-1).version;
}

function inspectCompatiblePrismaRelease({ manifest, npmView = runNpmView }) {
  const prismaSelector = getPrismaVersionSelector(manifest);
  const compatibleVersions = npmView(`prisma@${prismaSelector}`, 'version');
  const latestCompatiblePrismaVersion = selectLatestVersion(compatibleVersions);
  const prismaDependencies = npmView(`prisma@${latestCompatiblePrismaVersion}`, 'dependencies');
  const prismaConfigSelector = getPrismaConfigVersionSelector(prismaDependencies);
  const compatiblePrismaConfigVersions = npmView(`@prisma/config@${prismaConfigSelector}`, 'version');
  const latestCompatiblePrismaConfigVersion = selectLatestVersion(compatiblePrismaConfigVersions);
  const prismaConfigDeepmergeRequirement = npmView(
    `@prisma/config@${latestCompatiblePrismaConfigVersion}`,
    'dependencies.deepmerge-ts',
  );

  if (
    typeof prismaConfigDeepmergeRequirement !== 'string' ||
    !SAFE_OUTPUT_PATTERN.test(prismaConfigDeepmergeRequirement)
  ) {
    throw new Error('npm view returned an invalid @prisma/config -> deepmerge-ts requirement');
  }

  const state = isPatchedDeepmergeRequirement(prismaConfigDeepmergeRequirement)
    ? 'compatible-forward-remediation-available'
    : 'compatible-release-still-vulnerable';

  return {
    state,
    registry: CANONICAL_NPM_REGISTRY,
    prismaSelector,
    latestCompatiblePrismaVersion,
    prismaConfigSelector,
    latestCompatiblePrismaConfigVersion,
    prismaConfigDeepmergeRequirement,
  };
}

function formatCompatiblePrismaReleaseStatus(status) {
  return (
    `compatible Prisma upstream status: ${status.state}\n` +
    `registry: ${status.registry}\n` +
    `manifest prisma selector: ${status.prismaSelector}\n` +
    `latest compatible prisma: ${status.latestCompatiblePrismaVersion}\n` +
    `prisma -> @prisma/config selector: ${status.prismaConfigSelector}\n` +
    `latest compatible @prisma/config: ${status.latestCompatiblePrismaConfigVersion}\n` +
    `@prisma/config -> deepmerge-ts requirement: ${status.prismaConfigDeepmergeRequirement}\n`
  );
}

function writeGitHubOutputs(status, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) {
    return;
  }

  const outputs = {
    state: status.state,
    registry: status.registry,
    prisma_selector: status.prismaSelector,
    latest_compatible_prisma_version: status.latestCompatiblePrismaVersion,
    prisma_config_selector: status.prismaConfigSelector,
    latest_compatible_prisma_config_version: status.latestCompatiblePrismaConfigVersion,
    prisma_config_deepmerge_requirement: status.prismaConfigDeepmergeRequirement,
  };

  for (const [key, value] of Object.entries(outputs)) {
    if (typeof value !== 'string' || !SAFE_OUTPUT_PATTERN.test(value)) {
      throw new Error(`refusing unsafe GitHub Actions output for ${key}`);
    }
  }

  fs.appendFileSync(
    outputPath,
    `${Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`,
    'utf8',
  );
}

function main() {
  let manifest;

  try {
    manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  } catch (error) {
    process.stderr.write(`Failed to read package.json: ${error.message}\n`);
    process.exit(1);
  }

  let status;

  try {
    status = inspectCompatiblePrismaRelease({ manifest });
    process.stdout.write(formatCompatiblePrismaReleaseStatus(status));
    writeGitHubOutputs(status);
  } catch (error) {
    process.stderr.write(`Failed to inspect compatible Prisma release: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  CANONICAL_NPM_REGISTRY,
  NPM_VIEW_TIMEOUT_MS,
  compareComparableSemver,
  formatCompatiblePrismaReleaseStatus,
  getPrismaConfigVersionSelector,
  getPrismaVersionSelector,
  inspectCompatiblePrismaRelease,
  normalizeVersionCandidates,
  parseNpmViewJson,
  runNpmView,
  selectLatestVersion,
  writeGitHubOutputs,
};

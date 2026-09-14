'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { isPatchedDeepmergeRequirement, parseComparableSemver } = require('./security-audit-status.js');
const { formatUpstreamProbeFailure, getUpstreamDiagnosticMessage } = require('./security-audit-upstream-diagnostic.js');

const CANONICAL_NPM_REGISTRY = 'https://registry.npmjs.org/';
const NPM_VIEW_TIMEOUT_MS = 60_000;
const NPM_VIEW_MAX_BUFFER_BYTES = 4 * 1024 * 1024;
const NPM_VIEW_DIAGNOSTIC_MAX_LENGTH = 500;
const SAFE_OUTPUT_PATTERN = /^[ -~]{1,200}$/;
const SEMVER_NUMERIC_IDENTIFIER_PATTERN = String.raw`(?:0|[1-9]\d*)`;
const SEMVER_PRERELEASE_IDENTIFIER_PATTERN = String.raw`(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)`;
const SEMVER_VERSION_PATTERN = String.raw`${SEMVER_NUMERIC_IDENTIFIER_PATTERN}\.${SEMVER_NUMERIC_IDENTIFIER_PATTERN}\.${SEMVER_NUMERIC_IDENTIFIER_PATTERN}(?:-${SEMVER_PRERELEASE_IDENTIFIER_PATTERN}(?:\.${SEMVER_PRERELEASE_IDENTIFIER_PATTERN})*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?`;
const REGISTRY_SEMVER_SELECTOR_PATTERN = new RegExp(String.raw`^(?:\^|~|>=|>|<=|<)?\s*${SEMVER_VERSION_PATTERN}$`);
const CURRENT_COMPATIBLE_PRISMA_SELECTOR_PATTERN = new RegExp(String.raw`^(?:\^|~)?\s*${SEMVER_VERSION_PATTERN}$`);

function parseCliOptions(argv = process.argv.slice(2)) {
  const unknownArguments = argv.filter((argument) => argument !== '--json');

  if (unknownArguments.length > 0) {
    throw new Error(`Unknown option${unknownArguments.length === 1 ? '' : 's'}: ${unknownArguments.join(', ')}`);
  }

  return { json: argv.includes('--json') };
}

function isRegistrySemverSelector(selector) {
  return (
    typeof selector === 'string' &&
    SAFE_OUTPUT_PATTERN.test(selector) &&
    REGISTRY_SEMVER_SELECTOR_PATTERN.test(selector)
  );
}

function isCurrentCompatiblePrismaSelector(selector) {
  return (
    typeof selector === 'string' &&
    SAFE_OUTPUT_PATTERN.test(selector) &&
    CURRENT_COMPATIBLE_PRISMA_SELECTOR_PATTERN.test(selector)
  );
}

function getPrismaVersionSelector(manifest) {
  const selector = manifest?.devDependencies?.prisma;

  if (!isCurrentCompatiblePrismaSelector(selector)) {
    throw new Error(
      'package.json devDependencies.prisma must be an exact, caret, or tilde registry SemVer selector for current-compatible probing',
    );
  }

  return selector;
}

function getRuntimePackageVersionSelector(manifest, packageName) {
  const selector = manifest?.dependencies?.[packageName];

  if (!isRegistrySemverSelector(selector)) {
    throw new Error(`package.json dependencies.${packageName} must be a registry SemVer selector`);
  }

  return selector;
}

function getPrismaConfigVersionSelector(prismaDependencies) {
  const selector = prismaDependencies?.['@prisma/config'];

  if (!isRegistrySemverSelector(selector)) {
    throw new Error('Prisma package metadata must contain a registry SemVer @prisma/config dependency selector');
  }

  return selector;
}

function getPrismaConfigDeepmergeRequirement(prismaConfigDependencies) {
  if (
    !prismaConfigDependencies ||
    typeof prismaConfigDependencies !== 'object' ||
    Array.isArray(prismaConfigDependencies)
  ) {
    throw new Error('npm view returned invalid @prisma/config dependencies metadata');
  }

  const requirement = prismaConfigDependencies['deepmerge-ts'];
  if (requirement === undefined) {
    return null;
  }

  if (typeof requirement !== 'string' || !SAFE_OUTPUT_PATTERN.test(requirement)) {
    throw new Error('npm view returned an invalid @prisma/config -> deepmerge-ts requirement');
  }

  return requirement;
}

function parseNpmViewJson(stdout, label) {
  if (typeof stdout !== 'string' || stdout.trim() === '') {
    throw new Error(`npm view returned empty output for ${label}`);
  }

  try {
    return JSON.parse(stdout);
  } catch (error) {
    const parserMessage = sanitizeNpmViewDiagnostic(getUpstreamDiagnosticMessage(error));
    throw new Error(`npm view returned invalid JSON for ${label}${parserMessage ? `: ${parserMessage}` : ''}`);
  }
}

function sanitizeNpmViewDiagnostic(value, maxLength = NPM_VIEW_DIAGNOSTIC_MAX_LENGTH) {
  if (typeof value !== 'string' || value.length === 0) {
    return '';
  }

  if (!Number.isSafeInteger(maxLength) || maxLength < 4) {
    throw new Error('npm view diagnostic maxLength must be a safe integer >= 4');
  }

  const visible = value
    .replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g, (character) => {
      if (character === '\n') return '\\n';
      if (character === '\r') return '\\r';
      if (character === '\t') return '\\t';
      if (character === '\u2028') return '\\u2028';
      if (character === '\u2029') return '\\u2029';
      if (character.charCodeAt(0) > 0x7f) {
        return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
      }

      return `\\x${character.charCodeAt(0).toString(16).padStart(2, '0')}`;
    })
    .trim();

  if (visible.length <= maxLength) {
    return visible;
  }

  return `${visible.slice(0, maxLength - 3)}...`;
}

function runNpmView(selector, field, spawn = spawnSync) {
  const result = spawn('npm', ['view', selector, field, '--json', `--registry=${CANONICAL_NPM_REGISTRY}`], {
    encoding: 'utf8',
    timeout: NPM_VIEW_TIMEOUT_MS,
    maxBuffer: NPM_VIEW_MAX_BUFFER_BYTES,
  });
  const safeSelector = sanitizeNpmViewDiagnostic(String(selector));
  const safeField = sanitizeNpmViewDiagnostic(String(field));

  if (result.error) {
    const errorMessage = sanitizeNpmViewDiagnostic(result.error.message);
    throw new Error(`failed to run npm view for ${safeSelector}${errorMessage ? `: ${errorMessage}` : ''}`);
  }

  if (result.status !== 0) {
    const stderr = sanitizeNpmViewDiagnostic(result.stderr);
    throw new Error(`npm view failed for ${safeSelector}${stderr ? `: ${stderr}` : ''}`);
  }

  return parseNpmViewJson(result.stdout, `${safeSelector} ${safeField}`);
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
  const prismaConfigDependencies = npmView(`@prisma/config@${latestCompatiblePrismaConfigVersion}`, 'dependencies');
  const prismaConfigDeepmergeRequirement = getPrismaConfigDeepmergeRequirement(prismaConfigDependencies);

  const state =
    prismaConfigDeepmergeRequirement === null || isPatchedDeepmergeRequirement(prismaConfigDeepmergeRequirement)
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

function inspectPublishedRemediationPackageSet(status, manifest, npmView = runNpmView) {
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
  const prismaClientSelector = getRuntimePackageVersionSelector(manifest, '@prisma/client');
  const prismaAdapterD1Selector = getRuntimePackageVersionSelector(manifest, '@prisma/adapter-d1');
  let prismaClientVersion = null;
  let prismaAdapterD1Version = null;
  let prismaClientVersions;

  try {
    prismaClientVersions = npmView(`@prisma/client@${prismaClientSelector}`, 'version');
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

  try {
    prismaClientVersion = selectLatestVersion(prismaClientVersions);
  } catch {
    return {
      state: 'unavailable',
      reason: 'prisma-client-evidence-invalid',
      prismaClientSelector,
      prismaClientVersion,
      prismaAdapterD1Selector,
      prismaAdapterD1Version,
    };
  }

  let prismaClientCandidateAvailable;
  try {
    prismaClientCandidateAvailable = normalizeVersionCandidates(prismaClientVersions).includes(candidateVersion);
  } catch {
    return {
      state: 'unavailable',
      reason: 'prisma-client-evidence-invalid',
      prismaClientSelector,
      prismaClientVersion,
      prismaAdapterD1Selector,
      prismaAdapterD1Version,
    };
  }

  if (!prismaClientCandidateAvailable) {
    return {
      state: 'incomplete',
      reason: 'prisma-client-candidate-missing',
      prismaClientSelector,
      prismaClientVersion,
      prismaAdapterD1Selector,
      prismaAdapterD1Version,
    };
  }

  let prismaAdapterD1Evidence;
  try {
    prismaAdapterD1Evidence = npmView(`@prisma/adapter-d1@${prismaAdapterD1Selector}`, 'version');
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

  try {
    prismaAdapterD1Version = selectLatestVersion(prismaAdapterD1Evidence);
  } catch {
    return {
      state: 'unavailable',
      reason: 'adapter-d1-evidence-invalid',
      prismaClientSelector,
      prismaClientVersion,
      prismaAdapterD1Selector,
      prismaAdapterD1Version,
    };
  }

  return {
    state: 'ready',
    reason: 'published-package-set-ready',
    prismaClientSelector,
    prismaClientVersion,
    prismaAdapterD1Selector,
    prismaAdapterD1Version,
  };
}

function enrichCompatiblePrismaReleaseWithPublishedPackageSet(status, manifest, npmView = runNpmView) {
  return {
    ...status,
    publishedRemediationPackageSet: inspectPublishedRemediationPackageSet(status, manifest, npmView),
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

function formatCompatiblePrismaReleaseStatus(status, { json = false } = {}) {
  if (json) {
    return `${JSON.stringify(status)}\n`;
  }

  const publishedRemediationCandidate = getPublishedRemediationCandidate(status);
  const publishedRemediationPackageSet = status.publishedRemediationPackageSet ?? {
    state: 'not-checked',
    reason: 'not-checked',
    prismaClientSelector: null,
    prismaClientVersion: null,
    prismaAdapterD1Selector: null,
    prismaAdapterD1Version: null,
  };

  return (
    `compatible Prisma upstream status: ${status.state}\n` +
    `registry: ${status.registry}\n` +
    `manifest prisma selector: ${status.prismaSelector}\n` +
    `latest compatible prisma: ${status.latestCompatiblePrismaVersion}\n` +
    `published remediation candidate: ${publishedRemediationCandidate ?? 'none'}\n` +
    `published remediation package set: ${publishedRemediationPackageSet.state}\n` +
    `published remediation package set reason: ${publishedRemediationPackageSet.reason ?? 'unspecified'}\n` +
    `manifest @prisma/client selector: ${publishedRemediationPackageSet.prismaClientSelector ?? 'none'}\n` +
    `manifest-compatible @prisma/client: ${publishedRemediationPackageSet.prismaClientVersion ?? 'none'}\n` +
    `manifest @prisma/adapter-d1 selector: ${publishedRemediationPackageSet.prismaAdapterD1Selector ?? 'none'}\n` +
    `manifest-compatible @prisma/adapter-d1: ${publishedRemediationPackageSet.prismaAdapterD1Version ?? 'none'}\n` +
    `prisma -> @prisma/config selector: ${status.prismaConfigSelector}\n` +
    `latest compatible @prisma/config: ${status.latestCompatiblePrismaConfigVersion}\n` +
    `@prisma/config -> deepmerge-ts requirement: ${status.prismaConfigDeepmergeRequirement ?? 'absent'}\n`
  );
}

function writeGitHubOutputs(status, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) {
    return;
  }

  const publishedRemediationCandidate = getPublishedRemediationCandidate(status) ?? 'none';
  const publishedRemediationPackageSet = status.publishedRemediationPackageSet ?? {
    state: 'not-checked',
    reason: 'not-checked',
    prismaClientSelector: null,
    prismaClientVersion: null,
    prismaAdapterD1Selector: null,
    prismaAdapterD1Version: null,
  };
  const outputs = {
    state: status.state,
    registry: status.registry,
    prisma_selector: status.prismaSelector,
    latest_compatible_prisma_version: status.latestCompatiblePrismaVersion,
    prisma_config_selector: status.prismaConfigSelector,
    latest_compatible_prisma_config_version: status.latestCompatiblePrismaConfigVersion,
    prisma_config_deepmerge_requirement: status.prismaConfigDeepmergeRequirement ?? 'absent',
    published_remediation_candidate: publishedRemediationCandidate,
    published_remediation_package_set_state: publishedRemediationPackageSet.state,
    published_remediation_package_set_reason: publishedRemediationPackageSet.reason ?? 'unspecified',
    published_remediation_prisma_client_selector: publishedRemediationPackageSet.prismaClientSelector ?? 'none',
    published_remediation_prisma_client_version: publishedRemediationPackageSet.prismaClientVersion ?? 'none',
    published_remediation_adapter_d1_selector: publishedRemediationPackageSet.prismaAdapterD1Selector ?? 'none',
    published_remediation_adapter_d1_version: publishedRemediationPackageSet.prismaAdapterD1Version ?? 'none',
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
  let cliOptions;

  try {
    cliOptions = parseCliOptions();
  } catch (error) {
    process.stderr.write(formatUpstreamProbeFailure('Invalid compatible Prisma upstream arguments', error));
    process.exit(1);
  }

  let manifest;

  try {
    manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  } catch (error) {
    process.stderr.write(formatUpstreamProbeFailure('Failed to read package.json', error));
    process.exit(1);
  }

  let status;

  try {
    status = enrichCompatiblePrismaReleaseWithPublishedPackageSet(
      inspectCompatiblePrismaRelease({ manifest }),
      manifest,
    );
    process.stdout.write(formatCompatiblePrismaReleaseStatus(status, cliOptions));
    writeGitHubOutputs(status);
  } catch (error) {
    process.stderr.write(formatUpstreamProbeFailure('Failed to inspect compatible Prisma release', error));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  CANONICAL_NPM_REGISTRY,
  CURRENT_COMPATIBLE_PRISMA_SELECTOR_PATTERN,
  NPM_VIEW_TIMEOUT_MS,
  NPM_VIEW_MAX_BUFFER_BYTES,
  NPM_VIEW_DIAGNOSTIC_MAX_LENGTH,
  compareComparableSemver,
  enrichCompatiblePrismaReleaseWithPublishedPackageSet,
  formatCompatiblePrismaReleaseStatus,
  getPrismaConfigDeepmergeRequirement,
  getPrismaConfigVersionSelector,
  getPrismaVersionSelector,
  getPublishedRemediationCandidate,
  getRuntimePackageVersionSelector,
  inspectCompatiblePrismaRelease,
  inspectPublishedRemediationPackageSet,
  isCurrentCompatiblePrismaSelector,
  isRegistrySemverSelector,
  normalizeVersionCandidates,
  parseCliOptions,
  parseNpmViewJson,
  runNpmView,
  sanitizeNpmViewDiagnostic,
  selectLatestVersion,
  writeGitHubOutputs,
};

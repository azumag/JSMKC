'use strict';

const fs = require('node:fs');

const MIN_TYPESCRIPT_VERSION = Object.freeze([5, 4, 0]);
const TYPESCRIPT_LOCKFILE_PATH = 'node_modules/typescript';

function parseCliOptions(argv = process.argv.slice(2)) {
  if (argv.length === 0) return { json: false };
  if (argv.length === 1 && argv[0] === '--json') return { json: true };
  throw new Error(`unsupported option: ${argv.join(' ')}`);
}

function parseStableSemver(version) {
  if (typeof version !== 'string') return null;
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:\+[^\s]+)?$/);
  if (!match) return null;
  return match.slice(1).map(Number);
}

function compareVersionTuple(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftPart = left[index] ?? 0;
    const rightPart = right[index] ?? 0;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }
  return 0;
}

function typescriptVersionSupportsPrisma7(version) {
  const parsed = parseStableSemver(version);
  return parsed !== null && compareVersionTuple(parsed, MIN_TYPESCRIPT_VERSION) >= 0;
}

function extractBooleanCompilerOption(source, key) {
  if (typeof source !== 'string') return null;
  const pattern = new RegExp(`^[ \\t]*["']?${key}["']?\\s*:\\s*(true|false)\\b`, 'm');
  const match = pattern.exec(source);
  return match ? match[1] === 'true' : null;
}

function getLockedTypeScriptVersion(lockfile) {
  const version = lockfile?.packages?.[TYPESCRIPT_LOCKFILE_PATH]?.version;
  return typeof version === 'string' ? version : null;
}

function readTypeScriptVersionEvidence({ readFileSync = fs.readFileSync, existsSync = fs.existsSync } = {}) {
  const installedManifestPath = 'node_modules/typescript/package.json';

  if (existsSync(installedManifestPath)) {
    const installedManifest = JSON.parse(readFileSync(installedManifestPath, 'utf8'));
    if (typeof installedManifest.version !== 'string') {
      throw new Error(`${installedManifestPath} does not contain a string version`);
    }

    return {
      version: installedManifest.version,
      source: installedManifestPath,
    };
  }

  const lockfilePath = 'package-lock.json';
  const lockfile = JSON.parse(readFileSync(lockfilePath, 'utf8'));
  const lockedVersion = getLockedTypeScriptVersion(lockfile);
  if (!lockedVersion) {
    throw new Error(`${lockfilePath} does not contain ${TYPESCRIPT_LOCKFILE_PATH}.version`);
  }

  return {
    version: lockedVersion,
    source: `${lockfilePath}#packages.${TYPESCRIPT_LOCKFILE_PATH}`,
  };
}

function inspectPrismaV7TypeScriptPrerequisites({ typescriptVersion, typescriptVersionSource = null, tsconfigSource }) {
  const strict = extractBooleanCompilerOption(tsconfigSource, 'strict');
  const esModuleInterop = extractBooleanCompilerOption(tsconfigSource, 'esModuleInterop');
  const checks = {
    typescriptVersionAtLeast5_4: typescriptVersionSupportsPrisma7(typescriptVersion),
    tsconfigStrict: strict === true,
    tsconfigEsModuleInterop: esModuleInterop === true,
  };
  const blockers = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([check]) => check);

  return {
    minimumTypeScriptVersion: MIN_TYPESCRIPT_VERSION.join('.'),
    typescriptVersion,
    typescriptVersionSource,
    tsconfig: {
      strict,
      esModuleInterop,
    },
    checks,
    blockers,
    ready: blockers.length === 0,
  };
}

function formatPrismaV7TypeScriptPrerequisites(status, { json = false } = {}) {
  if (json) return `${JSON.stringify(status)}\n`;

  return [
    '## Prisma 7 TypeScript prerequisites (#3114)',
    '',
    `TypeScript version: \`${status.typescriptVersion ?? 'missing'}\``,
    `TypeScript evidence source: \`${status.typescriptVersionSource ?? 'unknown'}\``,
    `Required minimum: \`${status.minimumTypeScriptVersion}\``,
    '',
    '| Requirement | Value | Result |',
    '| --- | --- | --- |',
    `| TypeScript >= ${status.minimumTypeScriptVersion} | \`${status.typescriptVersion ?? 'missing'}\` | ${status.checks.typescriptVersionAtLeast5_4 ? 'ready' : 'needs migration'} |`,
    `| tsconfig strict | \`${String(status.tsconfig.strict)}\` | ${status.checks.tsconfigStrict ? 'ready' : 'needs migration'} |`,
    `| tsconfig esModuleInterop | \`${String(status.tsconfig.esModuleInterop)}\` | ${status.checks.tsconfigEsModuleInterop ? 'ready' : 'needs migration'} |`,
    '',
    `Overall readiness: \`${status.ready ? 'ready' : 'not-ready'}\``,
    '',
    'This probe is read-only. It does not install or update TypeScript, edit tsconfig.json, change Prisma packages, generate client code, or modify the #3114 audit exception.',
    '',
  ].join('\n');
}

function main() {
  let options;
  try {
    options = parseCliOptions();
  } catch (error) {
    process.stderr.write(`Invalid Prisma 7 TypeScript prerequisite arguments: ${error.message}\n`);
    process.exit(1);
  }

  try {
    const typescriptEvidence = readTypeScriptVersionEvidence();
    const tsconfigSource = fs.readFileSync('tsconfig.json', 'utf8');
    const status = inspectPrismaV7TypeScriptPrerequisites({
      typescriptVersion: typescriptEvidence.version,
      typescriptVersionSource: typescriptEvidence.source,
      tsconfigSource,
    });
    const output = formatPrismaV7TypeScriptPrerequisites(status, options);

    process.stdout.write(output);
    if (process.env.GITHUB_STEP_SUMMARY && !options.json) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, output, 'utf8');
    }
  } catch (error) {
    process.stderr.write(`Failed to inspect Prisma 7 TypeScript prerequisites: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  MIN_TYPESCRIPT_VERSION,
  TYPESCRIPT_LOCKFILE_PATH,
  compareVersionTuple,
  extractBooleanCompilerOption,
  formatPrismaV7TypeScriptPrerequisites,
  getLockedTypeScriptVersion,
  inspectPrismaV7TypeScriptPrerequisites,
  parseCliOptions,
  parseStableSemver,
  readTypeScriptVersionEvidence,
  typescriptVersionSupportsPrisma7,
};

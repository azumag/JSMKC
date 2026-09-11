'use strict';

const fs = require('node:fs');

const MIN_TYPESCRIPT_VERSION = Object.freeze([5, 4, 0]);

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

function inspectPrismaV7TypeScriptPrerequisites({ typescriptVersion, tsconfigSource }) {
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
    tsconfig: {
      strict,
      esModuleInterop,
    },
    checks,
    blockers,
    ready: blockers.length === 0,
  };
}

function formatPrismaV7TypeScriptPrerequisites(status) {
  return [
    '## Prisma 7 TypeScript prerequisites (#3114)',
    '',
    `Installed TypeScript: \`${status.typescriptVersion ?? 'missing'}\``,
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
    'This probe is read-only. It does not update TypeScript, tsconfig.json, Prisma packages, generated client code, or the #3114 audit exception.',
    '',
  ].join('\n');
}

function main() {
  try {
    const typescriptManifest = JSON.parse(fs.readFileSync('node_modules/typescript/package.json', 'utf8'));
    const tsconfigSource = fs.readFileSync('tsconfig.json', 'utf8');
    const status = inspectPrismaV7TypeScriptPrerequisites({
      typescriptVersion: typescriptManifest.version ?? null,
      tsconfigSource,
    });
    const output = formatPrismaV7TypeScriptPrerequisites(status);

    process.stdout.write(output);
    if (process.env.GITHUB_STEP_SUMMARY) {
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
  compareVersionTuple,
  extractBooleanCompilerOption,
  formatPrismaV7TypeScriptPrerequisites,
  inspectPrismaV7TypeScriptPrerequisites,
  parseStableSemver,
  typescriptVersionSupportsPrisma7,
};

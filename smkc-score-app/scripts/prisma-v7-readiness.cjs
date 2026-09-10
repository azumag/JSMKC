'use strict';

const fs = require('node:fs');

const TARGET_PRISMA_MAJOR = 7;

function parseCliOptions(argv = process.argv.slice(2)) {
  if (argv.length === 0) return { json: false };
  if (argv.length === 1 && argv[0] === '--json') return { json: true };
  throw new Error(`unsupported option: ${argv.join(' ')}`);
}

function extractSemverMajor(selector) {
  if (typeof selector !== 'string') return null;
  const match = selector.trim().match(/^[~^]?\s*(\d+)\./);
  return match ? Number(match[1]) : null;
}

function extractSchemaBlock(schema, kind, name) {
  const pattern = new RegExp(`\\b${kind}\\s+${name}\\s*\\{([\\s\\S]*?)\\}`, 'm');
  return pattern.exec(schema)?.[1] ?? null;
}

function extractQuotedAssignment(block, key) {
  if (!block) return null;
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, 'm');
  return pattern.exec(block)?.[1] ?? null;
}

function hasAssignment(block, key) {
  if (!block) return false;
  return new RegExp(`^\\s*${key}\\s*=`, 'm').test(block);
}

function inspectPrismaV7Readiness({ manifest, schema, prismaConfigPresent }) {
  const prismaSelector = manifest.devDependencies?.prisma ?? null;
  const clientSelector = manifest.dependencies?.['@prisma/client'] ?? null;
  const adapterSelector = manifest.dependencies?.['@prisma/adapter-d1'] ?? null;
  const prismaMajor = extractSemverMajor(prismaSelector);
  const clientMajor = extractSemverMajor(clientSelector);
  const adapterMajor = extractSemverMajor(adapterSelector);
  const knownMajors = [prismaMajor, clientMajor, adapterMajor].filter((value) => value !== null);
  const packageMajorsAligned = knownMajors.length === 3 && new Set(knownMajors).size === 1;

  const generatorBlock = extractSchemaBlock(schema, 'generator', 'client');
  const datasourceBlock = extractSchemaBlock(schema, 'datasource', 'db');
  const generatorProvider = extractQuotedAssignment(generatorBlock, 'provider');

  const checks = {
    packageTypeModule: manifest.type === 'module',
    prismaCliAtTargetMajor: prismaMajor === TARGET_PRISMA_MAJOR,
    prismaClientAtTargetMajor: clientMajor === TARGET_PRISMA_MAJOR,
    prismaAdapterAtTargetMajor: adapterMajor === TARGET_PRISMA_MAJOR,
    prismaPackageMajorsAligned: packageMajorsAligned,
    generatorUsesPrismaClient: generatorProvider === 'prisma-client',
    generatorHasExplicitOutput: hasAssignment(generatorBlock, 'output'),
    datasourceUrlMovedOutOfSchema: !hasAssignment(datasourceBlock, 'url'),
    prismaConfigPresent: Boolean(prismaConfigPresent),
  };

  const blockers = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([check]) => check);

  return {
    targetMajor: TARGET_PRISMA_MAJOR,
    ready: blockers.length === 0,
    blockerCount: blockers.length,
    blockers,
    selectors: {
      prisma: prismaSelector,
      prismaClient: clientSelector,
      prismaAdapterD1: adapterSelector,
    },
    generatorProvider,
    checks,
  };
}

function formatPrismaV7Readiness(status, { json = false } = {}) {
  if (json) return `${JSON.stringify(status)}\n`;

  const checkRows = Object.entries(status.checks)
    .map(([check, passed]) => `| ${check} | ${passed ? 'ready' : 'needs migration'} |`)
    .join('\n');

  return [
    '## Prisma 7 migration readiness (#3114)',
    '',
    `Target major: \`${status.targetMajor}\``,
    '',
    `Overall readiness: \`${status.ready ? 'ready' : 'not-ready'}\` (${status.blockerCount} migration item(s))`,
    '',
    '| Package | Selector |',
    '| --- | --- |',
    `| prisma | \`${status.selectors.prisma ?? 'missing'}\` |`,
    `| @prisma/client | \`${status.selectors.prismaClient ?? 'missing'}\` |`,
    `| @prisma/adapter-d1 | \`${status.selectors.prismaAdapterD1 ?? 'missing'}\` |`,
    '',
    `Generator provider: \`${status.generatorProvider ?? 'missing'}\``,
    '',
    '| Readiness check | Result |',
    '| --- | --- |',
    checkRows,
    '',
    'This is read-only migration evidence. It does not update dependencies, schema, generated client code, or the #3114 audit exception.',
    '',
  ].join('\n');
}

function main() {
  let options;
  try {
    options = parseCliOptions();
  } catch (error) {
    process.stderr.write(`Invalid Prisma 7 readiness arguments: ${error.message}\n`);
    process.exit(1);
  }

  try {
    const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
    const status = inspectPrismaV7Readiness({
      manifest,
      schema,
      prismaConfigPresent: fs.existsSync('prisma.config.ts'),
    });
    const output = formatPrismaV7Readiness(status, options);
    process.stdout.write(output);

    if (process.env.GITHUB_STEP_SUMMARY && !options.json) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, output, 'utf8');
    }
  } catch (error) {
    process.stderr.write(`Failed to inspect Prisma 7 migration readiness: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  TARGET_PRISMA_MAJOR,
  extractSemverMajor,
  formatPrismaV7Readiness,
  inspectPrismaV7Readiness,
  parseCliOptions,
};

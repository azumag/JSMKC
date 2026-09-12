'use strict';

const fs = require('node:fs');

function parseCliOptions(argv = process.argv.slice(2)) {
  if (argv.length === 0) return { json: false };
  if (argv.length === 1 && argv[0] === '--json') return { json: true };
  throw new Error(`unsupported option: ${argv.join(' ')}`);
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findNamedImportLocalName(source, exportedName, moduleSpecifier = null) {
  if (typeof source !== 'string') return null;

  const importPattern = /\bimport\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?/g;

  for (const match of source.matchAll(importPattern)) {
    if (moduleSpecifier && match[2] !== moduleSpecifier) continue;

    for (const entry of match[1].split(',')) {
      const named = new RegExp(`^\\s*${escapeRegExp(exportedName)}(?:\\s+as\\s+([A-Za-z_$][\\w$]*))?\\s*$`).exec(entry);
      if (named) return named[1] ?? exportedName;
    }
  }

  return null;
}

function findConstructedAdapterLocalName(source, adapterConstructorLocalName) {
  if (!adapterConstructorLocalName) return null;

  const constructorName = escapeRegExp(adapterConstructorLocalName);
  const match = new RegExp(`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*new\\s+${constructorName}\\s*\\(`).exec(
    source,
  );
  return match?.[1] ?? null;
}

function extractPrismaClientOptions(source, prismaClientLocalName) {
  if (!prismaClientLocalName) return null;
  const clientName = escapeRegExp(prismaClientLocalName);
  const match = new RegExp(`\\bnew\\s+${clientName}\\s*\\(\\s*\\{([\\s\\S]{0,4000}?)\\}\\s*\\)`).exec(source);
  return match?.[1] ?? null;
}

function prismaClientOptionsUseAdapter(clientOptions, adapterInstanceLocalName) {
  if (!clientOptions || !adapterInstanceLocalName) return false;

  const instanceName = escapeRegExp(adapterInstanceLocalName);
  if (adapterInstanceLocalName === 'adapter' && /(?:^|,)\s*adapter\s*(?:,|$)/m.test(clientOptions)) {
    return true;
  }

  return new RegExp(`\\badapter\\s*:\\s*${instanceName}\\b`).test(clientOptions);
}

function inspectPrismaV7DriverAdapter(source) {
  if (typeof source !== 'string') {
    return {
      ready: false,
      adapterLocalName: null,
      adapterInstanceLocalName: null,
      prismaClientLocalName: null,
      checks: {
        importsPrismaD1Adapter: false,
        constructsPrismaD1Adapter: false,
        passesAdapterToPrismaClient: false,
      },
    };
  }

  const code = stripComments(source);
  const adapterLocalName = findNamedImportLocalName(code, 'PrismaD1', '@prisma/adapter-d1');
  const adapterInstanceLocalName = findConstructedAdapterLocalName(code, adapterLocalName);
  const prismaClientLocalName = findNamedImportLocalName(code, 'PrismaClient');
  const clientOptions = extractPrismaClientOptions(code, prismaClientLocalName);

  const checks = {
    importsPrismaD1Adapter: adapterLocalName !== null,
    constructsPrismaD1Adapter: adapterInstanceLocalName !== null,
    passesAdapterToPrismaClient: prismaClientOptionsUseAdapter(clientOptions, adapterInstanceLocalName),
  };

  return {
    ready: Object.values(checks).every(Boolean),
    adapterLocalName,
    adapterInstanceLocalName,
    prismaClientLocalName,
    checks,
  };
}

function formatPrismaV7DriverAdapter(status, { json = false } = {}) {
  if (json) return `${JSON.stringify(status)}\n`;

  const checkRows = Object.entries(status.checks)
    .map(([check, passed]) => `| ${check} | ${passed ? 'ready' : 'needs migration'} |`)
    .join('\n');

  return [
    '## Prisma 7 D1 driver adapter readiness (#3114)',
    '',
    `Driver adapter wiring: \`${status.ready ? 'ready' : 'needs migration'}\``,
    `Detected D1 adapter local name: \`${status.adapterLocalName ?? 'none'}\``,
    `Detected D1 adapter instance: \`${status.adapterInstanceLocalName ?? 'none'}\``,
    `Detected PrismaClient local name: \`${status.prismaClientLocalName ?? 'none'}\``,
    '',
    '| Readiness check | Result |',
    '| --- | --- |',
    checkRows,
    '',
    'Prisma ORM 7 requires a driver adapter for database access. This read-only probe verifies that the application imports and constructs the Cloudflare D1 adapter and passes that constructed adapter when PrismaClient is created.',
    '',
  ].join('\n');
}

function main() {
  let options;
  try {
    options = parseCliOptions();
  } catch (error) {
    process.stderr.write(`Invalid Prisma 7 D1 driver adapter arguments: ${error.message}\n`);
    process.exit(1);
  }

  try {
    const source = fs.readFileSync('src/lib/prisma.ts', 'utf8');
    const status = inspectPrismaV7DriverAdapter(source);
    const output = formatPrismaV7DriverAdapter(status, options);
    process.stdout.write(output);

    if (process.env.GITHUB_STEP_SUMMARY && !options.json) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, output, 'utf8');
    }
  } catch (error) {
    process.stderr.write(`Failed to inspect Prisma 7 D1 driver adapter readiness: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  extractPrismaClientOptions,
  findConstructedAdapterLocalName,
  findNamedImportLocalName,
  formatPrismaV7DriverAdapter,
  inspectPrismaV7DriverAdapter,
  parseCliOptions,
  prismaClientOptionsUseAdapter,
  stripComments,
};

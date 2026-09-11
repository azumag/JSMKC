'use strict';

const fs = require('node:fs');

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findNamedImportLocalName(source, exportedName, moduleSpecifier = null) {
  if (typeof source !== 'string') return null;

  const importPattern = /^\s*import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?/gm;

  for (const match of source.matchAll(importPattern)) {
    if (moduleSpecifier && match[2] !== moduleSpecifier) continue;

    for (const entry of match[1].split(',')) {
      const named = new RegExp(`^\\s*${escapeRegExp(exportedName)}(?:\\s+as\\s+([A-Za-z_$][\\w$]*))?\\s*$`).exec(
        entry,
      );
      if (named) return named[1] ?? exportedName;
    }
  }

  return null;
}

function extractPrismaClientOptions(source, prismaClientLocalName) {
  if (!prismaClientLocalName) return null;
  const clientName = escapeRegExp(prismaClientLocalName);
  const match = new RegExp(`\\bnew\\s+${clientName}\\s*\\(\\s*\\{([\\s\\S]{0,4000}?)\\}\\s*\\)`).exec(source);
  return match?.[1] ?? null;
}

function inspectPrismaV7DriverAdapter(source) {
  if (typeof source !== 'string') {
    return {
      ready: false,
      adapterLocalName: null,
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
  const prismaClientLocalName = findNamedImportLocalName(code, 'PrismaClient');
  const clientOptions = extractPrismaClientOptions(code, prismaClientLocalName);

  const checks = {
    importsPrismaD1Adapter: adapterLocalName !== null,
    constructsPrismaD1Adapter:
      adapterLocalName !== null && new RegExp(`\\bnew\\s+${escapeRegExp(adapterLocalName)}\\s*\\(`).test(code),
    passesAdapterToPrismaClient: clientOptions !== null && /\badapter\s*(?:,|:)/.test(clientOptions),
  };

  return {
    ready: Object.values(checks).every(Boolean),
    adapterLocalName,
    prismaClientLocalName,
    checks,
  };
}

function formatPrismaV7DriverAdapter(status) {
  const checkRows = Object.entries(status.checks)
    .map(([check, passed]) => `| ${check} | ${passed ? 'ready' : 'needs migration'} |`)
    .join('\n');

  return [
    '## Prisma 7 D1 driver adapter readiness (#3114)',
    '',
    `Driver adapter wiring: \`${status.ready ? 'ready' : 'needs migration'}\``,
    `Detected D1 adapter local name: \`${status.adapterLocalName ?? 'none'}\``,
    `Detected PrismaClient local name: \`${status.prismaClientLocalName ?? 'none'}\``,
    '',
    '| Readiness check | Result |',
    '| --- | --- |',
    checkRows,
    '',
    'Prisma ORM 7 requires a driver adapter for database access. This read-only probe verifies that the application imports and constructs the Cloudflare D1 adapter and passes an adapter option when PrismaClient is created.',
    '',
  ].join('\n');
}

function main() {
  try {
    const source = fs.readFileSync('src/lib/prisma.ts', 'utf8');
    const status = inspectPrismaV7DriverAdapter(source);
    const output = formatPrismaV7DriverAdapter(status);
    process.stdout.write(output);

    if (process.env.GITHUB_STEP_SUMMARY) {
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
  findNamedImportLocalName,
  formatPrismaV7DriverAdapter,
  inspectPrismaV7DriverAdapter,
  stripComments,
};

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const DEFAULT_TARGETS = ['__tests__', '__mocks__', 'e2e', 'jest.setup.js', 'jest.config.ts', 'next.config.ts'];

function parseCliOptions(argv = process.argv.slice(2)) {
  if (argv.length === 0) return { json: false };
  if (argv.length === 1 && argv[0] === '--json') return { json: true };
  throw new Error(`unsupported option: ${argv.join(' ')}`);
}

function addMatches(source, pattern, kind, references) {
  for (const match of source.matchAll(pattern)) {
    const specifier = match[1];
    if (!references.some((reference) => reference.kind === kind && reference.specifier === specifier)) {
      references.push({ kind, specifier });
    }
  }
}

function extractLegacyPrismaClientReferences(source) {
  const references = [];

  addMatches(
    source,
    /\bimport\s+(?:type\s+)?(?:[\w$*{},\s]+?\s+from\s*)['"](@prisma\/client(?:\/[^'"]*)?)['"]/g,
    'import',
    references,
  );
  addMatches(
    source,
    /\b(?:import|require)\s*\(\s*['"](@prisma\/client(?:\/[^'"]*)?)['"]\s*\)/g,
    'runtime-load',
    references,
  );
  addMatches(source, /\bimport\s*['"](@prisma\/client(?:\/[^'"]*)?)['"]/g, 'import', references);
  addMatches(
    source,
    /\bjest\.(?:mock|unmock|requireActual|requireMock)\s*\(\s*['"](@prisma\/client(?:\/[^'"]*)?)['"]/g,
    'jest-module-target',
    references,
  );

  return references;
}

function extractNextConfigReferences(source) {
  const references = [];
  const packageList = /\bserverExternalPackages\s*:\s*\[([\s\S]*?)\]/m.exec(source)?.[1] ?? '';

  for (const match of packageList.matchAll(/['"](@prisma\/client(?:\/[^'"]*)?)['"]/g)) {
    references.push({ kind: 'next-server-external', specifier: match[1] });
  }

  return references;
}

function inspectFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const references = extractLegacyPrismaClientReferences(source);

  if (path.basename(filePath) === 'next.config.ts') {
    for (const reference of extractNextConfigReferences(source)) {
      if (
        !references.some((existing) => existing.kind === reference.kind && existing.specifier === reference.specifier)
      ) {
        references.push(reference);
      }
    }
  }

  return references;
}

function findLegacyPrismaClientSupportReferences(targets = DEFAULT_TARGETS) {
  const findings = [];

  function visit(targetPath) {
    if (!fs.existsSync(targetPath)) return;

    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(targetPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        visit(path.join(targetPath, entry.name));
      }
      return;
    }

    if (!stat.isFile() || !SOURCE_EXTENSIONS.has(path.extname(targetPath))) return;

    const references = inspectFile(targetPath);
    if (references.length === 0) return;

    findings.push({
      path: path.relative('.', targetPath).split(path.sep).join('/'),
      references,
    });
  }

  for (const target of targets) visit(target);
  return findings;
}

function inspectPrismaV7SupportSurface({ findings }) {
  const referenceCount = findings.reduce((total, finding) => total + finding.references.length, 0);
  return {
    ready: referenceCount === 0,
    referenceCount,
    findings,
  };
}

function formatPrismaV7SupportSurface(status, { json = false } = {}) {
  if (json) return `${JSON.stringify(status)}\n`;

  const rows =
    status.findings.length === 0
      ? ['| none | none | none |']
      : status.findings.flatMap((finding) =>
          finding.references.map(({ kind, specifier }) => `| \`${finding.path}\` | ${kind} | \`${specifier}\` |`),
        );

  return [
    '## Prisma 7 support-code migration surface (#3114)',
    '',
    `Support-code readiness: \`${status.ready ? 'ready' : 'not-ready'}\` (${status.referenceCount} legacy reference(s))`,
    '',
    '| Path | Reference kind | Prisma specifier |',
    '| --- | --- | --- |',
    ...rows,
    '',
    'This is read-only migration evidence. It inventories test/tooling/config references that need review when application imports move to the Prisma 7 generated client path.',
    '',
  ].join('\n');
}

function main() {
  let options;
  try {
    options = parseCliOptions();
  } catch (error) {
    process.stderr.write(`Invalid Prisma 7 support-surface arguments: ${error.message}\n`);
    process.exit(1);
  }

  try {
    const status = inspectPrismaV7SupportSurface({
      findings: findLegacyPrismaClientSupportReferences(),
    });
    process.stdout.write(formatPrismaV7SupportSurface(status, options));
  } catch (error) {
    process.stderr.write(`Failed to inspect Prisma 7 support-code migration surface: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_TARGETS,
  extractLegacyPrismaClientReferences,
  extractNextConfigReferences,
  findLegacyPrismaClientSupportReferences,
  formatPrismaV7SupportSurface,
  inspectPrismaV7SupportSurface,
  parseCliOptions,
};

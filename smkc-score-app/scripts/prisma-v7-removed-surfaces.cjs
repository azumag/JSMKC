'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const COMMAND_EXTENSIONS = new Set([...SOURCE_EXTENSIONS, '.json', '.yml', '.yaml', '.sh']);
const DEFAULT_RUNTIME_TARGETS = ['src'];
const DEFAULT_COMMAND_TARGETS = ['package.json', 'scripts', 'e2e', '../.github/workflows'];
const SELF_PATH = path.normalize('scripts/prisma-v7-removed-surfaces.cjs');

const REMOVED_COMMAND_PATTERNS = Object.freeze([
  { kind: 'removed-cli-flag', token: '--skip-generate', pattern: /--skip-generate\b/ },
  { kind: 'removed-cli-flag', token: '--skip-seed', pattern: /--skip-seed\b/ },
  { kind: 'removed-migrate-diff-flag', token: '--from-url', pattern: /--from-url\b/ },
  { kind: 'removed-migrate-diff-flag', token: '--to-url', pattern: /--to-url\b/ },
  {
    kind: 'removed-migrate-diff-flag',
    token: '--from-schema-datasource',
    pattern: /--from-schema-datasource\b/,
  },
  {
    kind: 'removed-migrate-diff-flag',
    token: '--to-schema-datasource',
    pattern: /--to-schema-datasource\b/,
  },
  {
    kind: 'removed-migrate-diff-flag',
    token: '--shadow-database-url',
    pattern: /--shadow-database-url\b/,
  },
]);

const REMOVED_RUNTIME_PATTERNS = Object.freeze([
  { kind: 'removed-client-middleware', token: '$use', pattern: /\.\$use\s*\(/ },
  { kind: 'removed-client-metrics', token: '$metrics', pattern: /\.\$metrics\b/ },
]);

function parseCliOptions(argv = process.argv.slice(2)) {
  if (argv.length === 0) return { json: false };
  if (argv.length === 1 && argv[0] === '--json') return { json: true };
  throw new Error(`unsupported option: ${argv.join(' ')}`);
}

function isCommentOnly(line, extension) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (extension === '.yml' || extension === '.yaml' || extension === '.sh') return trimmed.startsWith('#');
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function inspectLines(filePath, source, patterns) {
  const extension = path.extname(filePath);
  const findings = [];

  source.split(/\r?\n/).forEach((line, index) => {
    if (isCommentOnly(line, extension)) return;

    for (const { kind, token, pattern } of patterns) {
      if (!pattern.test(line)) continue;
      findings.push({ path: filePath.split(path.sep).join('/'), line: index + 1, kind, token });
    }
  });

  return findings;
}

function stripCommentOnlyLines(filePath, source) {
  const extension = path.extname(filePath);
  return source
    .split(/\r?\n/)
    .map((line) => (isCommentOnly(line, extension) ? '' : line))
    .join('\n');
}

function inspectDbExecuteFlags(filePath, source) {
  const findings = [];
  const sanitizedSource = stripCommentOnlyLines(filePath, source);
  const commandPattern = /\bprisma\s+db\s+execute\b[\s\S]{0,240}?--(schema|url)\b/g;

  for (const match of sanitizedSource.matchAll(commandPattern)) {
    const line = sanitizedSource.slice(0, match.index).split(/\r?\n/).length;
    findings.push({
      path: filePath.split(path.sep).join('/'),
      line,
      kind: 'removed-db-execute-flag',
      token: `--${match[1]}`,
    });
  }

  return findings;
}

function inspectMetricsPreviewFeature(filePath, source) {
  const generator = /\bgenerator\s+client\s*\{([\s\S]*?)\}/m.exec(source)?.[1] ?? '';
  const previewFeatures = /\bpreviewFeatures\s*=\s*\[([\s\S]*?)\]/m.exec(generator)?.[1] ?? '';
  if (!/["']metrics["']/.test(previewFeatures)) return [];

  const matchIndex = source.indexOf(previewFeatures);
  const line = matchIndex >= 0 ? source.slice(0, matchIndex).split(/\r?\n/).length : 1;
  return [
    {
      path: filePath.split(path.sep).join('/'),
      line,
      kind: 'removed-metrics-preview',
      token: 'metrics',
    },
  ];
}

function listFiles(targets, extensions, { exclude = new Set() } = {}) {
  const files = [];

  function visit(targetPath) {
    if (!fs.existsSync(targetPath)) return;
    const normalized = path.normalize(targetPath);
    if (exclude.has(normalized)) return;

    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(targetPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.open-next') continue;
        visit(path.join(targetPath, entry.name));
      }
      return;
    }

    if (stat.isFile() && extensions.has(path.extname(targetPath))) files.push(targetPath);
  }

  for (const target of targets) visit(target);
  return files;
}

function findRemovedPrismaV7Surfaces({
  runtimeTargets = DEFAULT_RUNTIME_TARGETS,
  commandTargets = DEFAULT_COMMAND_TARGETS,
  schemaPath = 'prisma/schema.prisma',
} = {}) {
  const findings = [];

  for (const filePath of listFiles(runtimeTargets, SOURCE_EXTENSIONS)) {
    const source = fs.readFileSync(filePath, 'utf8');
    findings.push(...inspectLines(filePath, source, REMOVED_RUNTIME_PATTERNS));
  }

  for (const filePath of listFiles(commandTargets, COMMAND_EXTENSIONS, { exclude: new Set([SELF_PATH]) })) {
    const source = fs.readFileSync(filePath, 'utf8');
    findings.push(...inspectLines(filePath, source, REMOVED_COMMAND_PATTERNS));
    findings.push(...inspectDbExecuteFlags(filePath, source));
  }

  if (fs.existsSync(schemaPath)) {
    findings.push(...inspectMetricsPreviewFeature(schemaPath, fs.readFileSync(schemaPath, 'utf8')));
  }

  return findings.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.kind.localeCompare(b.kind));
}

function inspectPrismaV7RemovedSurfaces({ findings }) {
  return {
    ready: findings.length === 0,
    findingCount: findings.length,
    findings,
  };
}

function formatPrismaV7RemovedSurfaces(status, { json = false } = {}) {
  if (json) return `${JSON.stringify(status)}\n`;

  const rows =
    status.findings.length === 0
      ? ['| none | none | none | none |']
      : status.findings.map(
          ({ path: findingPath, line, kind, token }) => `| \`${findingPath}\` | ${line} | ${kind} | \`${token}\` |`,
        );

  return [
    '## Prisma 7 removed-surface readiness (#3114)',
    '',
    `Removed-surface readiness: \`${status.ready ? 'ready' : 'not-ready'}\` (${status.findingCount} finding(s))`,
    '',
    '| Path | Line | Kind | Token |',
    '| --- | ---: | --- | --- |',
    ...rows,
    '',
    'This read-only probe inventories Prisma 7 removals that can break application code or repository commands: client middleware/metrics APIs, the metrics preview feature, and removed CLI flags.',
    '',
    'Prisma 6 engine environment compatibility is intentionally covered separately by the existing major-gated Cloudflare generation checks.',
    '',
  ].join('\n');
}

function main() {
  let options;
  try {
    options = parseCliOptions();
  } catch (error) {
    process.stderr.write(`Invalid Prisma 7 removed-surface arguments: ${error.message}\n`);
    process.exit(1);
  }

  try {
    const status = inspectPrismaV7RemovedSurfaces({ findings: findRemovedPrismaV7Surfaces() });
    const output = formatPrismaV7RemovedSurfaces(status, options);
    process.stdout.write(output);

    if (process.env.GITHUB_STEP_SUMMARY && !options.json) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, output, 'utf8');
    }
  } catch (error) {
    process.stderr.write(`Failed to inspect Prisma 7 removed surfaces: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  COMMAND_EXTENSIONS,
  DEFAULT_COMMAND_TARGETS,
  DEFAULT_RUNTIME_TARGETS,
  REMOVED_COMMAND_PATTERNS,
  REMOVED_RUNTIME_PATTERNS,
  SOURCE_EXTENSIONS,
  findRemovedPrismaV7Surfaces,
  formatPrismaV7RemovedSurfaces,
  inspectDbExecuteFlags,
  inspectLines,
  inspectMetricsPreviewFeature,
  inspectPrismaV7RemovedSurfaces,
  parseCliOptions,
  stripCommentOnlyLines,
};

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_TARGETS = ['scripts', 'e2e', '__tests__', '__mocks__', 'jest.setup.js'];

function parseCliOptions(argv = process.argv.slice(2)) {
  if (argv.length === 0) return { json: false };
  if (argv.length === 1 && argv[0] === '--json') return { json: true };
  throw new Error(`unsupported option: ${argv.join(' ')}`);
}

function maskCommentsAndStrings(source) {
  let output = '';
  let index = 0;
  let state = 'code';

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];

    if (state === 'code') {
      if (character === '/' && next === '/') {
        output += '  ';
        index += 2;
        state = 'line-comment';
        continue;
      }
      if (character === '/' && next === '*') {
        output += '  ';
        index += 2;
        state = 'block-comment';
        continue;
      }
      if (character === "'") {
        output += ' ';
        index += 1;
        state = 'single-quote';
        continue;
      }
      if (character === '"') {
        output += ' ';
        index += 1;
        state = 'double-quote';
        continue;
      }
      if (character === '`') {
        output += ' ';
        index += 1;
        state = 'template';
        continue;
      }

      output += character;
      index += 1;
      continue;
    }

    if (state === 'line-comment') {
      if (character === '\n') {
        output += '\n';
        state = 'code';
      } else {
        output += ' ';
      }
      index += 1;
      continue;
    }

    if (state === 'block-comment') {
      if (character === '*' && next === '/') {
        output += '  ';
        index += 2;
        state = 'code';
      } else {
        output += character === '\n' ? '\n' : ' ';
        index += 1;
      }
      continue;
    }

    const quote =
      state === 'single-quote' ? "'" : state === 'double-quote' ? '"' : state === 'template' ? '`' : null;

    if (character === '\\') {
      output += ' ';
      if (next !== undefined) output += next === '\n' ? '\n' : ' ';
      index += next === undefined ? 1 : 2;
      continue;
    }

    if (character === quote) {
      output += ' ';
      index += 1;
      state = 'code';
      continue;
    }

    output += character === '\n' ? '\n' : ' ';
    index += 1;
  }

  return output;
}

function extractCommonJsConstructs(source) {
  const code = maskCommentsAndStrings(source);
  const checks = [
    ['require-call', /\brequire\s*\(/],
    ['module.exports', /\bmodule\s*\.\s*exports\b/],
    ['exports-member', /\bexports\s*(?:\.|\[)/],
    ['__dirname', /\b__dirname\b/],
    ['__filename', /\b__filename\b/],
  ];

  return checks.filter(([, pattern]) => pattern.test(code)).map(([kind]) => kind);
}

function inspectJavaScriptFile(filePath) {
  return extractCommonJsConstructs(fs.readFileSync(filePath, 'utf8'));
}

function readPackageType(packageJsonPath) {
  try {
    const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return typeof manifest.type === 'string' ? manifest.type : null;
  } catch {
    return null;
  }
}

function hasExplicitCommonJsPackageScope(filePath, rootDir = '.') {
  const root = path.resolve(rootDir);
  let currentDir = path.dirname(path.resolve(filePath));

  while (currentDir !== root && currentDir.startsWith(`${root}${path.sep}`)) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return readPackageType(packageJsonPath) === 'commonjs';
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return false;
}

function findCommonJsJavaScriptFiles(targets = DEFAULT_TARGETS, rootDir = '.') {
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

    if (!stat.isFile() || path.extname(targetPath) !== '.js') return;
    if (hasExplicitCommonJsPackageScope(targetPath, rootDir)) return;

    const constructs = inspectJavaScriptFile(targetPath);
    if (constructs.length === 0) return;

    findings.push({
      path: path.relative(rootDir, targetPath).split(path.sep).join('/'),
      constructs,
    });
  }

  for (const target of targets) visit(target);
  return findings;
}

function inspectPrismaV7EsmSurface({ findings }) {
  const constructCount = findings.reduce((total, finding) => total + finding.constructs.length, 0);
  return {
    ready: findings.length === 0,
    fileCount: findings.length,
    constructCount,
    findings,
  };
}

function formatPrismaV7EsmSurface(status, { json = false } = {}) {
  if (json) return `${JSON.stringify(status)}\n`;

  const rows =
    status.findings.length === 0
      ? ['| none | none |']
      : status.findings.map(({ path: filePath, constructs }) => `| \`${filePath}\` | ${constructs.join(', ')} |`);

  return [
    '## Prisma 7 ESM migration surface (#3114)',
    '',
    `Top-level type=module readiness: \`${status.ready ? 'ready' : 'not-ready'}\` (${status.fileCount} CommonJS .js file(s), ${status.constructCount} construct kind(s))`,
    '',
    '| Path | CommonJS / Node globals |',
    '| --- | --- |',
    ...rows,
    '',
    'This is read-only migration evidence. It inventories Node-executed/test helper `.js` files that would change interpretation under a future top-level `"type": "module"`.',
    '',
    'Files protected by a nested package scope with explicit `"type": "commonjs"` are intentionally excluded because they remain CommonJS after the top-level package becomes ESM. Existing `.cjs` files are excluded for the same reason.',
    '',
  ].join('\n');
}

function main() {
  let options;
  try {
    options = parseCliOptions();
  } catch (error) {
    process.stderr.write(`Invalid Prisma 7 ESM-surface arguments: ${error.message}\n`);
    process.exit(1);
  }

  try {
    const status = inspectPrismaV7EsmSurface({
      findings: findCommonJsJavaScriptFiles(),
    });
    const output = formatPrismaV7EsmSurface(status, options);
    process.stdout.write(output);

    if (process.env.GITHUB_STEP_SUMMARY && !options.json) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, output, 'utf8');
    }
  } catch (error) {
    process.stderr.write(`Failed to inspect Prisma 7 ESM migration surface: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_TARGETS,
  extractCommonJsConstructs,
  findCommonJsJavaScriptFiles,
  formatPrismaV7EsmSurface,
  hasExplicitCommonJsPackageScope,
  inspectPrismaV7EsmSurface,
  maskCommentsAndStrings,
  parseCliOptions,
  readPackageType,
};

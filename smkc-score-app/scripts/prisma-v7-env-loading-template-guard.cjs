'use strict';

const fs = require('node:fs');

const { isRegexLiteralStart, maskCommentsAndStrings } = require('./prisma-v7-esm-surface.cjs');
const {
  findCommonJsPrismaDefineConfigImports,
  findNamedPrismaDefineConfigImports,
  findPrismaConfigNamespaceImports,
} = require('./prisma-v7-env-loading.cjs');

function escapeIdentifierForRegex(identifier) {
  return identifier.replace(/[$]/g, '\\$&');
}

function findTemplateInterpolationRanges(source) {
  if (typeof source !== 'string') return [];

  let output = '';
  let index = 0;
  const ranges = [];
  const contexts = [{ type: 'code', interpolationDepth: null, interpolationStart: null }];

  while (index < source.length) {
    const context = contexts.at(-1);
    const character = source[index];
    const next = source[index + 1];

    if (context.type === 'code') {
      if (character === '/' && next === '/') {
        output += '  ';
        index += 2;
        contexts.push({ type: 'line-comment' });
        continue;
      }
      if (character === '/' && next === '*') {
        output += '  ';
        index += 2;
        contexts.push({ type: 'block-comment' });
        continue;
      }
      if (character === '/' && isRegexLiteralStart(output, next)) {
        output += ' ';
        index += 1;
        contexts.push({ type: 'regex', inCharacterClass: false });
        continue;
      }
      if (character === "'") {
        output += ' ';
        index += 1;
        contexts.push({ type: 'single-quote' });
        continue;
      }
      if (character === '"') {
        output += ' ';
        index += 1;
        contexts.push({ type: 'double-quote' });
        continue;
      }
      if (character === '`') {
        output += ' ';
        index += 1;
        contexts.push({ type: 'template' });
        continue;
      }

      if (context.interpolationDepth !== null && character === '{') {
        context.interpolationDepth += 1;
        output += character;
        index += 1;
        continue;
      }
      if (context.interpolationDepth !== null && character === '}') {
        context.interpolationDepth -= 1;
        if (context.interpolationDepth === 0) {
          ranges.push({ start: context.interpolationStart, end: index });
          output += ' ';
          index += 1;
          contexts.pop();
          continue;
        }
        output += character;
        index += 1;
        continue;
      }

      output += character;
      index += 1;
      continue;
    }

    if (context.type === 'line-comment') {
      if (character === '\n') {
        output += '\n';
        contexts.pop();
      } else {
        output += ' ';
      }
      index += 1;
      continue;
    }

    if (context.type === 'block-comment') {
      if (character === '*' && next === '/') {
        output += '  ';
        index += 2;
        contexts.pop();
      } else {
        output += character === '\n' ? '\n' : ' ';
        index += 1;
      }
      continue;
    }

    if (context.type === 'regex') {
      if (character === '\\') {
        output += ' ';
        if (next !== undefined) output += next === '\n' ? '\n' : ' ';
        index += next === undefined ? 1 : 2;
        continue;
      }
      if (character === '[' && !context.inCharacterClass) {
        context.inCharacterClass = true;
        output += ' ';
        index += 1;
        continue;
      }
      if (character === ']' && context.inCharacterClass) {
        context.inCharacterClass = false;
        output += ' ';
        index += 1;
        continue;
      }
      if (character === '/' && !context.inCharacterClass) {
        output += ' ';
        index += 1;
        contexts.pop();
        continue;
      }
      if (character === '\n' || character === '\r') {
        output += character;
        index += 1;
        contexts.pop();
        continue;
      }

      output += ' ';
      index += 1;
      continue;
    }

    if (context.type === 'template') {
      if (character === '\\') {
        output += ' ';
        if (next !== undefined) output += next === '\n' ? '\n' : ' ';
        index += next === undefined ? 1 : 2;
        continue;
      }
      if (character === '`') {
        output += ' ';
        index += 1;
        contexts.pop();
        continue;
      }
      if (character === '$' && next === '{') {
        output += '  ';
        index += 2;
        contexts.push({ type: 'code', interpolationDepth: 1, interpolationStart: index });
        continue;
      }

      output += character === '\n' ? '\n' : ' ';
      index += 1;
      continue;
    }

    const quote = context.type === 'single-quote' ? "'" : '"';
    if (character === '\\') {
      output += ' ';
      if (next !== undefined) output += next === '\n' ? '\n' : ' ';
      index += next === undefined ? 1 : 2;
      continue;
    }
    if (character === quote) {
      output += ' ';
      index += 1;
      contexts.pop();
      continue;
    }

    output += character === '\n' ? '\n' : ' ';
    index += 1;
  }

  return ranges;
}

function buildDefineConfigPatterns(source) {
  const patterns = [];
  const directNames = new Set([
    ...findNamedPrismaDefineConfigImports(source),
    ...findCommonJsPrismaDefineConfigImports(source),
  ]);
  if (directNames.size === 0) directNames.add('defineConfig');

  for (const name of directNames) {
    patterns.push({
      kind: 'direct',
      binding: name,
      pattern: new RegExp(`\\b${escapeIdentifierForRegex(name)}\\s*\\(`, 'g'),
    });
  }

  for (const namespace of new Set(findPrismaConfigNamespaceImports(source))) {
    patterns.push({
      kind: 'namespace',
      binding: namespace,
      pattern: new RegExp(`\\b${escapeIdentifierForRegex(namespace)}\\s*\\.\\s*defineConfig\\s*\\(`, 'g'),
    });
  }

  return patterns;
}

function inspectPrismaV7EnvLoadingTemplateGuard(source) {
  if (typeof source !== 'string') {
    return { ready: false, findingCount: 0, findings: [] };
  }

  const executableSource = maskCommentsAndStrings(source);
  const ranges = findTemplateInterpolationRanges(source);
  const findings = [];

  for (const { kind, binding, pattern } of buildDefineConfigPatterns(source)) {
    for (const match of executableSource.matchAll(pattern)) {
      const range = ranges.find(({ start, end }) => start <= match.index && match.index < end);
      if (!range) continue;

      findings.push({
        kind,
        binding,
        index: match.index,
        interpolationStart: range.start,
        interpolationEnd: range.end,
      });
    }
  }

  findings.sort((left, right) => left.index - right.index || left.binding.localeCompare(right.binding));

  return {
    ready: findings.length === 0,
    findingCount: findings.length,
    findings,
  };
}

function formatPrismaV7EnvLoadingTemplateGuard(status, { json = false } = {}) {
  if (json) return `${JSON.stringify(status)}\n`;

  const rows =
    status.findings.length === 0
      ? ['| none | none |']
      : status.findings.map(
          ({ kind, binding, interpolationStart, interpolationEnd }) =>
            `| ${kind} | \`${binding}\` | ${interpolationStart}-${interpolationEnd} |`,
        );

  return [
    '## Prisma 7 environment-loading template guard (#3417)',
    '',
    `Template interpolation boundary safety: \`${status.ready ? 'ready' : 'blocked'}\` (${status.findingCount} finding(s))`,
    '',
    '| Kind | Binding | Interpolation range |',
    '| --- | --- | --- |',
    ...rows,
    '',
    'This fail-closed guard rejects executable Prisma defineConfig calls inside template-literal interpolation because the primary environment-loading readiness probe intentionally treats template literals conservatively.',
    '',
  ].join('\n');
}

function parseCliOptions(argv = process.argv.slice(2)) {
  if (argv.length === 0) return { json: false };
  if (argv.length === 1 && argv[0] === '--json') return { json: true };
  throw new Error(`unsupported option: ${argv.join(' ')}`);
}

function main() {
  let options;
  try {
    options = parseCliOptions();
  } catch (error) {
    process.stderr.write(`Invalid Prisma 7 template-guard arguments: ${error.message}\n`);
    process.exit(1);
  }

  try {
    const source = fs.readFileSync('prisma.config.ts', 'utf8');
    const status = inspectPrismaV7EnvLoadingTemplateGuard(source);
    process.stdout.write(formatPrismaV7EnvLoadingTemplateGuard(status, options));
    if (!status.ready) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Failed to inspect Prisma 7 template-interpolation safety: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildDefineConfigPatterns,
  findTemplateInterpolationRanges,
  formatPrismaV7EnvLoadingTemplateGuard,
  inspectPrismaV7EnvLoadingTemplateGuard,
  parseCliOptions,
};

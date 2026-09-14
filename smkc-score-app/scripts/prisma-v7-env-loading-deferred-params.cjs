'use strict';

const fs = require('node:fs');

const {
  findCommonJsDotenvConfigImports,
  findDotenvNamespaceImports,
  findNamedDotenvConfigImports,
  isBareIdentifierReference,
  withoutCommentOnlyLines,
} = require('./prisma-v7-env-loading.cjs');

function maskQuotedText(source) {
  let output = '';
  let quote = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quote !== null) {
      if (char === '\n' || char === '\r') {
        output += char;
      } else {
        output += ' ';
      }

      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      output += ' ';
      continue;
    }

    output += char;
  }

  return output;
}

function findMatchingParen(source, openIndex) {
  if (source[openIndex] !== '(') return null;

  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    else if (source[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return null;
}

function findFunctionParameterRanges(structuralSource) {
  const ranges = [];
  const pattern = /\bfunction\s*\*?\s*(?:[A-Za-z_$][\w$]*)?\s*\(/g;

  for (const match of structuralSource.matchAll(pattern)) {
    const openIndex = match.index + match[0].lastIndexOf('(');
    const closeIndex = findMatchingParen(structuralSource, openIndex);
    if (closeIndex === null) continue;
    ranges.push({ kind: 'function', start: openIndex + 1, end: closeIndex });
  }

  return ranges;
}

function findArrowParameterRanges(structuralSource) {
  const ranges = [];

  for (let openIndex = 0; openIndex < structuralSource.length; openIndex += 1) {
    if (structuralSource[openIndex] !== '(') continue;

    const closeIndex = findMatchingParen(structuralSource, openIndex);
    if (closeIndex === null) continue;

    let cursor = closeIndex + 1;
    while (cursor < structuralSource.length && /\s/.test(structuralSource[cursor])) cursor += 1;
    if (structuralSource.slice(cursor, cursor + 2) !== '=>') continue;

    ranges.push({ kind: 'arrow', start: openIndex + 1, end: closeIndex });
    openIndex = closeIndex;
  }

  return ranges;
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function collectPatternInvocations(source, structuralSource, pattern, kind, bareRequire = false) {
  const findings = [];
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);

  for (const match of source.matchAll(globalPattern)) {
    if (structuralSource[match.index] !== source[match.index]) continue;
    if (bareRequire && !isBareIdentifierReference(source, match.index, 'require')) continue;
    findings.push({ index: match.index, kind });
  }

  return findings;
}

function findDotenvInvocations(source, structuralSource = maskQuotedText(source)) {
  const invocations = [];

  for (const name of new Set([...findNamedDotenvConfigImports(source), ...findCommonJsDotenvConfigImports(source)])) {
    const escapedName = name.replace(/[$]/g, '\\$&');
    invocations.push(
      ...collectPatternInvocations(
        source,
        structuralSource,
        new RegExp(`\\b${escapedName}\\s*\\(`),
        `named:${name}`,
      ),
    );
  }

  for (const namespace of new Set(findDotenvNamespaceImports(source))) {
    const escapedNamespace = namespace.replace(/[$]/g, '\\$&');
    invocations.push(
      ...collectPatternInvocations(
        source,
        structuralSource,
        new RegExp(`\\b${escapedNamespace}\\s*\\.\\s*config\\s*\\(`),
        `namespace:${namespace}`,
      ),
    );
  }

  invocations.push(
    ...collectPatternInvocations(
      source,
      structuralSource,
      /\brequire\s*\(\s*['"]dotenv['"]\s*\)\s*\.\s*config\s*\(/,
      'commonjs:require',
      true,
    ),
  );

  return invocations;
}

function findTemplateInterpolationIndexes(source, range) {
  const indexes = [];
  let quote = null;
  let escaped = false;

  for (let index = range.start; index < range.end; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (quote === null) {
      if (char === "'" || char === '"' || char === '`') {
        quote = char;
        escaped = false;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote === '`' && char === '$' && next === '{') {
      indexes.push(index);
      continue;
    }
    if (char === quote) quote = null;
  }

  return indexes;
}

function inspectDeferredPrismaEnvLoading(source) {
  if (typeof source !== 'string') {
    return { safe: false, findings: [{ kind: 'invalid-source', rangeKind: 'unknown', line: null }] };
  }

  const lexicalSource = withoutCommentOnlyLines(source);
  const structuralSource = maskQuotedText(lexicalSource);
  const ranges = [...findFunctionParameterRanges(structuralSource), ...findArrowParameterRanges(structuralSource)];
  const findings = [];
  const seen = new Set();

  for (const invocation of findDotenvInvocations(lexicalSource, structuralSource)) {
    const range = ranges.find((candidate) => invocation.index >= candidate.start && invocation.index < candidate.end);
    if (!range) continue;

    const key = `${invocation.index}:${invocation.kind}:${range.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      kind: invocation.kind,
      rangeKind: range.kind,
      line: lineNumberAt(source, invocation.index),
    });
  }

  for (const range of ranges) {
    for (const index of findTemplateInterpolationIndexes(lexicalSource, range)) {
      const key = `${index}:template-interpolation:${range.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        kind: 'template-interpolation',
        rangeKind: range.kind,
        line: lineNumberAt(source, index),
      });
    }
  }

  findings.sort((left, right) => (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER));
  return { safe: findings.length === 0, findings };
}

function formatDeferredPrismaEnvLoading(status) {
  const lines = [
    '## Prisma 7 deferred environment-loading guard (#3114)',
    '',
    `Deferred parameter loading: \`${status.safe ? 'safe' : 'needs migration'}\``,
    `Findings: \`${status.findings.length}\``,
  ];

  for (const finding of status.findings) {
    lines.push(`- line ${finding.line ?? 'unknown'}: \`${finding.kind}\` inside \`${finding.rangeKind}\` parameters`);
  }

  lines.push(
    '',
    'This guard rejects dotenv loading calls stored in function or parenthesized-arrow parameter initializers because those calls are deferred until invocation and cannot prove module-initialization ordering.',
    '',
  );

  return lines.join('\n');
}

function main() {
  try {
    const source = fs.readFileSync('prisma.config.ts', 'utf8');
    const status = inspectDeferredPrismaEnvLoading(source);
    const output = formatDeferredPrismaEnvLoading(status);
    process.stdout.write(output);

    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, output, 'utf8');
    }

    if (!status.safe) process.exit(1);
  } catch (error) {
    process.stderr.write(`Failed to inspect deferred Prisma 7 environment loading: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  findArrowParameterRanges,
  findDotenvInvocations,
  findFunctionParameterRanges,
  findMatchingParen,
  findTemplateInterpolationIndexes,
  formatDeferredPrismaEnvLoading,
  inspectDeferredPrismaEnvLoading,
  maskQuotedText,
};

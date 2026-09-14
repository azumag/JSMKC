'use strict';

const fs = require('node:fs');

const {
  isBareIdentifierReference,
  isTopLevelSourceIndex,
  withoutCommentOnlyLines,
} = require('./prisma-v7-env-loading.cjs');

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r\n|\n|\r/).length;
}

function firstAssignmentIndex(source) {
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char !== '=') continue;
    if (next === '>' || next === '=') continue;
    if (
      source[index - 1] === '=' ||
      source[index - 1] === '!' ||
      source[index - 1] === '<' ||
      source[index - 1] === '>'
    ) {
      continue;
    }
    return index;
  }
  return -1;
}

function declarationBindsRequire(declaration) {
  const assignmentIndex = firstAssignmentIndex(declaration);
  const binding = assignmentIndex === -1 ? declaration : declaration.slice(0, assignmentIndex);

  return (
    /^\s*require\b/.test(binding) ||
    /(?:\{|,)\s*require\s*(?=[,}=])/.test(binding) ||
    /:\s*require\s*(?=[,}=])/.test(binding) ||
    /(?:\[|,)\s*require\s*(?=[,\]=])/.test(binding)
  );
}

function importBindsRequire(importClause) {
  return (
    /^\s*require\b/.test(importClause) ||
    /\*\s+as\s+require\b/.test(importClause) ||
    /\bas\s+require\b/.test(importClause) ||
    /(?:\{|,)\s*require\s*(?=[,}])/.test(importClause)
  );
}

function findPrismaConfigRequireRebindings(source) {
  if (typeof source !== 'string') return [];

  const lexicalSource = withoutCommentOnlyLines(source);
  const findings = [];
  const reportedLines = new Set();

  function report(index, kind) {
    const line = lineNumberAt(lexicalSource, index);
    if (reportedLines.has(line)) return;
    reportedLines.add(line);
    findings.push({ line, kind });
  }

  const variableDeclaration = /^[ \t]*(?:export[ \t]+)?(?:const|let|var)[ \t]+([^;\r\n]+)/gm;
  for (const match of lexicalSource.matchAll(variableDeclaration)) {
    if (!isTopLevelSourceIndex(lexicalSource, match.index)) continue;
    if (declarationBindsRequire(match[1])) report(match.index, 'binding');
  }

  const importDeclaration = /^[ \t]*import[ \t]+([^;\r\n]+)/gm;
  for (const match of lexicalSource.matchAll(importDeclaration)) {
    if (!isTopLevelSourceIndex(lexicalSource, match.index)) continue;
    const fromIndex = match[1].search(/\s+from\s+['"]/);
    const clause = fromIndex === -1 ? match[1] : match[1].slice(0, fromIndex);
    if (importBindsRequire(clause)) report(match.index, 'binding');
  }

  const namedDeclaration = /^[ \t]*(?:export[ \t]+)?(?:(?:async[ \t]+)?function|class)[ \t]+require\b/gm;
  for (const match of lexicalSource.matchAll(namedDeclaration)) {
    if (isTopLevelSourceIndex(lexicalSource, match.index)) report(match.index, 'binding');
  }

  const assignment = /\brequire\s*(?:\?\?=|&&=|\|\|=|\*\*=|>>>=|<<=|>>=|[+\-*/%&^|]?=)/g;
  for (const match of lexicalSource.matchAll(assignment)) {
    if (!isBareIdentifierReference(lexicalSource, match.index, 'require')) continue;
    if (!isTopLevelSourceIndex(lexicalSource, match.index)) continue;
    report(match.index, 'assignment');
  }

  return findings.sort((left, right) => left.line - right.line);
}

function formatFindings(findings) {
  if (findings.length === 0) {
    return 'Prisma require binding guard: PASS\n';
  }

  return [
    'Prisma require binding guard: FAIL',
    ...findings.map(
      (finding) =>
        `- line ${finding.line}: top-level require ${finding.kind} can invalidate bare require('dotenv') readiness evidence`,
    ),
    '',
  ].join('\n');
}

function main() {
  try {
    const source = fs.readFileSync('prisma.config.ts', 'utf8');
    const findings = findPrismaConfigRequireRebindings(source);
    const output = formatFindings(findings);

    if (findings.length === 0) {
      process.stdout.write(output);
      return;
    }

    process.stderr.write(output);
    process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Failed to inspect Prisma require bindings: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  declarationBindsRequire,
  findPrismaConfigRequireRebindings,
  firstAssignmentIndex,
  formatFindings,
  importBindsRequire,
  lineNumberAt,
};

'use strict';

const fs = require('node:fs');
const ts = require('typescript');

const {
  isBareIdentifierReference,
  isTopLevelSourceIndex,
  withoutCommentOnlyLines,
} = require('./prisma-v7-env-loading.cjs');

const assignmentOperatorKinds = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.AmpersandEqualsToken,
  ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r\n|\n|\r/).length;
}

function firstAssignmentIndex(source) {
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '{') {
      braceDepth += 1;
      continue;
    }
    if (char === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (char === '[') {
      bracketDepth += 1;
      continue;
    }
    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (char === '(') {
      parenDepth += 1;
      continue;
    }
    if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }

    if (char !== '=' || braceDepth !== 0 || bracketDepth !== 0 || parenDepth !== 0) continue;
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

function isFunctionLikeBoundary(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function hasStaticModifier(node) {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword) ?? false;
}

function findModuleScopeRequireAssignments(source) {
  if (typeof source !== 'string') return [];

  const sourceFile = ts.createSourceFile('prisma.config.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const indexes = [];

  function report(node) {
    indexes.push(node.getStart(sourceFile));
  }

  function visitClass(node) {
    for (const heritageClause of node.heritageClauses ?? []) visit(heritageClause);

    for (const member of node.members) {
      if (member.name) visit(member.name);

      if (ts.isClassStaticBlockDeclaration(member)) {
        visit(member);
      } else if (ts.isPropertyDeclaration(member) && hasStaticModifier(member) && member.initializer) {
        visit(member.initializer);
      }
    }
  }

  function visit(node) {
    if (node !== sourceFile && isFunctionLikeBoundary(node)) return;

    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      visitClass(node);
      return;
    }

    if (
      ts.isBinaryExpression(node) &&
      assignmentOperatorKinds.has(node.operatorToken.kind) &&
      ts.isIdentifier(node.left) &&
      node.left.text === 'require'
    ) {
      report(node.left);
    }

    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) &&
      ts.isIdentifier(node.operand) &&
      node.operand.text === 'require'
    ) {
      report(node.operand);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...new Set(indexes)].sort((left, right) => left - right);
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

  const namedDeclaration =
    /^[ \t]*(?:export[ \t]+(?:default[ \t]+)?)?(?:(?:async[ \t]+)?function[ \t]*\*?|class)[ \t]+require\b/gm;
  for (const match of lexicalSource.matchAll(namedDeclaration)) {
    if (isTopLevelSourceIndex(lexicalSource, match.index)) report(match.index, 'binding');
  }

  const assignment = /\brequire\s*(?:\?\?=|&&=|\|\|=|\*\*=|>>>=|<<=|>>=|[+\-*/%&^|]?=)/g;
  for (const match of lexicalSource.matchAll(assignment)) {
    if (!isBareIdentifierReference(lexicalSource, match.index, 'require')) continue;
    if (!isTopLevelSourceIndex(lexicalSource, match.index)) continue;
    report(match.index, 'assignment');
  }

  for (const index of findModuleScopeRequireAssignments(source)) {
    report(index, 'assignment');
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
        `- line ${finding.line}: module-scope require ${finding.kind} can invalidate bare require('dotenv') readiness evidence`,
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
  findModuleScopeRequireAssignments,
  findPrismaConfigRequireRebindings,
  firstAssignmentIndex,
  formatFindings,
  importBindsRequire,
  lineNumberAt,
};

'use strict';

const fs = require('node:fs');

const {
  findCommonJsPrismaDefineConfigImports,
  findNamedPrismaDefineConfigImports,
  findPrismaConfigNamespaceImports,
  isTopLevelSourceIndex,
  withoutCommentOnlyLines,
} = require('./prisma-v7-env-loading.cjs');

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r\n|\n|\r/).length;
}

function collectTopLevelAliasDeclarations(source) {
  const declarations = [];
  const pattern =
    /^[ \t]*(?:export[ \t]+)?(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*=[ \t]*([A-Za-z_$][\w$]*(?:[ \t]*\.[ \t]*defineConfig)?)[ \t]*;?[ \t]*$/gm;

  for (const match of source.matchAll(pattern)) {
    if (!isTopLevelSourceIndex(source, match.index)) continue;
    declarations.push({
      alias: match[1],
      initializer: match[2].replace(/[ \t]+/g, ''),
      index: match.index,
    });
  }

  return declarations;
}

function findPrismaDefineConfigRealiases(source) {
  if (typeof source !== 'string') return [];

  const lexicalSource = withoutCommentOnlyLines(source);
  const directBindings = new Set([
    ...findNamedPrismaDefineConfigImports(lexicalSource),
    ...findCommonJsPrismaDefineConfigImports(lexicalSource),
  ]);
  const namespaceBindings = new Set(findPrismaConfigNamespaceImports(lexicalSource));
  const declarations = collectTopLevelAliasDeclarations(lexicalSource);
  const aliases = new Set(directBindings);
  const findings = [];
  const reported = new Set();

  let changed = true;
  while (changed) {
    changed = false;

    for (const declaration of declarations) {
      if (aliases.has(declaration.alias)) continue;

      const namespaceMatch = /^([A-Za-z_$][\w$]*)\.defineConfig$/.exec(declaration.initializer);
      const aliasesDefineConfig = aliases.has(declaration.initializer);
      const aliasesNamespaceDefineConfig = namespaceMatch !== null && namespaceBindings.has(namespaceMatch[1]);

      if (!aliasesDefineConfig && !aliasesNamespaceDefineConfig) continue;

      aliases.add(declaration.alias);
      changed = true;

      if (!reported.has(declaration.index)) {
        reported.add(declaration.index);
        findings.push({
          line: lineNumberAt(lexicalSource, declaration.index),
          alias: declaration.alias,
          source: declaration.initializer,
        });
      }
    }
  }

  return findings.sort((left, right) => left.line - right.line);
}

function formatFindings(findings) {
  if (findings.length === 0) {
    return 'Prisma defineConfig re-alias guard: PASS\n';
  }

  return [
    'Prisma defineConfig re-alias guard: FAIL',
    ...findings.map(
      (finding) => `- line ${finding.line}: ${finding.alias} aliases ${finding.source}; keep Prisma defineConfig calls direct`,
    ),
    '',
  ].join('\n');
}

function main() {
  try {
    const source = fs.readFileSync('prisma.config.ts', 'utf8');
    const findings = findPrismaDefineConfigRealiases(source);
    const output = formatFindings(findings);

    if (findings.length === 0) {
      process.stdout.write(output);
      return;
    }

    process.stderr.write(output);
    process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Failed to inspect Prisma defineConfig aliases: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  collectTopLevelAliasDeclarations,
  findPrismaDefineConfigRealiases,
  formatFindings,
  lineNumberAt,
};

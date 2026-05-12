import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const repoRoot = path.join(process.cwd(), '..');

export function readRepoFile(...parts: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');
}

const e2eCases = readRepoFile('E2E_TEST_CASES.md');

export function sectionBetween(
  source: string,
  startMarker: string,
  endMarker: string,
  { allowTerminal = false }: { allowTerminal?: boolean } = {},
) {
  const sectionStart = source.indexOf(startMarker);
  if (sectionStart === -1) {
    throw new Error(`section start marker not found: "${startMarker}"`);
  }

  const sectionEndCandidate = source.indexOf(endMarker, sectionStart + startMarker.length);
  if (!allowTerminal) {
    if (sectionEndCandidate <= sectionStart) {
      throw new Error(`section end marker not found after "${startMarker}": "${endMarker}"`);
    }
    return source.slice(sectionStart, sectionEndCandidate);
  }

  if (sectionEndCandidate === -1) {
    if (source.length <= sectionStart + startMarker.length) {
      throw new Error(`terminal section for marker "${startMarker}" has no content`);
    }
    return source.slice(sectionStart);
  }

  if (sectionEndCandidate <= sectionStart) {
    throw new Error(`section end marker not found after "${startMarker}": "${endMarker}"`);
  }
  return source.slice(sectionStart, sectionEndCandidate);
}

export function e2eCaseSection(tc: string, source = e2eCases) {
  const heading = new RegExp(`^#{2,3} ${tc}:`, 'm');
  const match = heading.exec(source);
  if (!match) throw new Error(`${tc} section not found`);

  const start = match.index;
  const next = source.slice(start + 1).search(/\n#{2,3} TC-/);
  const end = next === -1 ? source.length : start + 1 + next;
  return source.slice(start, end);
}

export function functionReturnObjectLiteral(source: string, functionName: string) {
  const sourceFile = ts.createSourceFile(
    'source.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  let returnObject: ts.ObjectLiteralExpression | null = null;

  function visit(node: ts.Node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === functionName &&
      node.body
    ) {
      for (const statement of [...node.body.statements].reverse()) {
        if (
          ts.isReturnStatement(statement) &&
          statement.expression &&
          ts.isObjectLiteralExpression(statement.expression)
        ) {
          returnObject = statement.expression;
          return;
        }
      }
    }

    if (!returnObject) {
      ts.forEachChild(node, visit);
    }
  }

  visit(sourceFile);

  if (!returnObject) {
    throw new Error(`return object not found for function: ${functionName}`);
  }

  return returnObject.getText(sourceFile);
}

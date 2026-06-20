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
    const terminalSection = source.slice(sectionStart);
    const terminalContent = terminalSection.slice(startMarker.length);
    if (terminalContent.trim().length === 0) {
      throw new Error(`terminal section for marker "${startMarker}" has no content`);
    }
    return terminalSection;
  }

  if (sectionEndCandidate <= sectionStart) {
    throw new Error(`section end marker not found after "${startMarker}": "${endMarker}"`);
  }
  return source.slice(sectionStart, sectionEndCandidate);
}

/**
 * Extract the source section immediately following the first block comment
 * that contains `commentStartMarker`, up to but not including `endMarker`.
 */
export function sectionAfterBlockComment(
  source: string,
  commentStartMarker: string,
  endMarker: string,
) {
  const commentStart = source.indexOf(commentStartMarker);
  if (commentStart === -1) {
    throw new Error(`comment start marker not found: "${commentStartMarker}"`);
  }

  const commentEnd = source.indexOf('*/', commentStart);
  if (commentEnd === -1) {
    throw new Error(`block comment end not found after "${commentStartMarker}"`);
  }

  const sectionStart = commentEnd + '*/'.length;
  const sectionEnd = source.indexOf(endMarker, sectionStart);
  if (sectionEnd === -1) {
    throw new Error(`section end marker not found after "${commentStartMarker}": "${endMarker}"`);
  }

  return source.slice(sectionStart, sectionEnd);
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

// AST-based: regex cannot safely verify all required args appear in the same call expression —
// nested parens and multi-line formatting make string/regex co-occurrence checks unreliable.
export function callExpressionWithArguments(
  source: string,
  functionName: string,
  requiredArgumentTexts: string[],
) {
  const sourceFile = ts.createSourceFile(
    'source.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  let matchedCall: ts.CallExpression | null = null;

  function isTargetCall(node: ts.CallExpression) {
    if (!ts.isIdentifier(node.expression) || node.expression.text !== functionName) {
      return false;
    }

    const argumentTexts = node.arguments.map((argument) => argument.getText(sourceFile));
    return requiredArgumentTexts.every((requiredText) => argumentTexts.includes(requiredText));
  }

  function visit(node: ts.Node) {
    if (matchedCall) return;

    if (ts.isCallExpression(node) && isTargetCall(node)) {
      matchedCall = node;
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (!matchedCall) {
    throw new Error(
      `call expression not found: ${functionName}(${requiredArgumentTexts.join(', ')})`,
    );
  }

  return matchedCall.getText(sourceFile);
}

function propertyNameText(name: ts.PropertyName) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText();
}

function objectPropertyInitializer(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
) {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (propertyNameText(property.name) === propertyName) {
      return property.initializer;
    }
  }
  return null;
}

function nestedObjectPropertyInitializer(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyPath: string[],
) {
  let current: ts.Expression | null = objectLiteral;

  for (const propertyName of propertyPath) {
    if (!current || !ts.isObjectLiteralExpression(current)) {
      return null;
    }
    current = objectPropertyInitializer(current, propertyName);
  }

  return current;
}

function firstArgumentObject(call: ts.CallExpression) {
  const [firstArgument] = call.arguments;
  return firstArgument && ts.isObjectLiteralExpression(firstArgument) ? firstArgument : null;
}

function callExpressionMatchesText(
  sourceFile: ts.SourceFile,
  call: ts.CallExpression,
  calleeText: string,
) {
  return call.expression.getText(sourceFile) === calleeText;
}

function collectMatchingCalls(source: string, calleeText: string) {
  const sourceFile = ts.createSourceFile(
    'source.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const calls: ts.CallExpression[] = [];

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && callExpressionMatchesText(sourceFile, node, calleeText)) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { sourceFile, calls };
}

export function callObjectArrayLiteralTexts(
  source: string,
  calleeText: string,
  propertyPath: string[],
) {
  const { sourceFile, calls } = collectMatchingCalls(source, calleeText);
  return calls.map((call) => {
    const objectLiteral = firstArgumentObject(call);
    const initializer = objectLiteral
      ? nestedObjectPropertyInitializer(objectLiteral, propertyPath)
      : null;

    if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
      throw new Error(`${calleeText} missing array literal at ${propertyPath.join('.')}`);
    }

    return initializer.elements.map((element) => {
      if (ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element)) {
        return element.text;
      }
      return element.getText(sourceFile);
    });
  });
}

export function callObjectPropertyNames(
  source: string,
  calleeText: string,
  propertyPath: string[],
) {
  const { calls } = collectMatchingCalls(source, calleeText);
  return calls.map((call) => {
    const objectLiteral = firstArgumentObject(call);
    const initializer = objectLiteral
      ? nestedObjectPropertyInitializer(objectLiteral, propertyPath)
      : null;

    if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
      throw new Error(`${calleeText} missing object literal at ${propertyPath.join('.')}`);
    }

    return initializer.properties
      .filter((property): property is ts.PropertyAssignment | ts.ShorthandPropertyAssignment =>
        ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property),
      )
      .map((property) => propertyNameText(property.name));
  });
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

  function objectLiteralFromBody(body: ts.ConciseBody) {
    let expression = body;
    while (ts.isParenthesizedExpression(expression)) {
      expression = expression.expression;
    }

    if (ts.isObjectLiteralExpression(expression)) {
      return expression;
    }

    if (!ts.isBlock(expression)) {
      return null;
    }

    for (const statement of [...expression.statements].reverse()) {
      if (
        ts.isReturnStatement(statement) &&
        statement.expression &&
        ts.isObjectLiteralExpression(statement.expression)
      ) {
        return statement.expression;
      }
    }

    return null;
  }

  function visit(node: ts.Node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === functionName &&
      node.body
    ) {
      returnObject = objectLiteralFromBody(node.body);
      return;
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === functionName &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      returnObject = objectLiteralFromBody(node.initializer.body);
      return;
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

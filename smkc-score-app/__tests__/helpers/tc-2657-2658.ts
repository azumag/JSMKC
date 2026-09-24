import ts from 'typescript';

type ExpectedRankValue = number | null;

const SKIPPED_TEST_IDENTIFIERS = new Set(['xit', 'xtest', 'xdescribe']);
const TEST_CONTAINER_IDENTIFIERS = new Set(['it', 'test', 'describe']);
const RUNNABLE_TEST_IDENTIFIERS = new Set(['it', 'test']);

function isNamedCall(call: ts.CallExpression, name: string): boolean {
  return ts.isIdentifier(call.expression) && call.expression.text === name;
}

function hasExpressionRoot(expression: ts.Expression, roots: Set<string>): boolean {
  if (ts.isIdentifier(expression)) return roots.has(expression.text);
  if (ts.isPropertyAccessExpression(expression)) return hasExpressionRoot(expression.expression, roots);
  if (ts.isCallExpression(expression)) return hasExpressionRoot(expression.expression, roots);
  return false;
}

function hasSkippedTestModifier(expression: ts.Expression): boolean {
  if (ts.isPropertyAccessExpression(expression)) {
    if (
      (expression.name.text === 'skip' || expression.name.text === 'todo') &&
      hasExpressionRoot(expression.expression, TEST_CONTAINER_IDENTIFIERS)
    ) {
      return true;
    }
    return hasSkippedTestModifier(expression.expression);
  }
  if (ts.isCallExpression(expression)) return hasSkippedTestModifier(expression.expression);
  return false;
}

function isSkippedTestContainer(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  return hasExpressionRoot(node.expression, SKIPPED_TEST_IDENTIFIERS) || hasSkippedTestModifier(node.expression);
}

function isInsideSkippedTestContainer(node: ts.Node): boolean {
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    if (isSkippedTestContainer(current)) return true;
  }
  return false;
}

function isFunctionBoundary(node: ts.Node): boolean {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node)
  );
}

function isActCallback(node: ts.Node): boolean {
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return false;
  const parent = node.parent;
  return ts.isCallExpression(parent) && parent.arguments.some((argument) => argument === node) && isNamedCall(parent, 'act');
}

function isPropertyCall(call: ts.CallExpression, owner: string, property: string): boolean {
  return (
    ts.isPropertyAccessExpression(call.expression) &&
    ts.isIdentifier(call.expression.expression) &&
    call.expression.expression.text === owner &&
    call.expression.name.text === property
  );
}

function objectHasStringProperty(node: ts.Node | undefined, property: string, value: string): boolean {
  if (!node || !ts.isObjectLiteralExpression(node)) return false;

  return node.properties.some((entry) => {
    if (!ts.isPropertyAssignment(entry)) return false;
    const name = entry.name;
    const propertyName = ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined;
    return propertyName === property && ts.isStringLiteralLike(entry.initializer) && entry.initializer.text === value;
  });
}

function isExpectedRankValue(node: ts.Expression | undefined, expected: ExpectedRankValue): boolean {
  if (!node) return false;
  if (expected === null) return node.kind === ts.SyntaxKind.NullKeyword;
  return ts.isNumericLiteral(node) && Number(node.text) === expected;
}

function isSaveOutcomeAssertion(
  call: ts.CallExpression,
  qualificationId: string,
  expected: ExpectedRankValue,
): boolean {
  if (
    !ts.isPropertyAccessExpression(call.expression) ||
    call.expression.name.text !== 'toHaveBeenCalledWith' ||
    !ts.isCallExpression(call.expression.expression)
  ) {
    return false;
  }

  const expectCall = call.expression.expression;
  const [expectArgument] = expectCall.arguments;
  const [idArgument, valueArgument] = call.arguments;

  return (
    isNamedCall(expectCall, 'expect') &&
    expectCall.arguments.length === 1 &&
    expectArgument !== undefined &&
    ts.isIdentifier(expectArgument) &&
    expectArgument.text === 'noop' &&
    call.arguments.length === 2 &&
    idArgument !== undefined &&
    ts.isStringLiteralLike(idArgument) &&
    idArgument.text === qualificationId &&
    isExpectedRankValue(valueArgument, expected)
  );
}

function isEditorClosedAssertion(call: ts.CallExpression): boolean {
  if (
    !ts.isPropertyAccessExpression(call.expression) ||
    call.expression.name.text !== 'toBeNull' ||
    !ts.isCallExpression(call.expression.expression)
  ) {
    return false;
  }

  const expectCall = call.expression.expression;
  const [expectArgument] = expectCall.arguments;
  if (
    !isNamedCall(expectCall, 'expect') ||
    expectCall.arguments.length !== 1 ||
    !expectArgument ||
    !ts.isCallExpression(expectArgument) ||
    !isPropertyCall(expectArgument, 'screen', 'queryByRole')
  ) {
    return false;
  }

  const [roleArgument, optionsArgument] = expectArgument.arguments;
  return (
    roleArgument !== undefined &&
    ts.isStringLiteralLike(roleArgument) &&
    roleArgument.text === 'spinbutton' &&
    objectHasStringProperty(optionsArgument, 'name', 'Rank override')
  );
}

function isEnterKeyDown(call: ts.CallExpression): boolean {
  if (!isPropertyCall(call, 'fireEvent', 'keyDown')) return false;
  return objectHasStringProperty(call.arguments[1], 'key', 'Enter');
}

function testCaseHasRankCellSaveOutcome(
  callback: ts.ArrowFunction | ts.FunctionExpression,
  qualificationId: string,
  expected: ExpectedRankValue,
): boolean {
  let saveOutcome = false;
  let editorClosed = false;
  let enterKeyDown = false;

  function visit(node: ts.Node) {
    if (node !== callback.body && isFunctionBoundary(node) && !isActCallback(node)) return;

    if (ts.isCallExpression(node)) {
      saveOutcome ||= isSaveOutcomeAssertion(node, qualificationId, expected);
      editorClosed ||= isEditorClosedAssertion(node);
      enterKeyDown ||= isEnterKeyDown(node);
    }

    if (!(saveOutcome && editorClosed && enterKeyDown)) ts.forEachChild(node, visit);
  }

  visit(callback.body);
  return saveOutcome && editorClosed && enterKeyDown;
}

function hasRankCellSaveOutcome(source: string, qualificationId: string, expected: ExpectedRankValue): boolean {
  const sourceFile = ts.createSourceFile(
    'rank-cell-owner.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let found = false;

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      hasExpressionRoot(node.expression, RUNNABLE_TEST_IDENTIFIERS) &&
      !isInsideSkippedTestContainer(node) &&
      node.arguments.length >= 2
    ) {
      const callback = node.arguments[1];
      if (
        callback &&
        (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) &&
        testCaseHasRankCellSaveOutcome(callback, qualificationId, expected)
      ) {
        found = true;
        return;
      }
    }

    if (!found) ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

export function hasTc2657EmptyRankClearContract(source: string): boolean {
  return hasRankCellSaveOutcome(source, 'qual-empty', null);
}

export function hasTc2658ZeroRankSaveContract(source: string): boolean {
  return hasRankCellSaveOutcome(source, 'qual-zero', 0);
}

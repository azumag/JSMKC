import ts from 'typescript';

const SKIPPED_TEST_IDENTIFIERS = new Set(['xit', 'xtest', 'xdescribe']);
const TEST_CONTAINER_IDENTIFIERS = new Set(['it', 'test', 'describe']);
const RUNNABLE_TEST_IDENTIFIERS = new Set(['it', 'test']);

function isNamedCall(call: ts.CallExpression, name: string): boolean {
  return ts.isIdentifier(call.expression) && call.expression.text === name;
}

function isStringArgument(call: ts.CallExpression, value: string): boolean {
  const [argument] = call.arguments;
  return (
    call.arguments.length === 1 && argument !== undefined && ts.isStringLiteralLike(argument) && argument.text === value
  );
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

function isFunctionBoundary(node: ts.Node): boolean {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node)
  );
}

function isRunnableTestCallback(node: ts.Node): boolean {
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return false;

  const parent = node.parent;
  return (
    ts.isCallExpression(parent) &&
    parent.arguments.some((argument) => argument === node) &&
    hasExpressionRoot(parent.expression, RUNNABLE_TEST_IDENTIFIERS)
  );
}

function isInsideRunnableTestContainer(node: ts.Node): boolean {
  let foundRunnableCallback = false;

  for (let current = node.parent; current; current = current.parent) {
    if (isSkippedTestContainer(current)) return false;
    if (isFunctionBoundary(current) && !foundRunnableCallback) {
      if (!isRunnableTestCallback(current)) return false;
      foundRunnableCallback = true;
    }
  }

  return foundRunnableCallback;
}

export function hasTc1987TvNullAssertion(source: string): boolean {
  const sourceFile = ts.createSourceFile('tc-1987-owner.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;

  function visit(node: ts.Node) {
    if (found) return;

    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 0 &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'toBeNull' &&
      ts.isCallExpression(node.expression.expression) &&
      isInsideRunnableTestContainer(node)
    ) {
      const expectCall = node.expression.expression;
      const [expectArgument] = expectCall.arguments;

      if (
        isNamedCall(expectCall, 'expect') &&
        expectCall.arguments.length === 1 &&
        expectArgument &&
        ts.isCallExpression(expectArgument) &&
        isNamedCall(expectArgument, 'parseTvNumberInput') &&
        isStringArgument(expectArgument, 'abc')
      ) {
        found = true;
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

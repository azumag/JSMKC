import ts from 'typescript';

const SKIPPED_TEST_IDENTIFIERS = new Set(['xit', 'xtest', 'xdescribe']);
const TEST_CONTAINER_IDENTIFIERS = new Set(['it', 'test', 'describe']);

function isNamedCall(call: ts.CallExpression, name: string): boolean {
  return ts.isIdentifier(call.expression) && call.expression.text === name;
}

function isStringArgument(call: ts.CallExpression, value: string): boolean {
  const [argument] = call.arguments;
  return (
    call.arguments.length === 1 && argument !== undefined && ts.isStringLiteralLike(argument) && argument.text === value
  );
}

function hasTestContainerRoot(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) return TEST_CONTAINER_IDENTIFIERS.has(expression.text);
  if (ts.isPropertyAccessExpression(expression)) return hasTestContainerRoot(expression.expression);
  if (ts.isCallExpression(expression)) return hasTestContainerRoot(expression.expression);
  return false;
}

function hasSkippedTestModifier(expression: ts.Expression): boolean {
  if (ts.isPropertyAccessExpression(expression)) {
    if (
      (expression.name.text === 'skip' || expression.name.text === 'todo') &&
      hasTestContainerRoot(expression.expression)
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

  if (ts.isIdentifier(node.expression)) {
    return SKIPPED_TEST_IDENTIFIERS.has(node.expression.text);
  }

  return hasSkippedTestModifier(node.expression);
}

function isInsideSkippedTestContainer(node: ts.Node): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (isSkippedTestContainer(current)) return true;
  }
  return false;
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
      !isInsideSkippedTestContainer(node)
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

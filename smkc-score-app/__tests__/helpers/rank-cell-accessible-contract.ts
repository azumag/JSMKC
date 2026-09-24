import ts from 'typescript';

const SKIPPED_TEST_IDENTIFIERS = new Set(['xit', 'xtest', 'xdescribe']);
const TEST_CONTAINER_IDENTIFIERS = new Set(['it', 'test', 'describe']);
const RUNNABLE_TEST_IDENTIFIERS = new Set(['it', 'test']);
const DIRECT_CALLBACK_IDENTIFIERS = new Set(['act', 'waitFor']);

function isStringLiteral(node: ts.Node | undefined, value: string): boolean {
  return node !== undefined && ts.isStringLiteralLike(node) && node.text === value;
}

function objectHasStringProperty(node: ts.Node | undefined, propertyName: string, value: string): boolean {
  if (!node || !ts.isObjectLiteralExpression(node)) return false;

  return node.properties.some((property) => {
    if (!ts.isPropertyAssignment(property)) return false;

    const name = property.name;
    const matchesName = (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) && name.text === propertyName;

    return matchesName && isStringLiteral(property.initializer, value);
  });
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

function isDirectlyExecutedCallback(node: ts.Node): boolean {
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return false;
  const parent = node.parent;
  return (
    ts.isCallExpression(parent) &&
    parent.arguments.some((argument) => argument === node) &&
    hasExpressionRoot(parent.expression, DIRECT_CALLBACK_IDENTIFIERS)
  );
}

function isRoleQuery(node: ts.CallExpression, role: string, accessibleName: string): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (!ts.isIdentifier(node.expression.expression) || node.expression.expression.text !== 'screen') return false;
  if (!['getByRole', 'queryByRole', 'findByRole'].includes(node.expression.name.text)) return false;

  const [roleArgument, optionsArgument] = node.arguments;
  return (
    node.arguments.length >= 2 &&
    isStringLiteral(roleArgument, role) &&
    objectHasStringProperty(optionsArgument, 'name', accessibleName)
  );
}

function callbackHasAccessibleButtonQuery(
  callback: ts.ArrowFunction | ts.FunctionExpression,
  accessibleName: string,
): boolean {
  let found = false;

  function visit(node: ts.Node) {
    if (found) return;
    if (node !== callback.body && isFunctionBoundary(node) && !isDirectlyExecutedCallback(node)) return;

    if (ts.isCallExpression(node) && isRoleQuery(node, 'button', accessibleName)) {
      found = true;
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(callback.body);
  return found;
}

function hasAccessibleButtonContract(source: string, testCaseId: string, accessibleName: string): boolean {
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
      const [title, callback] = node.arguments;
      if (
        title &&
        ts.isStringLiteralLike(title) &&
        title.text.startsWith(`${testCaseId}:`) &&
        callback &&
        (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) &&
        callbackHasAccessibleButtonQuery(callback, accessibleName)
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

export function hasRankCellClearAccessibleNameContract(source: string, testCaseId: string): boolean {
  return hasAccessibleButtonContract(source, testCaseId, 'Clear rank override');
}

export function hasRankCellSaveAccessibleNameContract(source: string, testCaseId: string): boolean {
  return hasAccessibleButtonContract(source, testCaseId, 'Save rank');
}

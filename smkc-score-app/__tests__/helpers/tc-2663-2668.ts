import ts from 'typescript';

type TestCallback = ts.ArrowFunction | ts.FunctionExpression;
type CallbackPredicate = (callback: TestCallback) => boolean;

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

function isPropertyCall(call: ts.CallExpression, owner: string, property: string): boolean {
  return (
    ts.isPropertyAccessExpression(call.expression) &&
    ts.isIdentifier(call.expression.expression) &&
    call.expression.expression.text === owner &&
    call.expression.name.text === property
  );
}

function objectHasLiteralProperty(node: ts.Node | undefined, property: string, expected: string | boolean): boolean {
  if (!node || !ts.isObjectLiteralExpression(node)) return false;

  return node.properties.some((entry) => {
    if (!ts.isPropertyAssignment(entry)) return false;
    const name = entry.name;
    const propertyName = ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined;
    if (propertyName !== property) return false;

    if (typeof expected === 'string') {
      return ts.isStringLiteralLike(entry.initializer) && entry.initializer.text === expected;
    }

    return entry.initializer.kind === (expected ? ts.SyntaxKind.TrueKeyword : ts.SyntaxKind.FalseKeyword);
  });
}

function callbackHasCall(callback: TestCallback, predicate: (call: ts.CallExpression) => boolean): boolean {
  let found = false;

  function visit(node: ts.Node) {
    if (found) return;
    if (ts.isCallExpression(node) && predicate(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(callback.body);
  return found;
}

function isScreenTextExpectation(
  call: ts.CallExpression,
  query: 'getByText' | 'queryByText',
  text: string,
  matcher: string,
) {
  if (
    !ts.isPropertyAccessExpression(call.expression) ||
    call.expression.name.text !== matcher ||
    !ts.isCallExpression(call.expression.expression)
  ) {
    return false;
  }

  const expectCall = call.expression.expression;
  const [expectArgument] = expectCall.arguments;
  if (!isNamedCall(expectCall, 'expect') || !expectArgument || !ts.isCallExpression(expectArgument)) return false;
  if (!isPropertyCall(expectArgument, 'screen', query)) return false;

  const [textArgument] = expectArgument.arguments;
  return textArgument !== undefined && ts.isStringLiteralLike(textArgument) && textArgument.text === text;
}

function isSwitchRoleQuery(call: ts.CallExpression): boolean {
  if (!isPropertyCall(call, 'screen', 'getByRole')) return false;
  const [roleArgument] = call.arguments;
  return roleArgument !== undefined && ts.isStringLiteralLike(roleArgument) && roleArgument.text === 'switch';
}

function isNamedSwitchRoleQuery(call: ts.CallExpression): boolean {
  if (!isSwitchRoleQuery(call)) return false;
  const [, optionsArgument] = call.arguments;
  return objectHasLiteralProperty(optionsArgument, 'name', 'Battle Mode publication');
}

function callbackDeclaresQueryIdentifier(
  callback: TestCallback,
  identifier: string,
  predicate: (call: ts.CallExpression) => boolean,
): boolean {
  let found = false;

  function visit(node: ts.Node) {
    if (found) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === identifier &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      predicate(node.initializer)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(callback.body);
  return found;
}

function expectationTargetsQuery(
  callback: TestCallback,
  expectArgument: ts.Expression,
  predicate: (call: ts.CallExpression) => boolean,
): boolean {
  if (ts.isCallExpression(expectArgument)) return predicate(expectArgument);
  if (ts.isIdentifier(expectArgument)) {
    return callbackDeclaresQueryIdentifier(callback, expectArgument.text, predicate);
  }
  return false;
}

function callbackHasSwitchExpectation(callback: TestCallback, matcher: string): boolean {
  return callbackHasCall(callback, (call) => {
    if (
      !ts.isPropertyAccessExpression(call.expression) ||
      call.expression.name.text !== matcher ||
      !ts.isCallExpression(call.expression.expression)
    ) {
      return false;
    }

    const expectCall = call.expression.expression;
    const [expectArgument] = expectCall.arguments;
    return (
      isNamedCall(expectCall, 'expect') &&
      expectArgument !== undefined &&
      expectationTargetsQuery(callback, expectArgument, isSwitchRoleQuery)
    );
  });
}

function isPublishStateOverride(call: ts.CallExpression, property: 'isPublic' | 'loading' | 'updating'): boolean {
  if (
    !ts.isPropertyAccessExpression(call.expression) ||
    !ts.isIdentifier(call.expression.expression) ||
    call.expression.expression.text !== 'mockUseModePublish' ||
    call.expression.name.text !== 'mockReturnValue'
  ) {
    return false;
  }

  return objectHasLiteralProperty(call.arguments[0], property, true);
}

function hasUnpublishedStateContract(callback: TestCallback): boolean {
  return (
    callbackHasCall(callback, (call) =>
      isScreenTextExpectation(call, 'getByText', 'Unpublished', 'toBeInTheDocument'),
    ) && callbackHasCall(callback, (call) => isScreenTextExpectation(call, 'queryByText', 'Published', 'toBeNull'))
  );
}

function hasPublishedStateContract(callback: TestCallback): boolean {
  return (
    callbackHasCall(callback, (call) => isPublishStateOverride(call, 'isPublic')) &&
    callbackHasCall(callback, (call) => isScreenTextExpectation(call, 'getByText', 'Published', 'toBeInTheDocument')) &&
    callbackHasCall(callback, (call) => isScreenTextExpectation(call, 'queryByText', 'Unpublished', 'toBeNull'))
  );
}

function hasLoadingDisabledContract(callback: TestCallback): boolean {
  return (
    callbackHasCall(callback, (call) => isPublishStateOverride(call, 'loading')) &&
    callbackHasSwitchExpectation(callback, 'toBeDisabled') &&
    callbackHasCall(callback, (call) => isScreenTextExpectation(call, 'queryByText', 'Published', 'toBeNull')) &&
    callbackHasCall(callback, (call) => isScreenTextExpectation(call, 'queryByText', 'Unpublished', 'toBeNull'))
  );
}

function hasUpdatingDisabledContract(callback: TestCallback): boolean {
  return (
    callbackHasCall(callback, (call) => isPublishStateOverride(call, 'updating')) &&
    callbackHasSwitchExpectation(callback, 'toBeDisabled')
  );
}

function hasToggleInvocationContract(callback: TestCallback): boolean {
  const hasClick = callbackHasCall(callback, (call) => {
    if (!ts.isPropertyAccessExpression(call.expression) || call.expression.name.text !== 'click') return false;
    const [argument] = call.arguments;
    return argument !== undefined && ts.isCallExpression(argument) && isSwitchRoleQuery(argument);
  });

  const hasToggleAssertion = callbackHasCall(callback, (call) => {
    if (
      !ts.isPropertyAccessExpression(call.expression) ||
      call.expression.name.text !== 'toHaveBeenCalledTimes' ||
      !ts.isCallExpression(call.expression.expression)
    ) {
      return false;
    }

    const expectCall = call.expression.expression;
    const [expectArgument] = expectCall.arguments;
    const [timesArgument] = call.arguments;
    return (
      isNamedCall(expectCall, 'expect') &&
      expectArgument !== undefined &&
      ts.isIdentifier(expectArgument) &&
      expectArgument.text === 'toggleMock' &&
      timesArgument !== undefined &&
      ts.isNumericLiteral(timesArgument) &&
      Number(timesArgument.text) === 1
    );
  });

  return hasClick && hasToggleAssertion;
}

function hasAccessibleStateContract(callback: TestCallback): boolean {
  return callbackHasCall(callback, (call) => {
    if (
      !ts.isPropertyAccessExpression(call.expression) ||
      call.expression.name.text !== 'toHaveAttribute' ||
      !ts.isCallExpression(call.expression.expression)
    ) {
      return false;
    }

    const expectCall = call.expression.expression;
    const [expectArgument] = expectCall.arguments;
    const [attributeArgument, valueArgument] = call.arguments;
    return (
      isNamedCall(expectCall, 'expect') &&
      expectArgument !== undefined &&
      expectationTargetsQuery(callback, expectArgument, isNamedSwitchRoleQuery) &&
      attributeArgument !== undefined &&
      valueArgument !== undefined &&
      ts.isStringLiteralLike(attributeArgument) &&
      attributeArgument.text === 'aria-checked' &&
      ts.isStringLiteralLike(valueArgument) &&
      valueArgument.text === 'false'
    );
  });
}

function sourceHasTestCallback(source: string, predicate: CallbackPredicate): boolean {
  const sourceFile = ts.createSourceFile(
    'mode-publish-switch-owner.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let found = false;

  function visit(node: ts.Node) {
    if (found) return;
    if (
      ts.isCallExpression(node) &&
      hasExpressionRoot(node.expression, RUNNABLE_TEST_IDENTIFIERS) &&
      !isInsideSkippedTestContainer(node) &&
      node.arguments.length >= 2
    ) {
      const callback = node.arguments[1];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && predicate(callback)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

export function hasTc2663UnpublishedStateContract(source: string): boolean {
  return sourceHasTestCallback(source, hasUnpublishedStateContract);
}

export function hasTc2664PublishedStateContract(source: string): boolean {
  return sourceHasTestCallback(source, hasPublishedStateContract);
}

export function hasTc2665LoadingDisabledContract(source: string): boolean {
  return sourceHasTestCallback(source, hasLoadingDisabledContract);
}

export function hasTc2666UpdatingDisabledContract(source: string): boolean {
  return sourceHasTestCallback(source, hasUpdatingDisabledContract);
}

export function hasTc2667ToggleInvocationContract(source: string): boolean {
  return sourceHasTestCallback(source, hasToggleInvocationContract);
}

export function hasTc2668AccessibleStateContract(source: string): boolean {
  return sourceHasTestCallback(source, hasAccessibleStateContract);
}

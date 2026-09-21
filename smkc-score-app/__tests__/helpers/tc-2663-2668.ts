import ts from 'typescript';

type TestCallback = ts.ArrowFunction | ts.FunctionExpression;
type CallbackPredicate = (callback: TestCallback) => boolean;

function isNamedCall(call: ts.CallExpression, name: string): boolean {
  return ts.isIdentifier(call.expression) && call.expression.text === name;
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

function callbackDeclaresSwitchIdentifier(callback: TestCallback, identifier: string): boolean {
  let found = false;

  function visit(node: ts.Node) {
    if (found) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === identifier &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      isSwitchRoleQuery(node.initializer)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(callback.body);
  return found;
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
    if (!isNamedCall(expectCall, 'expect') || !expectArgument) return false;

    if (ts.isCallExpression(expectArgument)) return isSwitchRoleQuery(expectArgument);
    if (ts.isIdentifier(expectArgument)) return callbackDeclaresSwitchIdentifier(callback, expectArgument.text);
    return false;
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
    if (!argument || !ts.isCallExpression(argument) || !isSwitchRoleQuery(argument)) return false;
    return true;
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
  const hasNamedSwitch = callbackHasCall(callback, (call) => {
    if (!isPropertyCall(call, 'screen', 'getByRole')) return false;
    const [roleArgument, optionsArgument] = call.arguments;
    return (
      roleArgument !== undefined &&
      ts.isStringLiteralLike(roleArgument) &&
      roleArgument.text === 'switch' &&
      objectHasLiteralProperty(optionsArgument, 'name', 'Battle Mode publication')
    );
  });

  const hasAriaChecked = callbackHasCall(callback, (call) => {
    if (!ts.isPropertyAccessExpression(call.expression) || call.expression.name.text !== 'toHaveAttribute')
      return false;
    const [attributeArgument, valueArgument] = call.arguments;
    return (
      attributeArgument !== undefined &&
      valueArgument !== undefined &&
      ts.isStringLiteralLike(attributeArgument) &&
      attributeArgument.text === 'aria-checked' &&
      ts.isStringLiteralLike(valueArgument) &&
      valueArgument.text === 'false'
    );
  });

  return hasNamedSwitch && hasAriaChecked;
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
      (isNamedCall(node, 'it') || isNamedCall(node, 'test')) &&
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

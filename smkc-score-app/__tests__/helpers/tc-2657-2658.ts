import ts from 'typescript';

type ExpectedRankValue = number | null;

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

function objectHasStringProperty(node: ts.Node | undefined, property: string, value: string): boolean {
  if (!node || !ts.isObjectLiteralExpression(node)) return false;

  return node.properties.some((entry) => {
    if (!ts.isPropertyAssignment(entry)) return false;
    const name = entry.name;
    const propertyName =
      ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined;
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

function hasRankCellSaveOutcome(source: string, qualificationId: string, expected: ExpectedRankValue): boolean {
  const sourceFile = ts.createSourceFile('rank-cell-owner.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let saveOutcome = false;
  let editorClosed = false;
  let enterKeyDown = false;

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      saveOutcome ||= isSaveOutcomeAssertion(node, qualificationId, expected);
      editorClosed ||= isEditorClosedAssertion(node);
      enterKeyDown ||= isEnterKeyDown(node);
    }

    if (!(saveOutcome && editorClosed && enterKeyDown)) ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return saveOutcome && editorClosed && enterKeyDown;
}

export function hasTc2657EmptyRankClearContract(source: string): boolean {
  return hasRankCellSaveOutcome(source, 'qual-empty', null);
}

export function hasTc2658ZeroRankSaveContract(source: string): boolean {
  return hasRankCellSaveOutcome(source, 'qual-zero', 0);
}

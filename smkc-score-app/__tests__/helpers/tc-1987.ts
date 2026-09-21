import ts from 'typescript';

function isNamedCall(call: ts.CallExpression, name: string): boolean {
  return ts.isIdentifier(call.expression) && call.expression.text === name;
}

function isStringArgument(call: ts.CallExpression, value: string): boolean {
  const [argument] = call.arguments;
  return (
    call.arguments.length === 1 &&
    argument !== undefined &&
    ts.isStringLiteralLike(argument) &&
    argument.text === value
  );
}

export function hasTc1987TvNullAssertion(source: string): boolean {
  const sourceFile = ts.createSourceFile(
    'tc-1987-owner.tsx',
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
      node.arguments.length === 0 &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'toBeNull' &&
      ts.isCallExpression(node.expression.expression)
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

import ts from 'typescript';

function isStringLiteral(node: ts.Node | undefined, value: string): boolean {
  return node !== undefined && ts.isStringLiteralLike(node) && node.text === value;
}

function objectHasStringProperty(node: ts.Node | undefined, propertyName: string, value: string): boolean {
  if (!node || !ts.isObjectLiteralExpression(node)) return false;

  return node.properties.some((property) => {
    if (!ts.isPropertyAssignment(property)) return false;

    const name = property.name;
    const matchesName =
      (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) && name.text === propertyName;

    return matchesName && isStringLiteral(property.initializer, value);
  });
}

function isRoleQuery(node: ts.CallExpression, role: string, accessibleName: string): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (!['getByRole', 'queryByRole', 'findByRole'].includes(node.expression.name.text)) return false;

  const [roleArgument, optionsArgument] = node.arguments;
  return (
    node.arguments.length >= 2 &&
    isStringLiteral(roleArgument, role) &&
    objectHasStringProperty(optionsArgument, 'name', accessibleName)
  );
}

function hasAccessibleButtonQuery(source: string, accessibleName: string): boolean {
  const sourceFile = ts.createSourceFile(
    'rank-cell-owner.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let found = false;

  function visit(node: ts.Node) {
    if (found) return;

    if (ts.isCallExpression(node) && isRoleQuery(node, 'button', accessibleName)) {
      found = true;
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

export function hasRankCellClearAccessibleNameContract(source: string): boolean {
  return hasAccessibleButtonQuery(source, 'Clear rank override');
}

export function hasRankCellSaveAccessibleNameContract(source: string): boolean {
  return hasAccessibleButtonQuery(source, 'Save rank');
}

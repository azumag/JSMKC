import ts from 'typescript';
import { e2eCaseSection, readRepoFile } from '../helpers/e2e-cases';

function routeTestSource() {
  const source = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'app',
    'api',
    'tournaments',
    '[id]',
    'export',
    'route.test.ts',
  );
  return {
    source,
    sourceFile: ts.createSourceFile('route.test.ts', source, ts.ScriptTarget.Latest, true),
  };
}

function findItBody(sourceFile: ts.SourceFile, testName: string) {
  let body: ts.ConciseBody | null = null;

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'it' &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text === testName
    ) {
      const callback = node.arguments[1];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        body = callback.body;
        return;
      }
    }

    if (!body) ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  if (!body) throw new Error(`it block not found: ${testName}`);
  return body;
}

function bodyHasArrayFromLength60(body: ts.Node, sourceFile: ts.SourceFile) {
  let found = false;

  function visit(node: ts.Node) {
    if (found) return;

    if (
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) === 'Array.from' &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      found = node.arguments[0].properties.some((property) =>
        ts.isPropertyAssignment(property) &&
        ts.isIdentifier(property.name) &&
        property.name.text === 'length' &&
        ts.isNumericLiteral(property.initializer) &&
        property.initializer.text === '60',
      );
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(body);
  return found;
}

function isMainHubCellAccess(node: ts.Node, cell: string) {
  if (!ts.isPropertyAccessExpression(node) || node.name.text !== cell) return false;
  const sheetAccess = node.expression;
  return (
    ts.isElementAccessExpression(sheetAccess) &&
    ts.isStringLiteral(sheetAccess.argumentExpression) &&
    sheetAccess.argumentExpression.text === 'Main Hub' &&
    ts.isPropertyAccessExpression(sheetAccess.expression) &&
    sheetAccess.expression.expression.getText() === 'workbook' &&
    sheetAccess.expression.name.text === 'Sheets'
  );
}

function bodyExpectsMainHubCellToBeUndefined(
  body: ts.Node,
  sourceFile: ts.SourceFile,
  cell: string,
) {
  let found = false;

  function visit(node: ts.Node) {
    if (found) return;

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'toBeUndefined' &&
      ts.isCallExpression(node.expression.expression) &&
      ts.isIdentifier(node.expression.expression.expression) &&
      node.expression.expression.expression.text === 'expect'
    ) {
      const [expectArgument] = node.expression.expression.arguments;
      found = Boolean(expectArgument && isMainHubCellAccess(expectArgument, cell));
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(body);
  return found;
}

describe('TC-2088 CDM Main Hub boundary coverage', () => {
  it('documents the exactly-60 Main Hub boundary scenario', () => {
    const section = e2eCaseSection('TC-2088');

    expect(section).toContain('issue #2088/#2193');
    expect(section).toContain('B61');
    expect(section).toContain('B62');
    expect(section).toContain('undefined');
    expect(section).toContain('__tests__/app/api/tournaments/[id]/export/route.test.ts');
    expect(section).toContain('AST');
  });

  it('keeps the unit test asserting B62 stays unwritten at exactly 60 players via AST', () => {
    const { sourceFile } = routeTestSource();
    const body = findItBody(
      sourceFile,
      'should write the Main Hub player rows for exactly 60 players',
    );

    expect(bodyHasArrayFromLength60(body, sourceFile)).toBe(true);
    expect(bodyExpectsMainHubCellToBeUndefined(body, sourceFile, 'B62')).toBe(true);
  });

  it('documents TC-2087 as shared fixture and sentinel consistency coverage', () => {
    const section = e2eCaseSection('TC-2087');
    const routeTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'app',
      'api',
      'tournaments',
      '[id]',
      'export',
      'route.test.ts',
    );

    expect(section).toContain('issue #2087');
    expect(section).toContain('issue #2091');
    expect(section).toContain('makeCdmMainHubPlayer');
    expect(section).toContain('KEEP-OUT-OF-BOUNDS');
    expect(routeTest).toContain('const makeCdmMainHubPlayer = (index: number) => {');
    expect(routeTest).not.toContain('const makePlayer = (index: number) => {');
    expect(routeTest.match(/makeCdmMainHubPlayer\(index\)/g)).toHaveLength(2);
    expect(routeTest).toContain("for (const column of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'])");
    expect(routeTest).not.toContain('KEEP-OUT-BOUNDS');
  });
});

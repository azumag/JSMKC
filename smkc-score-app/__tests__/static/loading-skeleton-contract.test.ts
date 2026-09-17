import ts from 'typescript';

import { readRepoFile } from '../helpers/e2e-cases';

const source = readRepoFile('smkc-score-app', 'src', 'components', 'ui', 'loading-skeleton.tsx');
const sourceFile = ts.createSourceFile('loading-skeleton.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function findFunction(name: string): ts.FunctionDeclaration {
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );

  if (!declaration) {
    throw new Error(`Function ${name} was not found in loading-skeleton.tsx`);
  }

  return declaration;
}

function findReturnedDiv(functionDeclaration: ts.FunctionDeclaration): ts.JsxSelfClosingElement | ts.JsxElement {
  let returnedDiv: ts.JsxSelfClosingElement | ts.JsxElement | undefined;

  function visit(node: ts.Node) {
    if (returnedDiv) return;

    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(sourceFile) === 'div') {
      returnedDiv = node;
      return;
    }

    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(sourceFile) === 'div') {
      returnedDiv = node;
      return;
    }

    ts.forEachChild(node, visit);
  }

  if (functionDeclaration.body) {
    ts.forEachChild(functionDeclaration.body, visit);
  }

  if (!returnedDiv) {
    throw new Error(`No returned div was found in ${functionDeclaration.name?.text ?? 'anonymous function'}`);
  }

  return returnedDiv;
}

function jsxAttributes(element: ts.JsxSelfClosingElement | ts.JsxElement): ts.JsxAttributes {
  return ts.isJsxSelfClosingElement(element) ? element.attributes : element.openingElement.attributes;
}

describe('loading Skeleton semantic contracts', () => {
  it('keeps the qualification title skeleton default at w-48 independent of source quote style', () => {
    const declaration = findFunction('QualificationClientLoadingState');
    const [parameter] = declaration.parameters;

    expect(parameter).toBeDefined();
    expect(ts.isObjectBindingPattern(parameter.name)).toBe(true);
    if (!ts.isObjectBindingPattern(parameter.name)) return;

    const titleSkeletonBinding = parameter.name.elements.find(
      (element) => element.name.getText(sourceFile) === 'titleSkeletonClassName',
    );

    expect(titleSkeletonBinding).toBeDefined();
    expect(titleSkeletonBinding?.initializer && ts.isStringLiteral(titleSkeletonBinding.initializer)).toBe(true);
    if (!titleSkeletonBinding?.initializer || !ts.isStringLiteral(titleSkeletonBinding.initializer)) return;

    expect(titleSkeletonBinding.initializer.text).toBe('w-48');
  });

  it('keeps role and localized aria-label controlled by Skeleton after caller props', () => {
    const declaration = findFunction('Skeleton');
    const attributes = jsxAttributes(findReturnedDiv(declaration)).properties;
    const spreadIndex = attributes.findIndex(
      (attribute) => ts.isJsxSpreadAttribute(attribute) && attribute.expression.getText(sourceFile) === 'props',
    );
    const roleIndex = attributes.findIndex(
      (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === 'role',
    );
    const ariaLabelIndex = attributes.findIndex(
      (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === 'aria-label',
    );

    expect(spreadIndex).toBeGreaterThanOrEqual(0);
    expect(roleIndex).toBeGreaterThan(spreadIndex);
    expect(ariaLabelIndex).toBeGreaterThan(spreadIndex);

    const roleAttribute = attributes[roleIndex];
    expect(roleAttribute && ts.isJsxAttribute(roleAttribute)).toBe(true);
    if (!roleAttribute || !ts.isJsxAttribute(roleAttribute)) return;
    expect(roleAttribute.initializer && ts.isStringLiteral(roleAttribute.initializer)).toBe(true);
    if (!roleAttribute.initializer || !ts.isStringLiteral(roleAttribute.initializer)) return;
    expect(roleAttribute.initializer.text).toBe('status');

    const ariaLabelAttribute = attributes[ariaLabelIndex];
    expect(ariaLabelAttribute && ts.isJsxAttribute(ariaLabelAttribute)).toBe(true);
    if (!ariaLabelAttribute || !ts.isJsxAttribute(ariaLabelAttribute)) return;
    expect(ariaLabelAttribute.initializer && ts.isJsxExpression(ariaLabelAttribute.initializer)).toBe(true);
    if (!ariaLabelAttribute.initializer || !ts.isJsxExpression(ariaLabelAttribute.initializer)) return;

    const expression = ariaLabelAttribute.initializer.expression;
    expect(expression && ts.isCallExpression(expression)).toBe(true);
    if (!expression || !ts.isCallExpression(expression)) return;
    expect(ts.isIdentifier(expression.expression) && expression.expression.text === 't').toBe(true);
    expect(expression.arguments).toHaveLength(1);
    expect(ts.isStringLiteral(expression.arguments[0]) && expression.arguments[0].text === 'ariaLabel').toBe(true);
  });
});

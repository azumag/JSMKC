import { assertStackedCardBoxes } from '../../e2e/lib/layout-assertions';

describe('E2E layout assertions', () => {
  it('accepts stacked card boxes without requiring an exact card count', () => {
    expect(() => {
      assertStackedCardBoxes([
        { y: 10 },
        { y: 80 },
        { y: 150 },
      ], 'readonly cup');
    }).not.toThrow();
  });

  it('throws a count-specific error when there are too few card boxes', () => {
    expect(() => assertStackedCardBoxes([{ y: 10 }], 'readonly cup'))
      .toThrow('expected at least 2 readonly cup cards, got 1');
  });

  it('throws a layout-specific error when boxes are not stacked', () => {
    expect(() => {
      assertStackedCardBoxes([
        { y: 10 },
        { y: 10.5 },
      ], 'readonly cup');
    }).toThrow('readonly cup cards are not stacked on mobile');
  });
});

import {
  hasRankCellClearAccessibleNameContract,
  hasRankCellSaveAccessibleNameContract,
} from './rank-cell-accessible-contract';

describe('RankCell accessible-name drift helper', () => {
  it.each([
    "expect(screen.getByRole('button', { name: 'Clear rank override' })).toBeInTheDocument();",
    'expect(\n  screen.getByRole("button", {\n    name: "Clear rank override",\n  }),\n).toBeInTheDocument();',
    "const clear = screen.queryByRole('button', { name: 'Clear rank override' });",
  ])('accepts formatting-equivalent clear button contracts: %s', (source) => {
    expect(hasRankCellClearAccessibleNameContract(source)).toBe(true);
  });

  it.each([
    "screen.getByRole('button', { name: /✕/ });",
    "screen.getByText('Clear rank override');",
    "screen.getByRole('button', { name: 'Clear rank' });",
    "// screen.getByRole('button', { name: 'Clear rank override' });",
  ])('rejects sources without the clear accessible-name contract: %s', (source) => {
    expect(hasRankCellClearAccessibleNameContract(source)).toBe(false);
  });

  it.each([
    "const saveButton = screen.getByRole('button', { name: 'Save rank' });",
    'const saveButton = screen.findByRole(\n  "button",\n  { name: "Save rank" },\n);',
  ])('accepts formatting-equivalent save button contracts: %s', (source) => {
    expect(hasRankCellSaveAccessibleNameContract(source)).toBe(true);
  });

  it.each([
    "screen.getByRole('button', { name: /✓/ });",
    "screen.getByText('Save rank');",
    "screen.getByRole('button', { name: 'Save' });",
    "// screen.getByRole('button', { name: 'Save rank' });",
  ])('rejects sources without the save accessible-name contract: %s', (source) => {
    expect(hasRankCellSaveAccessibleNameContract(source)).toBe(false);
  });
});

import {
  hasRankCellClearAccessibleNameContract,
  hasRankCellSaveAccessibleNameContract,
} from './rank-cell-accessible-contract';

function asTest(body: string, qualificationId = 'qual-target'): string {
  return `it('contract', async () => {\nrender(<RankCell qualificationId="${qualificationId}" rankOverride={7} />);\n${body}\n});`;
}

describe('RankCell accessible-name drift helper', () => {
  it.each([
    asTest("expect(screen.getByRole('button', { name: 'Clear rank override' })).toBeInTheDocument();"),
    asTest(
      'expect(\n  screen.getByRole("button", {\n    name: "Clear rank override",\n  }),\n).toBeInTheDocument();',
    ),
    asTest("const clear = screen.queryByRole('button', { name: 'Clear rank override' });"),
  ])('accepts formatting-equivalent clear button contracts: %s', (source) => {
    expect(hasRankCellClearAccessibleNameContract(source, 'qual-target')).toBe(true);
  });

  it.each([
    asTest("screen.getByRole('button', { name: /✕/ });"),
    asTest("screen.getByText('Clear rank override');"),
    asTest("screen.getByRole('button', { name: 'Clear rank' });"),
    asTest("// screen.getByRole('button', { name: 'Clear rank override' });"),
    asTest("screen.getByRole('button', { name: 'Clear rank override' });", 'qual-other'),
    "it('contract', () => { screen.getByRole('button', { name: 'Clear rank override' }); });",
  ])('rejects sources without the scenario-scoped clear accessible-name contract: %s', (source) => {
    expect(hasRankCellClearAccessibleNameContract(source, 'qual-target')).toBe(false);
  });

  it.each([
    asTest("const saveButton = screen.getByRole('button', { name: 'Save rank' });"),
    asTest('const saveButton = screen.findByRole(\n  "button",\n  { name: "Save rank" },\n);'),
  ])('accepts formatting-equivalent save button contracts: %s', (source) => {
    expect(hasRankCellSaveAccessibleNameContract(source, 'qual-target')).toBe(true);
  });

  it.each([
    asTest("screen.getByRole('button', { name: /✓/ });"),
    asTest("screen.getByText('Save rank');"),
    asTest("screen.getByRole('button', { name: 'Save' });"),
    asTest("// screen.getByRole('button', { name: 'Save rank' });"),
    asTest("screen.getByRole('button', { name: 'Save rank' });", 'qual-other'),
    "it('contract', () => { screen.getByRole('button', { name: 'Save rank' }); });",
  ])('rejects sources without the scenario-scoped save accessible-name contract: %s', (source) => {
    expect(hasRankCellSaveAccessibleNameContract(source, 'qual-target')).toBe(false);
  });
});

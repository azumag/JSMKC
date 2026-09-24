import {
  hasRankCellClearAccessibleNameContract,
  hasRankCellSaveAccessibleNameContract,
} from './rank-cell-accessible-contract';

function asTest(body: string, testCaseId = 'TC-2648', callee = 'it'): string {
  return `${callee}('${testCaseId}: contract', async () => {\n${body}\n});`;
}

describe('RankCell accessible-name drift helper', () => {
  it.each([
    asTest("expect(screen.getByRole('button', { name: 'Clear rank override' })).toBeInTheDocument();"),
    asTest('expect(\n  screen.getByRole("button", {\n    name: "Clear rank override",\n  }),\n).toBeInTheDocument();'),
    asTest("const clear = screen.queryByRole('button', { name: 'Clear rank override' });"),
    asTest("screen.getByRole('button', { name: 'Clear rank override' });", 'TC-2648', 'it.only'),
    "test.each([1])('TC-2648: contract', () => { screen.getByRole('button', { name: 'Clear rank override' }); });",
    asTest("await act(async () => { screen.getByRole('button', { name: 'Clear rank override' }); });"),
  ])('accepts formatting-equivalent runnable clear button contracts: %s', (source) => {
    expect(hasRankCellClearAccessibleNameContract(source, 'TC-2648')).toBe(true);
  });

  it.each([
    asTest("screen.getByRole('button', { name: /✕/ });"),
    asTest("screen.getByText('Clear rank override');"),
    asTest("screen.getByRole('button', { name: 'Clear rank' });"),
    asTest("driver.getByRole('button', { name: 'Clear rank override' });"),
    asTest("// screen.getByRole('button', { name: 'Clear rank override' });"),
    asTest("screen.getByRole('button', { name: 'Clear rank override' });", 'TC-2647'),
    "it('unscoped contract', () => { screen.getByRole('button', { name: 'Clear rank override' }); });",
    asTest("function unused() { screen.getByRole('button', { name: 'Clear rank override' }); }"),
    asTest("const unused = () => screen.getByRole('button', { name: 'Clear rank override' });"),
    asTest("screen.getByRole('button', { name: 'Clear rank override' });", 'TC-2648', 'it.skip'),
    asTest("screen.getByRole('button', { name: 'Clear rank override' });", 'TC-2648', 'it.todo'),
    asTest("screen.getByRole('button', { name: 'Clear rank override' });", 'TC-2648', 'xit'),
    "test.each([1]).skip('TC-2648: contract', () => { screen.getByRole('button', { name: 'Clear rank override' }); });",
    "describe.skip('suite', () => { it('TC-2648: contract', () => { screen.getByRole('button', { name: 'Clear rank override' }); }); });",
    "xdescribe('suite', () => { test('TC-2648: contract', () => { screen.getByRole('button', { name: 'Clear rank override' }); }); });",
  ])('rejects sources without a runnable scenario-scoped clear accessible-name contract: %s', (source) => {
    expect(hasRankCellClearAccessibleNameContract(source, 'TC-2648')).toBe(false);
  });

  it.each([
    asTest("const saveButton = screen.getByRole('button', { name: 'Save rank' });", 'TC-2650'),
    asTest('const saveButton = screen.findByRole(\n  "button",\n  { name: "Save rank" },\n);', 'TC-2650'),
    asTest("screen.getByRole('button', { name: 'Save rank' });", 'TC-2650', 'test.only'),
    "it.each([1])('TC-2650: contract', () => { screen.getByRole('button', { name: 'Save rank' }); });",
    asTest("await waitFor(() => { screen.getByRole('button', { name: 'Save rank' }); });", 'TC-2650'),
  ])('accepts formatting-equivalent runnable save button contracts: %s', (source) => {
    expect(hasRankCellSaveAccessibleNameContract(source, 'TC-2650')).toBe(true);
  });

  it.each([
    asTest("screen.getByRole('button', { name: /✓/ });", 'TC-2650'),
    asTest("screen.getByText('Save rank');", 'TC-2650'),
    asTest("screen.getByRole('button', { name: 'Save' });", 'TC-2650'),
    asTest("driver.getByRole('button', { name: 'Save rank' });", 'TC-2650'),
    asTest("// screen.getByRole('button', { name: 'Save rank' });", 'TC-2650'),
    asTest("screen.getByRole('button', { name: 'Save rank' });", 'TC-2647'),
    "test('unscoped contract', () => { screen.getByRole('button', { name: 'Save rank' }); });",
    asTest("function unused() { screen.getByRole('button', { name: 'Save rank' }); }", 'TC-2650'),
    asTest("screen.getByRole('button', { name: 'Save rank' });", 'TC-2650', 'test.skip'),
    asTest("screen.getByRole('button', { name: 'Save rank' });", 'TC-2650', 'test.todo'),
    asTest("screen.getByRole('button', { name: 'Save rank' });", 'TC-2650', 'xtest'),
    "describe.skip('suite', () => { it('TC-2650: contract', () => { screen.getByRole('button', { name: 'Save rank' }); }); });",
  ])('rejects sources without a runnable scenario-scoped save accessible-name contract: %s', (source) => {
    expect(hasRankCellSaveAccessibleNameContract(source, 'TC-2650')).toBe(false);
  });
});

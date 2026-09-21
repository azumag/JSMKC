import { readRepoFile } from './e2e-cases';
import { hasTc2657EmptyRankClearContract, hasTc2658ZeroRankSaveContract } from './tc-2657-2658';

const editorClosed = `expect(screen.queryByRole('spinbutton', { name: 'Rank override' })).toBeNull();`;
const enterKeyDown = `fireEvent.keyDown(input, { key: 'Enter' });`;

describe('TC-2657 / TC-2658 RankCell drift matchers', () => {
  const owner = readRepoFile('smkc-score-app', '__tests__', 'components', 'tournament', 'rank-cell.test.tsx');

  it('recognizes the current TC-2657 executable contract', () => {
    expect(hasTc2657EmptyRankClearContract(owner)).toBe(true);
  });

  it('recognizes the current TC-2658 executable contract', () => {
    expect(hasTc2658ZeroRankSaveContract(owner)).toBe(true);
  });

  it.each([
    `${enterKeyDown}\nexpect(noop).toHaveBeenCalledWith('qual-empty', null);\n${editorClosed}`,
    `fireEvent.keyDown(\n  input,\n  { key: "Enter" },\n);\nexpect(noop).toHaveBeenCalledWith(\n  "qual-empty",\n  null,\n);\nexpect(\n  screen.queryByRole("spinbutton", { name: "Rank override" }),\n).toBeNull();`,
  ])('accepts equivalent TC-2657 formatting: %s', (source) => {
    expect(hasTc2657EmptyRankClearContract(source)).toBe(true);
  });

  it.each([
    `${enterKeyDown}\nexpect(noop).toHaveBeenCalledWith('qual-zero', 0);\n${editorClosed}`,
    `fireEvent.keyDown(input, { key: "Enter" });\nexpect(noop).toHaveBeenCalledWith("qual-zero", 0);\n${editorClosed}`,
  ])('accepts equivalent TC-2658 formatting: %s', (source) => {
    expect(hasTc2658ZeroRankSaveContract(source)).toBe(true);
  });

  it.each([
    `${enterKeyDown}\nexpect(noop).toHaveBeenCalledWith('qual-empty', 0);\n${editorClosed}`,
    `expect(noop).toHaveBeenCalledWith('qual-empty', null);\n${editorClosed}`,
    `${enterKeyDown}\nexpect(noop).toHaveBeenCalledWith('qual-empty', null);`,
    `// ${enterKeyDown}\n// expect(noop).toHaveBeenCalledWith('qual-empty', null);\n// ${editorClosed}`,
  ])('rejects source without the TC-2657 observable contract: %s', (source) => {
    expect(hasTc2657EmptyRankClearContract(source)).toBe(false);
  });

  it.each([
    `${enterKeyDown}\nexpect(noop).toHaveBeenCalledWith('qual-zero', null);\n${editorClosed}`,
    `${enterKeyDown}\nexpect(noop).toHaveBeenCalledWith('qual-other', 0);\n${editorClosed}`,
    `expect(noop).toHaveBeenCalledWith('qual-zero', 0);\n${editorClosed}`,
    `// ${enterKeyDown}\n// expect(noop).toHaveBeenCalledWith('qual-zero', 0);\n// ${editorClosed}`,
  ])('rejects source without the TC-2658 observable contract: %s', (source) => {
    expect(hasTc2658ZeroRankSaveContract(source)).toBe(false);
  });
});

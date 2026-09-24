import { readRepoFile } from './e2e-cases';
import { hasTc2657EmptyRankClearContract, hasTc2658ZeroRankSaveContract } from './tc-2657-2658';

const editorClosed = `expect(screen.queryByRole('spinbutton', { name: 'Rank override' })).toBeNull();`;
const enterKeyDown = `fireEvent.keyDown(input, { key: 'Enter' });`;
const asTest = (body: string) => `it('contract', async () => {\n${body}\n});`;

describe('TC-2657 / TC-2658 RankCell drift matchers', () => {
  const owner = readRepoFile('smkc-score-app', '__tests__', 'components', 'tournament', 'rank-cell.test.tsx');

  it('recognizes the current TC-2657 executable contract', () => {
    expect(hasTc2657EmptyRankClearContract(owner)).toBe(true);
  });

  it('recognizes the current TC-2658 executable contract', () => {
    expect(hasTc2658ZeroRankSaveContract(owner)).toBe(true);
  });

  it.each([
    asTest(`${enterKeyDown}\nexpect(noop).toHaveBeenCalledWith('qual-empty', null);\n${editorClosed}`),
    `test("contract", async function () {\nfireEvent.keyDown(\n  input,\n  { key: "Enter" },\n);\nexpect(noop).toHaveBeenCalledWith(\n  "qual-empty",\n  null,\n);\nexpect(\n  screen.queryByRole("spinbutton", { name: "Rank override" }),\n).toBeNull();\n});`,
    `it.only('contract', async () => {\n${enterKeyDown}\nexpect(noop).toHaveBeenCalledWith('qual-empty', null);\n${editorClosed}\n});`,
    asTest(
      `await act(async () => { ${enterKeyDown} });\nexpect(noop).toHaveBeenCalledWith('qual-empty', null);\n${editorClosed}`,
    ),
  ])('accepts equivalent TC-2657 formatting: %s', (source) => {
    expect(hasTc2657EmptyRankClearContract(source)).toBe(true);
  });

  it.each([
    asTest(`${enterKeyDown}\nexpect(noop).toHaveBeenCalledWith('qual-zero', 0);\n${editorClosed}`),
    asTest(
      `fireEvent.keyDown(input, { key: "Enter" });\nexpect(noop).toHaveBeenCalledWith("qual-zero", 0);\n${editorClosed}`,
    ),
    `test.each([[1]])('contract', async () => {\n${enterKeyDown}\nexpect(noop).toHaveBeenCalledWith('qual-zero', 0);\n${editorClosed}\n});`,
    asTest(
      `await act(async () => { ${enterKeyDown} });\nexpect(noop).toHaveBeenCalledWith('qual-zero', 0);\n${editorClosed}`,
    ),
  ])('accepts equivalent TC-2658 formatting: %s', (source) => {
    expect(hasTc2658ZeroRankSaveContract(source)).toBe(true);
  });

  it.each([
    asTest(`${enterKeyDown}\nexpect(noop).toHaveBeenCalledWith('qual-empty', 0);\n${editorClosed}`),
    asTest(`expect(noop).toHaveBeenCalledWith('qual-empty', null);\n${editorClosed}`),
    asTest(`${enterKeyDown}\nexpect(noop).toHaveBeenCalledWith('qual-empty', null);`),
    asTest(`// ${enterKeyDown}\n// expect(noop).toHaveBeenCalledWith('qual-empty', null);\n// ${editorClosed}`),
    `${asTest(enterKeyDown)}\n${asTest(`expect(noop).toHaveBeenCalledWith('qual-empty', null);\n${editorClosed}`)}`,
    asTest(
      `${enterKeyDown}\nconst unusedHelper = () => {\nexpect(noop).toHaveBeenCalledWith('qual-empty', null);\n${editorClosed}\n};`,
    ),
    `it.skip('contract', async () => {\n${enterKeyDown}\nexpect(noop).toHaveBeenCalledWith('qual-empty', null);\n${editorClosed}\n});`,
    `describe.skip('suite', () => {\n${asTest(
      `${enterKeyDown}\nexpect(noop).toHaveBeenCalledWith('qual-empty', null);\n${editorClosed}`,
    )}\n});`,
  ])('rejects source without one runnable TC-2657 test owning the whole contract: %s', (source) => {
    expect(hasTc2657EmptyRankClearContract(source)).toBe(false);
  });

  it.each([
    asTest(`${enterKeyDown}\nexpect(noop).toHaveBeenCalledWith('qual-zero', null);\n${editorClosed}`),
    asTest(`${enterKeyDown}\nexpect(noop).toHaveBeenCalledWith('qual-other', 0);\n${editorClosed}`),
    asTest(`expect(noop).toHaveBeenCalledWith('qual-zero', 0);\n${editorClosed}`),
    asTest(`// ${enterKeyDown}\n// expect(noop).toHaveBeenCalledWith('qual-zero', 0);\n// ${editorClosed}`),
    `${asTest(enterKeyDown)}\n${asTest(`expect(noop).toHaveBeenCalledWith('qual-zero', 0);\n${editorClosed}`)}`,
    asTest(
      `${enterKeyDown}\nfunction unusedHelper() {\nexpect(noop).toHaveBeenCalledWith('qual-zero', 0);\n${editorClosed}\n}`,
    ),
    `test.each([[1]]).skip('contract', async () => {\n${enterKeyDown}\nexpect(noop).toHaveBeenCalledWith('qual-zero', 0);\n${editorClosed}\n});`,
  ])('rejects source without one runnable TC-2658 test owning the whole contract: %s', (source) => {
    expect(hasTc2658ZeroRankSaveContract(source)).toBe(false);
  });
});

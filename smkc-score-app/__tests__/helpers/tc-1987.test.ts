import { readRepoFile } from './e2e-cases';
import { hasTc1987TvNullAssertion } from './tc-1987';

describe('TC-1987 TV parser drift matcher', () => {
  it('recognizes the current executable owner assertion', () => {
    const owner = readRepoFile('smkc-score-app', '__tests__', 'lib', 'ta', 'time-entry-layout.test.ts');

    expect(hasTc1987TvNullAssertion(owner)).toBe(true);
  });

  it.each([
    `it('keeps coverage executable', () => { expect(parseTvNumberInput('abc')).toBeNull(); });`,
    'test("keeps coverage executable", () => { expect(parseTvNumberInput("abc")).toBeNull(); });',
    `it(
      'keeps coverage executable',
      () => {
        expect(
          parseTvNumberInput(
            'abc',
          ),
        ).toBeNull();
      },
    );`,
    `it.only('keeps coverage executable', () => { expect(parseTvNumberInput('abc')).toBeNull(); });`,
    `test.only('keeps coverage executable', () => { expect(parseTvNumberInput('abc')).toBeNull(); });`,
    `test.each([[1]])('keeps coverage executable', () => { expect(parseTvNumberInput('abc')).toBeNull(); });`,
    `it('keeps coverage executable', function () { expect(parseTvNumberInput('abc')).toBeNull(); });`,
  ])('accepts equivalent executable formatting: %s', (source) => {
    expect(hasTc1987TvNullAssertion(source)).toBe(true);
  });

  it.each([
    `it('wrong input', () => { expect(parseTvNumberInput('def')).toBeNull(); });`,
    `it('wrong expectation', () => { expect(parseTvNumberInput('abc')).toBe(0); });`,
    `it('missing expectation', () => { parseTvNumberInput('abc'); });`,
    `it('comment only', () => { // expect(parseTvNumberInput('abc')).toBeNull();
    });`,
  ])('rejects a source without the TC-1987 contract: %s', (source) => {
    expect(hasTc1987TvNullAssertion(source)).toBe(false);
  });

  it.each([
    `expect(parseTvNumberInput('abc')).toBeNull();`,
    `function unusedHelper() { expect(parseTvNumberInput('abc')).toBeNull(); }`,
    `const unusedHelper = () => { expect(parseTvNumberInput('abc')).toBeNull(); };`,
    `it(expect(parseTvNumberInput('abc')).toBeNull(), () => {});`,
    `it('outer test', () => { function unusedHelper() { expect(parseTvNumberInput('abc')).toBeNull(); } });`,
    `it('outer test', () => { const unusedHelper = () => { expect(parseTvNumberInput('abc')).toBeNull(); }; });`,
  ])('rejects an assertion without runnable test callback ownership: %s', (source) => {
    expect(hasTc1987TvNullAssertion(source)).toBe(false);
  });

  it.each([
    `it.skip('skipped', () => { expect(parseTvNumberInput('abc')).toBeNull(); });`,
    `test.skip('skipped', () => { expect(parseTvNumberInput('abc')).toBeNull(); });`,
    `describe.skip('skipped suite', () => { it('nested', () => { expect(parseTvNumberInput('abc')).toBeNull(); }); });`,
    `xit('skipped', () => { expect(parseTvNumberInput('abc')).toBeNull(); });`,
    `xtest('skipped', () => { expect(parseTvNumberInput('abc')).toBeNull(); });`,
    `xdescribe('skipped suite', () => { it('nested', () => { expect(parseTvNumberInput('abc')).toBeNull(); }); });`,
    `it.todo('not executable', () => { expect(parseTvNumberInput('abc')).toBeNull(); });`,
    `it.skip.each([[1]])('skipped parameterized', () => { expect(parseTvNumberInput('abc')).toBeNull(); });`,
    `test.each([[1]]).skip('skipped parameterized', () => { expect(parseTvNumberInput('abc')).toBeNull(); });`,
    `xit.each([[1]])('skipped parameterized', () => { expect(parseTvNumberInput('abc')).toBeNull(); });`,
  ])('rejects TC-1987 assertions inside skipped test containers: %s', (source) => {
    expect(hasTc1987TvNullAssertion(source)).toBe(false);
  });
});

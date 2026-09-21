import { readRepoFile } from './e2e-cases';
import { hasTc1987TvNullAssertion } from './tc-1987';

describe('TC-1987 TV parser drift matcher', () => {
  it('recognizes the current executable owner assertion', () => {
    const owner = readRepoFile('smkc-score-app', '__tests__', 'lib', 'ta', 'time-entry-layout.test.ts');

    expect(hasTc1987TvNullAssertion(owner)).toBe(true);
  });

  it.each([
    `expect(parseTvNumberInput('abc')).toBeNull();`,
    'expect(parseTvNumberInput("abc")).toBeNull();',
    `expect(\n  parseTvNumberInput(\n    'abc',\n  ),\n).toBeNull();`,
  ])('accepts equivalent formatting: %s', (source) => {
    expect(hasTc1987TvNullAssertion(source)).toBe(true);
  });

  it.each([
    `expect(parseTvNumberInput('def')).toBeNull();`,
    `expect(parseTvNumberInput('abc')).toBe(0);`,
    `parseTvNumberInput('abc');`,
  ])('rejects a source without the TC-1987 contract: %s', (source) => {
    expect(hasTc1987TvNullAssertion(source)).toBe(false);
  });
});

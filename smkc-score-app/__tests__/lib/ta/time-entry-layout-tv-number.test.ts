import { parseTvNumberInput } from '@/lib/ta/time-entry-layout';

describe('parseTvNumberInput', () => {
  it('accepts complete signed decimal safe integers while preserving legacy normalization', () => {
    expect(parseTvNumberInput('3')).toBe(3);
    expect(parseTvNumberInput('09')).toBe(9);
    expect(parseTvNumberInput(' 3 ')).toBe(3);
    expect(parseTvNumberInput('-1')).toBe(-1);
    expect(parseTvNumberInput('+2')).toBe(2);
  });

  it('rejects empty, partial, non-integer, and unsafe values', () => {
    expect(parseTvNumberInput('')).toBeNull();
    expect(parseTvNumberInput('abc')).toBeNull();
    expect(parseTvNumberInput('3abc')).toBeNull();
    expect(parseTvNumberInput('1.5')).toBeNull();
    expect(parseTvNumberInput('1e2')).toBeNull();
    expect(parseTvNumberInput('9007199254740992')).toBeNull();
  });
});

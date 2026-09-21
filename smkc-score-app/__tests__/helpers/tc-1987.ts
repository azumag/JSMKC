const tvNullAssertionPattern =
  /expect\s*\(\s*parseTvNumberInput\s*\(\s*(['"])abc\1\s*\)\s*\)\s*\.toBeNull\s*\(\s*\)\s*;/;

export function hasTc1987TvNullAssertion(source: string): boolean {
  return tvNullAssertionPattern.test(source);
}

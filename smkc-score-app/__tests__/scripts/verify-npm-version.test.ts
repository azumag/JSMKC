import { isExpectedNpmVersion, parsePinnedNpmVersion } from '../../scripts/verify-npm-version.js';

describe('npm runtime version guard', () => {
  it('parses an exact npm packageManager pin', () => {
    expect(parsePinnedNpmVersion('npm@10.9.4')).toBe('10.9.4');
    expect(parsePinnedNpmVersion('  npm@10.9.4  ')).toBe('10.9.4');
  });

  it.each([
    undefined,
    null,
    '',
    'pnpm@10.9.4',
    'npm@10',
    'npm@^10.9.4',
    'npm@10.9.4-beta.1',
    'npm@10.9.4+sha512.deadbeef',
  ])('rejects a non-exact npm packageManager declaration: %p', (packageManager) => {
    expect(parsePinnedNpmVersion(packageManager)).toBeNull();
  });

  it('accepts only the runtime npm version pinned by packageManager', () => {
    expect(isExpectedNpmVersion('npm@10.9.4', '10.9.4')).toBe(true);
    expect(isExpectedNpmVersion('npm@10.9.4', '10.9.4\n')).toBe(true);
    expect(isExpectedNpmVersion('npm@10.9.4', '10.9.5')).toBe(false);
    expect(isExpectedNpmVersion('npm@10.9.4', '11.0.0')).toBe(false);
  });

  it('fails closed when packageManager is not an exact npm pin', () => {
    expect(isExpectedNpmVersion('npm@^10.9.4', '10.9.4')).toBe(false);
    expect(isExpectedNpmVersion('pnpm@10.9.4', '10.9.4')).toBe(false);
  });
});

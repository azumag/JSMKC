import { isExpectedNpmVersion, parsePinnedNpmVersion, verifyNpmRuntime } from '../../scripts/verify-npm-version.js';

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

  it('verifies the runtime through injectable package and process readers', () => {
    expect(
      verifyNpmRuntime({
        readPackageJson: () => JSON.stringify({ packageManager: 'npm@10.9.4' }),
        runNpmVersion: () => ({ status: 0, signal: null, stdout: '10.9.4\n', stderr: '' }),
      }),
    ).toBe('10.9.4');
  });

  it('fails closed before audit work when the runtime version drifts', () => {
    expect(() =>
      verifyNpmRuntime({
        readPackageJson: () => JSON.stringify({ packageManager: 'npm@10.9.4' }),
        runNpmVersion: () => ({ status: 0, signal: null, stdout: '11.0.0\n', stderr: '' }),
      }),
    ).toThrow('npm runtime version mismatch: expected 10.9.4, received 11.0.0');
  });

  it('fails closed when npm --version cannot be executed successfully', () => {
    expect(() =>
      verifyNpmRuntime({
        readPackageJson: () => JSON.stringify({ packageManager: 'npm@10.9.4' }),
        runNpmVersion: () => ({ status: 2, signal: null, stdout: '10.9.4\n', stderr: 'runtime failure' }),
      }),
    ).toThrow('npm --version exited with status 2: runtime failure');
  });
});

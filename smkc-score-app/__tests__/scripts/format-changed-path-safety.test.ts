import path from 'path';
import { assertSafeChangedFiles } from '../../scripts/format-changed-path-safety.cjs';

describe('changed formatting path safety', () => {
  const appRoot = path.resolve('/repo/smkc-score-app');

  it('accepts regular files and preserves the original changed-file list', () => {
    const changedFiles = ['src/example.ts', 'docs/a file.md'];
    const lstatSync = jest.fn(() => ({ isFile: () => true }));

    expect(assertSafeChangedFiles(changedFiles, appRoot, lstatSync)).toBe(changedFiles);
    expect(lstatSync).toHaveBeenNthCalledWith(1, path.resolve(appRoot, 'src/example.ts'));
    expect(lstatSync).toHaveBeenNthCalledWith(2, path.resolve(appRoot, 'docs/a file.md'));
  });

  it('rejects symlinks and other non-regular paths before Prettier runs', () => {
    const lstatSync = jest.fn(() => ({ isFile: () => false }));

    expect(() => assertSafeChangedFiles(['src/link.ts'], appRoot, lstatSync)).toThrow(
      'Changed formatting path must be a regular file: src/link.ts',
    );
  });

  it('fails closed when a changed path disappears before inspection', () => {
    const lstatSync = jest.fn(() => {
      throw new Error('ENOENT');
    });

    expect(() => assertSafeChangedFiles(['src/missing.ts'], appRoot, lstatSync)).toThrow(
      'Unable to inspect changed formatting path: src/missing.ts',
    );
  });

  it('rejects a path escaping the app root without inspecting it', () => {
    const lstatSync = jest.fn();

    expect(() => assertSafeChangedFiles(['../outside.ts'], appRoot, lstatSync)).toThrow(
      'Changed formatting path escapes the app root: ../outside.ts',
    );
    expect(lstatSync).not.toHaveBeenCalled();
  });
});

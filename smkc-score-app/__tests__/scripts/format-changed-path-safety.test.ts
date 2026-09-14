import path from 'path';
import { assertSafeChangedFiles } from '../../scripts/format-changed-path-safety.cjs';

describe('changed formatting path safety', () => {
  const appRoot = path.resolve('/repo/smkc-score-app');
  const realpathSync = jest.fn((file: string) => path.resolve(file));

  beforeEach(() => {
    realpathSync.mockClear();
  });

  it('accepts regular files and preserves safe path spelling', () => {
    const changedFiles = ['src/example.ts', 'docs/a file.md', '--write.ts', 'src/日本 語.ts'];
    const lstatSync = jest.fn(() => ({ isFile: () => true }));

    expect(assertSafeChangedFiles(changedFiles, appRoot, lstatSync, realpathSync)).toBe(changedFiles);
    expect(lstatSync).toHaveBeenNthCalledWith(1, path.resolve(appRoot, 'src/example.ts'));
    expect(lstatSync).toHaveBeenNthCalledWith(2, path.resolve(appRoot, 'docs/a file.md'));
  });

  it('rejects symlinks and other non-regular paths before Prettier runs', () => {
    const lstatSync = jest.fn(() => ({ isFile: () => false }));

    expect(() => assertSafeChangedFiles(['src/link.ts'], appRoot, lstatSync, realpathSync)).toThrow(
      'Changed formatting path must be a regular file: src/link.ts',
    );
  });

  it('fails closed when a changed path disappears before inspection', () => {
    const lstatSync = jest.fn(() => {
      throw new Error('ENOENT');
    });

    expect(() => assertSafeChangedFiles(['src/missing.ts'], appRoot, lstatSync, realpathSync)).toThrow(
      'Unable to inspect changed formatting path: src/missing.ts',
    );
  });

  it('rejects a path escaping the app root without inspecting it', () => {
    const lstatSync = jest.fn();

    expect(() => assertSafeChangedFiles(['../outside.ts'], appRoot, lstatSync, realpathSync)).toThrow(
      'Changed formatting path escapes the app root: ../outside.ts',
    );
    expect(lstatSync).not.toHaveBeenCalled();
  });

  it('rejects a regular file reached through a symlinked parent directory', () => {
    const lstatSync = jest.fn(() => ({ isFile: () => true }));
    const resolveRealPath = jest.fn((file: string) => {
      if (file === appRoot) return appRoot;
      return path.resolve('/outside/example.ts');
    });

    expect(() => assertSafeChangedFiles(['linked/example.ts'], appRoot, lstatSync, resolveRealPath)).toThrow(
      'Changed formatting path resolves outside the app root: linked/example.ts',
    );
  });

  it.each([
    ['newline', 'src/bad\n::warning::message.ts'],
    ['tab', 'src/bad\tname.ts'],
    ['escape', 'src/bad\u001b[31m.ts'],
    ['delete', 'src/bad\u007fname.ts'],
  ])('rejects %s control characters without echoing the unsafe path', (_label, unsafePath) => {
    const lstatSync = jest.fn();

    expect(() => assertSafeChangedFiles([unsafePath], appRoot, lstatSync, realpathSync)).toThrow(
      'Changed formatting path contains a control character.',
    );
    expect(lstatSync).not.toHaveBeenCalled();
  });
});

import {
  buildGitErrorMessage,
  collectChangedAppFiles,
  findGitStderr,
  resolveBaseRevision,
  resolveComparisonBase,
} from '../../scripts/format-changed-utils.cjs';

describe('format-changed utilities', () => {
  describe('resolveBaseRevision', () => {
    it('uses a non-zero environment SHA without invoking git fallbacks', () => {
      const resolveMergeBase = jest.fn();
      const resolveParent = jest.fn();

      expect(resolveBaseRevision('abc123', resolveMergeBase, resolveParent)).toBe('abc123');
      expect(resolveMergeBase).not.toHaveBeenCalled();
      expect(resolveParent).not.toHaveBeenCalled();
    });

    it('uses HEAD^ for an all-zero push SHA', () => {
      const resolveMergeBase = jest.fn();
      const resolveParent = jest.fn(() => 'parent123');

      expect(resolveBaseRevision('0000000000000000', resolveMergeBase, resolveParent)).toBe('parent123');
      expect(resolveMergeBase).not.toHaveBeenCalled();
      expect(resolveParent).toHaveBeenCalledTimes(1);
    });

    it('falls back to HEAD^ when the local origin/main merge-base is unavailable', () => {
      const resolveMergeBase = jest.fn(() => {
        throw new Error('missing origin/main');
      });
      const resolveParent = jest.fn(() => 'parent123');

      expect(resolveBaseRevision(undefined, resolveMergeBase, resolveParent)).toBe('parent123');
    });
  });

  it('reports the requested SHA when merge-base resolution fails', () => {
    expect(() =>
      resolveComparisonBase('missing-sha', 'head-sha', () => {
        throw new Error('bad revision');
      }),
    ).toThrow('Unable to resolve formatting base revision: missing-sha');
  });

  it('filters app files, supported extensions, empty entries, and duplicates', () => {
    const diffOutput = [
      'smkc-score-app/src/a.ts',
      'smkc-score-app/src/a.ts',
      'smkc-score-app/src/styles.css',
      'smkc-score-app/image.png',
      '.github/workflows/ci.yml',
      '',
    ].join('\0');

    expect(collectChangedAppFiles(diffOutput, '', false, 'smkc-score-app/')).toEqual(['src/a.ts', 'src/styles.css']);
  });

  it('includes untracked files only for local checks', () => {
    const untrackedOutput = 'smkc-score-app/src/new.tsx\0';

    expect(collectChangedAppFiles('', untrackedOutput, true, 'smkc-score-app/')).toEqual(['src/new.tsx']);
    expect(collectChangedAppFiles('', untrackedOutput, false, 'smkc-score-app/')).toEqual([]);
  });

  it('returns an empty list when no supported app files changed', () => {
    expect(collectChangedAppFiles('docs/readme.txt\0', '', false, 'smkc-score-app/')).toEqual([]);
  });

  it('extracts git stderr through a wrapped error cause', () => {
    const gitError = Object.assign(new Error('git failed'), {
      stderr: Buffer.from('fatal: bad revision\n'),
    });
    const wrapped = new Error('wrapped', { cause: gitError });

    expect(findGitStderr(wrapped)).toBe('fatal: bad revision');
    expect(buildGitErrorMessage('Unable to list changed files.', wrapped)).toBe(
      'Unable to list changed files.\nfatal: bad revision',
    );
  });

  it('keeps the operation-specific context when git provides no stderr', () => {
    expect(buildGitErrorMessage('Unable to list untracked files.', new Error('failure'))).toBe(
      'Unable to list untracked files.',
    );
  });
});

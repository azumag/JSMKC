import fs from 'fs';
import path from 'path';

function readAppFile(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
}

function countOccurrences(source: string, needle: string) {
  return source.split(needle).length - 1;
}

describe('qualification raw HTTP error debt guard (issue #3842)', () => {
  const bm = readAppFile('src', 'app', 'tournaments', '[id]', 'bm', 'page-client.tsx');
  const mr = readAppFile('src', 'app', 'tournaments', '[id]', 'mr', 'page-client.tsx');
  const gp = readAppFile('src', 'app', 'tournaments', '[id]', 'gp', 'page-client.tsx');
  const ta = readAppFile('src', 'app', 'tournaments', '[id]', 'ta', 'page-client.tsx');

  it.each([
    ['bm', bm, 'alert'],
    ['mr', mr, 'toast.error'],
  ] as const)('%s keeps raw bracket error debt bounded to reset/generate only', (_mode, source, notifier) => {
    expect(countOccurrences(source, `${notifier}(err.error || tc('failedResetBracket'));`)).toBe(1);
    expect(countOccurrences(source, `${notifier}(err.error || tc('failedGenerateBracket'));`)).toBe(1);
  });

  it('keeps the already-migrated GP bracket path fail-closed', () => {
    expect(gp).not.toContain("err.error || tc('failedResetBracket')");
    expect(gp).not.toContain("err.error || tc('failedGenerateBracket')");
  });

  it('keeps migrated BM/MR/GP qualification mutations free of the old raw network-error fallback', () => {
    for (const source of [bm, mr, gp]) {
      expect(source).not.toContain("errorData.error || tc('networkError')");
    }
  });

  it('bounds the remaining TA page-local raw-error debt to the currently tracked fallback shapes', () => {
    expect(ta).toContain("errorData.error || tc('networkError')");
    expect(ta).toContain("payload.error || tc('networkError')");
    expect(ta).toContain("json.error || tc('networkError')");
  });
});

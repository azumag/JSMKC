import fs from 'fs';
import path from 'path';

function readAppFile(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
}

describe('qualification raw HTTP error guard (issue #3842)', () => {
  const bm = readAppFile('src', 'app', 'tournaments', '[id]', 'bm', 'page-client.tsx');
  const mr = readAppFile('src', 'app', 'tournaments', '[id]', 'mr', 'page-client.tsx');
  const gp = readAppFile('src', 'app', 'tournaments', '[id]', 'gp', 'page-client.tsx');
  const ta = readAppFile('src', 'app', 'tournaments', '[id]', 'ta', 'page-client.tsx');

  it('keeps BM/MR/GP bracket paths fail-closed', () => {
    for (const source of [bm, mr, gp]) {
      expect(source).not.toContain("err.error || tc('failedResetBracket')");
      expect(source).not.toContain("err.error || tc('failedGenerateBracket')");
    }
  });

  it('keeps BM/MR/GP qualification mutations free of the old raw network-error fallback', () => {
    for (const source of [bm, mr, gp]) {
      expect(source).not.toContain("errorData.error || tc('networkError')");
    }
  });

  it('keeps TA page-local qualification paths free of tracked raw network-error fallbacks', () => {
    expect(ta).not.toContain("errorData.error || tc('networkError')");
    expect(ta).not.toContain("payload.error || tc('networkError')");
    expect(ta).not.toContain("json.error || tc('networkError')");
    expect(ta).not.toContain('throw new Error(errorData.error)');
  });
});

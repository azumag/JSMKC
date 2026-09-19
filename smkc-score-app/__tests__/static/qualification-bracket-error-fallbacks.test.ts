import fs from 'fs';
import path from 'path';

function readAppFile(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
}

describe('qualification bracket network error contract (issue #3584)', () => {
  it('bm hides bracket API errors and uses common.networkError for HTTP and transport failures', () => {
    const source = readAppFile('src', 'app', 'tournaments', '[id]', 'bm', 'page-client.tsx');

    expect(source).not.toContain("alert(err.error || tc('failedResetBracket'));");
    expect(source).not.toContain("alert(err.error || tc('failedGenerateBracket'));");
    expect(source).toContain("logger.error('Failed to reset qualification bracket', {");
    expect(source).toContain("logger.error('Failed to generate qualification bracket', {");
    expect(source).toContain('status: res.status');
    expect(source).toContain(
      "logger.error('Failed to reset qualification bracket', { error, tournamentId });\n                  alert(tc('networkError'));",
    );
    expect(source).toContain(
      "logger.error('Failed to generate qualification bracket', { error, tournamentId });\n                  alert(tc('networkError'));",
    );
    expect(source).toContain('setResettingBracket(false);');
    expect(source).toContain('setGeneratingBracket(false);');
  });

  it('mr preserves API errors and surfaces fetch rejection with common.networkError', () => {
    const source = readAppFile('src', 'app', 'tournaments', '[id]', 'mr', 'page-client.tsx');

    expect(source).toContain("toast.error(err.error || tc('failedResetBracket'));");
    expect(source).toContain("toast.error(err.error || tc('failedGenerateBracket'));");
    expect(source).toContain(
      "logger.error('Failed to reset qualification bracket', { error, tournamentId });\n                  toast.error(tc('networkError'));",
    );
    expect(source).toContain(
      "logger.error('Failed to generate qualification bracket', { error, tournamentId });\n                  toast.error(tc('networkError'));",
    );
    expect(source).toContain('setResettingBracket(false);');
    expect(source).toContain('setGeneratingBracket(false);');
  });

  it('gp hides bracket API errors and uses common.networkError for HTTP and transport failures', () => {
    const source = readAppFile('src', 'app', 'tournaments', '[id]', 'gp', 'page-client.tsx');

    expect(source).not.toContain("alert(err.error || tc('failedResetBracket'));");
    expect(source).not.toContain("alert(err.error || tc('failedGenerateBracket'));");
    expect(source).toContain("logger.error('Failed to reset qualification bracket', {");
    expect(source).toContain("logger.error('Failed to generate qualification bracket', {");
    expect(source).toContain('status: res.status');
    expect(source).toContain(
      "logger.error('Failed to reset qualification bracket', { error, tournamentId });\n                  alert(tc('networkError'));",
    );
    expect(source).toContain(
      "logger.error('Failed to generate qualification bracket', { error, tournamentId });\n                  alert(tc('networkError'));",
    );
    expect(source).toContain('setResettingBracket(false);');
    expect(source).toContain('setGeneratingBracket(false);');
  });
});

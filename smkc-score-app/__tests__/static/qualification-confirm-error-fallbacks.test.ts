import fs from 'fs';
import path from 'path';

function readAppFile(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
}

describe('qualification confirmation error fallback contract', () => {
  it('bm hides API errors and uses common.networkError for HTTP and transport failures', () => {
    const source = readAppFile('src', 'app', 'tournaments', '[id]', 'bm', 'page-client.tsx');

    expect(source).not.toContain("alert(errorData.error || tc('networkError'));");
    expect(source).toContain("logger.error('Failed to toggle qualification confirmed', {");
    expect(source).toContain('status: response.status');
    expect(source).toContain("alert(tc('networkError'));");
    expect(source).toContain(
      "logger.error('Failed to toggle qualification confirmed', { error: err, tournamentId });\n      alert(tc('networkError'));",
    );
  });

  it('mr hides API errors and uses common.networkError for HTTP and transport failures', () => {
    const source = readAppFile('src', 'app', 'tournaments', '[id]', 'mr', 'page-client.tsx');

    expect(source).not.toContain("toast.error(errorData.error || tc('networkError'));");
    expect(source).toContain("logger.error('Failed to toggle qualification confirmed', {");
    expect(source).toContain('status: response.status');
    expect(source).toContain("toast.error(tc('networkError'));");
    expect(source).toContain(
      "logger.error('Failed to toggle qualification confirmed', { error: err, tournamentId });\n      toast.error(tc('networkError'));",
    );
  });

  it('gp hides API errors and uses common.networkError for HTTP and transport failures', () => {
    const source = readAppFile('src', 'app', 'tournaments', '[id]', 'gp', 'page-client.tsx');

    expect(source).not.toContain("alert(errorData.error || tc('networkError'));");
    expect(source).toContain("logger.error('Failed to toggle qualification confirmed', {");
    expect(source).toContain('status: response.status');
    expect(source).toContain("alert(tc('networkError'));");
    expect(source).toContain(
      "logger.error('Failed to toggle qualification confirmed', { error: err, tournamentId });\n      alert(tc('networkError'));",
    );
  });

  it.each(['en', 'ja'])('defines common.networkError for %s', (locale) => {
    const messages = readAppFile('messages', `${locale}.json`);

    expect(messages).toMatch(/"networkError"\s*:\s*"[^"]+"/);
  });
});

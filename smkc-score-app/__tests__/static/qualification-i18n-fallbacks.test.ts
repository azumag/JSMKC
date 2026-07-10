import fs from 'node:fs';
import path from 'node:path';

describe('qualification page i18n errors', () => {
  it.each(['bm', 'mr', 'gp'])('%s relies on the typed message catalog without an English fallback', (mode) => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', mode, 'page-client.tsx'),
      'utf8',
    );

    expect(source).toContain("alert(tc('networkError'))");
    expect(source).toContain("tc('failedGenerateBracket')");
    expect(source).not.toContain('Network error — please try again');
  });
});

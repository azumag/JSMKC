import fs from 'node:fs';
import path from 'node:path';

describe('qualification page i18n errors', () => {
  const setupHook = fs.readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'hooks', 'useQualificationSetup.ts'),
    'utf8',
  );

  it('keeps setup error fallbacks in the typed common message catalog', () => {
    expect(setupHook).toContain("message: tc('networkError')");
    expect(setupHook).toContain("tc(isValidation ? 'setupValidationError' : 'setupServerError')");
    expect(setupHook).not.toContain('Network error — please try again');
  });

  it.each(['bm', 'mr', 'gp'])('%s keeps other qualification errors localized', (mode) => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', mode, 'page-client.tsx'),
      'utf8',
    );

    expect(source).toContain("tc('failedGenerateBracket')");
    expect(source).not.toContain('Network error — please try again');
    expect(source).not.toContain("alert(tc('networkError'))");
  });
});

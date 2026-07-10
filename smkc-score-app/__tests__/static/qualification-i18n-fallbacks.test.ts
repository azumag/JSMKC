import fs from 'node:fs';
import path from 'node:path';

describe('qualification page i18n errors', () => {
  const setupHook = fs.readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'hooks', 'useQualificationSetup.ts'),
    'utf8',
  );

  it('keeps setup error fallbacks in the typed common message catalog', () => {
    const networkErrorTranslation = /message:\s*tc\s*\(\s*(['"])networkError\1\s*\)/;
    const setupFallbackTranslation =
      /tc\s*\(\s*isValidation\s*\?\s*(['"])setupValidationError\1\s*:\s*(['"])setupServerError\2\s*\)/;

    expect(setupHook).toMatch(networkErrorTranslation);
    expect(setupHook).toMatch(setupFallbackTranslation);
    expect(setupHook).not.toContain('Network error — please try again');
  });

  it.each(['bm', 'mr', 'gp'])('%s keeps other qualification errors localized', (mode) => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', mode, 'page-client.tsx'),
      'utf8',
    );

    const failedGenerateBracketTranslation = /tc\s*\(\s*(['"])failedGenerateBracket\1\s*\)/;
    const networkErrorAlert = /alert\s*\(\s*tc\s*\(\s*(['"])networkError\1\s*\)\s*\)/;

    expect(source).toMatch(failedGenerateBracketTranslation);
    expect(source).not.toMatch(networkErrorAlert);
    expect(source).not.toContain('Network error — please try again');
  });
});

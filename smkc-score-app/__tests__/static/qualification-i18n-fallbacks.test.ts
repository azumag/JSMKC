import fs from 'node:fs';
import path from 'node:path';

describe('qualification page i18n errors', () => {
  const setupHook = fs.readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'hooks', 'useQualificationSetup.ts'),
    'utf8',
  );

  it('keeps setup error fallbacks in the typed common message catalog without exposing raw API detail', () => {
    const networkErrorTranslation = /message:\s*tc\s*\(\s*(['"])networkError\1\s*\)/;
    const setupFallbackTranslation =
      /tc\s*\(\s*isValidation\s*\?\s*(['"])setupValidationError\1\s*:\s*(['"])setupServerError\2\s*\)/;

    expect(setupHook).toMatch(networkErrorTranslation);
    expect(setupHook).toMatch(setupFallbackTranslation);
    expect(setupHook).not.toContain('payload?.error');
    expect(setupHook).not.toContain('serverMessage');
    expect(setupHook).not.toContain('Network error — please try again');
  });

  it.each(['bm', 'mr'])('%s keeps bracket failures behind the localized network error', (mode) => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', mode, 'page-client.tsx'),
      'utf8',
    );

    expect(source).toMatch(/tc\s*\(\s*(['"])networkError\1\s*\)/);
    expect(source).not.toContain('Network error — please try again');
  });

  it('keeps GP qualification failures behind the localized network error', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', 'gp', 'page-client.tsx'),
      'utf8',
    );

    expect(source).toMatch(/tc\s*\(\s*(['"])networkError\1\s*\)/);
    expect(source).not.toContain('Network error — please try again');
  });
});

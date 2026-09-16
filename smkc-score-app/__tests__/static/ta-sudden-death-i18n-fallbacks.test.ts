import fs from 'node:fs';
import path from 'node:path';

describe('TA sudden-death mutation fallback i18n', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'tournament', 'ta-sudden-death-panel.tsx'),
    'utf8',
  );
  const enMessages = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', 'en.json'), 'utf8')) as {
    common: { networkError?: string };
  };
  const jaMessages = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', 'ja.json'), 'utf8')) as {
    common: { networkError?: string };
  };

  it('uses the shared localized fallback for both sudden-death mutations', () => {
    expect(source).toContain("const tCommon = useTranslations('common');");
    expect(source.match(/errorData\.error \|\| tCommon\('networkError'\)/g) ?? []).toHaveLength(2);
    expect(source.match(/setSaveError\(tCommon\('networkError'\)\)/g) ?? []).toHaveLength(2);
  });

  it('keeps server-provided errors ahead of the localized fallback', () => {
    expect(source.match(/errorData\.error \|\| tCommon\('networkError'\)/g) ?? []).toHaveLength(2);
  });

  it('keeps request rejection details in the client logger', () => {
    expect(source).toContain("logger.error('Failed to change TA sudden-death course:'");
    expect(source).toContain("logger.error('Failed to submit TA sudden-death results:'");
  });

  it('keeps common.networkError translated in English and Japanese', () => {
    expect(enMessages.common.networkError).toBeTruthy();
    expect(jaMessages.common.networkError).toBeTruthy();
    expect(enMessages.common.networkError).not.toBe(jaMessages.common.networkError);
  });
});

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
    expect(source.match(/err instanceof Error \? err\.message : tCommon\('networkError'\)/g) ?? []).toHaveLength(2);
    expect(source).not.toContain('Failed to change sudden-death course');
    expect(source).not.toContain('Failed to submit sudden-death results');
  });

  it('keeps server-provided errors ahead of the localized fallback', () => {
    expect(source.match(/errorData\.error \|\| tCommon\('networkError'\)/g) ?? []).toHaveLength(2);
  });

  it('keeps common.networkError translated in English and Japanese', () => {
    expect(enMessages.common.networkError).toBeTruthy();
    expect(jaMessages.common.networkError).toBeTruthy();
    expect(enMessages.common.networkError).not.toBe(jaMessages.common.networkError);
  });
});

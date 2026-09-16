import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');

describe('auth error suspense fallback i18n contract (issue #3594)', () => {
  it('uses the common loading translation instead of a hard-coded English fallback', () => {
    const source = read('src', 'app', 'auth', 'error', 'page.tsx');

    expect(source).toContain("const tCommon = useTranslations('common')");
    expect(source).toContain("{tCommon('loading')}");
    expect(source).not.toContain('Loading...');
  });

  it('keeps common.loading available in both supported locales', () => {
    const en = JSON.parse(read('messages', 'en.json')) as { common?: Record<string, string> };
    const ja = JSON.parse(read('messages', 'ja.json')) as { common?: Record<string, string> };

    expect(en.common?.loading).toBeTruthy();
    expect(ja.common?.loading).toBeTruthy();
  });
});

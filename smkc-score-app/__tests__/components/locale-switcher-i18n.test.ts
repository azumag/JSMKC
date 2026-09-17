import fs from 'fs';
import path from 'path';

type LocaleSwitcherMessages = {
  switchToJapanese: string;
  switchToEnglish: string;
  switchedToJapanese: string;
  switchedToEnglish: string;
};

const appRoot = path.resolve(__dirname, '..', '..');
const componentSource = fs.readFileSync(path.join(appRoot, 'src/components/LocaleSwitcher.tsx'), 'utf8');
const requestSource = fs.readFileSync(path.join(appRoot, 'src/i18n/request.ts'), 'utf8');

const loadMessages = (locale: 'en' | 'ja') =>
  JSON.parse(
    fs.readFileSync(path.join(appRoot, 'messages/locale-switcher', `${locale}.json`), 'utf8'),
  ) as LocaleSwitcherMessages;

describe('LocaleSwitcher localization contract', () => {
  it('registers matching EN/JA message keys', () => {
    const en = loadMessages('en');
    const ja = loadMessages('ja');

    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
    expect(en).toEqual({
      switchToJapanese: 'Switch to Japanese',
      switchToEnglish: 'Switch to English',
      switchedToJapanese: 'Switched to Japanese',
      switchedToEnglish: 'Switched to English',
    });
    expect(ja).toEqual({
      switchToJapanese: '日本語に切り替え',
      switchToEnglish: '英語に切り替え',
      switchedToJapanese: '日本語に切り替えました',
      switchedToEnglish: '英語に切り替えました',
    });
    expect(requestSource).toContain('localeSwitcher: localeSwitcherMessages[locale]');
  });

  it('uses translated accessible names and success notifications', () => {
    expect(componentSource).toContain("const tLocaleSwitcher = useTranslations('localeSwitcher');");
    expect(componentSource).toContain("tLocaleSwitcher('switchToEnglish')");
    expect(componentSource).toContain("tLocaleSwitcher('switchToJapanese')");
    expect(componentSource).toContain("tLocaleSwitcher('switchedToEnglish')");
    expect(componentSource).toContain("tLocaleSwitcher('switchedToJapanese')");
    expect(componentSource).not.toContain("aria-label={isJapanese ? 'Switch to English' : '日本語に切り替え'}");
    expect(componentSource).not.toContain(
      "toast.success(newLocale === 'ja' ? '日本語に切り替えました' : 'Switched to English')",
    );
  });
});

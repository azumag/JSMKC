import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');

describe('QR login suspense fallback i18n contract (issue #3592)', () => {
  it('reuses the localized QR login progress message in the suspense fallback', () => {
    const source = read('src', 'app', 'auth', 'qr-login', 'page.tsx');

    expect(source).toContain("export default function QrLoginPage() {\n  const t = useTranslations('auth');");
    expect(source).toContain("{t('qrLoginInProgress')}");
    expect(source).not.toContain('Loading...');
  });

  it('keeps the progress translation available in both supported locales', () => {
    const en = JSON.parse(read('messages', 'en.json')) as { auth?: Record<string, string> };
    const ja = JSON.parse(read('messages', 'ja.json')) as { auth?: Record<string, string> };

    expect(en.auth?.qrLoginInProgress).toBeTruthy();
    expect(ja.auth?.qrLoginInProgress).toBeTruthy();
  });
});

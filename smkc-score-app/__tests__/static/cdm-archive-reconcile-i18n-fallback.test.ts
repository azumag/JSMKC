import fs from 'node:fs';
import path from 'node:path';

describe('CDM archive reconcile network fallback i18n', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'tournament', 'cdm-archive-reconcile-button.tsx'),
    'utf8',
  );
  const enMessages = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', 'en.json'), 'utf8')) as {
    common: { networkError?: string };
  };
  const jaMessages = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', 'ja.json'), 'utf8')) as {
    common: { networkError?: string };
  };

  it('uses common.networkError for the generic network catch', () => {
    expect(source).toContain("const tCommon = useTranslations('common');");
    expect(source).toContain("alert(tCommon('networkError'));");
    expect(source).not.toContain("japanese ? 'ネットワークエラーが発生しました' : 'A network error occurred'");
  });

  it('keeps reconciliation-specific API errors and diagnostics intact', () => {
    expect(source).toContain('errorMessage(previewJson');
    expect(source).toContain('errorMessage(applyJson');
    expect(source).toContain("logger.error('Failed to reconcile CDM archive schedule'");
  });

  it('keeps common.networkError translated in English and Japanese', () => {
    expect(enMessages.common.networkError).toBeTruthy();
    expect(jaMessages.common.networkError).toBeTruthy();
    expect(enMessages.common.networkError).not.toBe(jaMessages.common.networkError);
  });
});

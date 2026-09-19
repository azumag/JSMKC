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

  it('fails closed on preview and apply HTTP errors while keeping safe diagnostics', () => {
    expect(source).not.toContain('function errorMessage');
    expect(source).not.toContain('errorMessage(previewJson');
    expect(source).not.toContain('errorMessage(applyJson');
    expect(source).toContain("logger.error('CDM archive reconciliation preview failed', {");
    expect(source).toContain('status: previewResponse.status');
    expect(source).toContain("logger.error('CDM archive reconciliation apply failed', {");
    expect(source).toContain('status: applyResponse.status');
    expect(source).toContain("logger.error('Failed to reconcile CDM archive schedule'");

    const previewFailure = source.indexOf('if (!previewResponse.ok)');
    const previewJson = source.indexOf('const previewJson = await previewResponse.json()');
    const applyFailure = source.indexOf('if (!applyResponse.ok)');
    const applyJson = source.indexOf('const applyJson = await applyResponse.json()');
    expect(previewFailure).toBeGreaterThan(-1);
    expect(previewJson).toBeGreaterThan(previewFailure);
    expect(applyFailure).toBeGreaterThan(-1);
    expect(applyJson).toBeGreaterThan(applyFailure);
  });

  it('keeps common.networkError translated in English and Japanese', () => {
    expect(enMessages.common.networkError).toBeTruthy();
    expect(jaMessages.common.networkError).toBeTruthy();
    expect(enMessages.common.networkError).not.toBe(jaMessages.common.networkError);
  });
});

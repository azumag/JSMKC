import fs from 'node:fs';
import path from 'node:path';

describe('TA participant mutation fallback i18n', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', 'ta', 'participant', 'page.tsx'),
    'utf8',
  );
  const enMessages = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', 'en.json'), 'utf8')) as {
    common: { networkError?: string };
  };
  const jaMessages = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', 'ja.json'), 'utf8')) as {
    common: { networkError?: string };
  };

  it('keeps server-provided errors ahead of the localized fallback for the three non-Phase3 mutations', () => {
    expect(source.match(/setError\(errorData\.error \|\| tCommon\('networkError'\)\)/g) ?? []).toHaveLength(3);
  });

  it('keeps the Phase 3 error-code mapping ahead of the localized fallback', () => {
    expect(source).toContain("if (code === 'NO_OPEN_ROUND') setReportError(tTa('noOpenRound'));");
    expect(source).toContain("else if (code === 'ROUND_ALREADY_SUBMITTED') setReportError(tTa('roundAlreadySubmitted'));");
    expect(source).toContain("else if (code === 'ROUND_MISMATCH') setReportError(tTa('roundMismatch'));");
    expect(source).toContain("else if (code === 'PLAYER_REPORT_DISABLED') setReportError(tTa('reportDisabled'));");
    expect(source).toContain("else if (code === 'PLAYER_ELIMINATED') setReportError(tTa('eliminatedCannotReport'));");
    expect(source).toContain("else setReportError(json.error || tCommon('networkError'));");
  });

  it('never shows a raw caught error message to the user', () => {
    expect(source).not.toMatch(/err instanceof Error \? err\.message/);
    expect(source).not.toMatch(/err\.message/);
  });

  it('keeps request rejection details in the client logger for all four mutations', () => {
    expect(source).toContain("logger.error('Failed to submit TA times:'");
    expect(source).toContain("logger.error('Failed to submit partner TA times:'");
    expect(source).toContain("logger.error('Failed to submit TA phase3 report:'");
    expect(source).toContain("logger.error('Failed to add player to TA:'");
  });

  it('keeps common.networkError translated in English and Japanese', () => {
    expect(enMessages.common.networkError).toBeTruthy();
    expect(jaMessages.common.networkError).toBeTruthy();
    expect(enMessages.common.networkError).not.toBe(jaMessages.common.networkError);
  });
});

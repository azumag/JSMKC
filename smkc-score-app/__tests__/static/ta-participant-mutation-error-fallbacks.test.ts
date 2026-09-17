import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/app/tournaments/[id]/ta/participant/page.tsx'),
  'utf8',
);

const handler = (startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe('TA participant mutation error fallback contract (issue #3606)', () => {
  it('keeps API errors but localizes own qualification request rejection', () => {
    const body = handler('const handleSubmitTimes', "const handleSubmitPartnerTimes");

    expect(body).toContain("setError(errorData.error || tCommon('networkError'));");
    expect(body).toContain("logger.error('Failed to submit TA qualification times:'");
    expect(body).toContain("setError(tCommon('networkError'));");
    expect(body).not.toContain('err instanceof Error ? err.message');
    expect(body).toContain('setSubmitting(false);');
  });

  it('keeps API errors but localizes partner qualification request rejection', () => {
    const body = handler('const handleSubmitPartnerTimes', 'const handleReportTime');

    expect(body).toContain("setError(errorData.error || tCommon('networkError'));");
    expect(body).toContain("logger.error('Failed to submit partner TA qualification times:'");
    expect(body).toContain("setError(tCommon('networkError'));");
    expect(body).not.toContain('err instanceof Error ? err.message');
    expect(body).toContain('setSubmitting(false);');
  });

  it('preserves Phase 3 error-code mapping while localizing request rejection', () => {
    const body = handler('const handleReportTime', 'const handleAddToTimeAttack');

    expect(body).toContain("if (code === 'NO_OPEN_ROUND')");
    expect(body).toContain("else if (code === 'ROUND_ALREADY_SUBMITTED')");
    expect(body).toContain("else if (code === 'ROUND_MISMATCH')");
    expect(body).toContain("else if (code === 'PLAYER_REPORT_DISABLED')");
    expect(body).toContain("else if (code === 'PLAYER_ELIMINATED')");
    expect(body).toContain("else setReportError(json.error || tCommon('networkError'));");
    expect(body).toContain("logger.error('Failed to report TA Phase 3 time:'");
    expect(body).toContain("setReportError(tCommon('networkError'));");
    expect(body).not.toContain('err instanceof Error ? err.message');
    expect(body).toContain('setReporting(false);');
  });

  it('keeps registration API errors but localizes request rejection', () => {
    const body = handler('const handleAddToTimeAttack', 'const getEnteredTimesCount');

    expect(body).toContain("setError(errorData.error || tCommon('networkError'));");
    expect(body).toContain("logger.error('Failed to add participant to TA:'");
    expect(body).toContain("setError(tCommon('networkError'));");
    expect(body).not.toContain('err instanceof Error ? err.message');
    expect(body).toContain('setSubmitting(false);');
  });

  it('keeps common.networkError translated in both supported locales', () => {
    const en = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages/en.json'), 'utf8')) as {
      common: { networkError?: string };
    };
    const ja = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages/ja.json'), 'utf8')) as {
      common: { networkError?: string };
    };

    expect(en.common.networkError).toBeTruthy();
    expect(ja.common.networkError).toBeTruthy();
    expect(en.common.networkError).not.toBe(ja.common.networkError);
  });
});

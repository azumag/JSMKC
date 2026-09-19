import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'src/app/tournaments/[id]/ta/participant/page.tsx'), 'utf8');

const handler = (startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe('TA participant mutation error fallback contract (issue #3606 / #3864)', () => {
  it('redacts own qualification API details and keeps safe diagnostics', () => {
    const body = handler('const handleSubmitTimes', 'const handleSubmitPartnerTimes');

    expect(body).not.toContain('errorData.error');
    expect(body).not.toContain('const errorData = await response.json()');
    expect(body).toContain("logger.error('Failed to submit TA qualification times:'");
    expect(body).toContain('status: response.status');
    expect(body).toContain("operation: 'submit_qualification_times'");
    expect(body).toContain('entryId: myEntry.id');
    expect(body).toContain("setError(tCommon('networkError'));");
    expect(body).not.toContain('err instanceof Error ? err.message');
    expect(body).toContain('setSubmitting(false);');
  });

  it('redacts partner qualification API details and keeps safe diagnostics', () => {
    const body = handler('const handleSubmitPartnerTimes', 'const handleReportTime');

    expect(body).not.toContain('errorData.error');
    expect(body).not.toContain('const errorData = await response.json()');
    expect(body).toContain("logger.error('Failed to submit partner TA qualification times:'");
    expect(body).toContain('status: response.status');
    expect(body).toContain("operation: 'submit_partner_qualification_times'");
    expect(body).toContain('entryId: partnerEntry.id');
    expect(body).toContain("setError(tCommon('networkError'));");
    expect(body).not.toContain('err instanceof Error ? err.message');
    expect(body).toContain('setSubmitting(false);');
  });

  it('preserves Phase 3 machine-readable error-code mapping while redacting prose', () => {
    const body = handler('const handleReportTime', 'const handleAddToTimeAttack');

    expect(body).toContain("if (code === 'NO_OPEN_ROUND')");
    expect(body).toContain("else if (code === 'ROUND_ALREADY_SUBMITTED')");
    expect(body).toContain("else if (code === 'ROUND_MISMATCH')");
    expect(body).toContain("else if (code === 'PLAYER_REPORT_DISABLED')");
    expect(body).toContain("else if (code === 'PLAYER_ELIMINATED')");
    expect(body).toContain("else setReportError(tCommon('networkError'));");
    expect(body).not.toContain('json.error');
    expect(body).toContain("logger.error('Failed to report TA Phase 3 time:'");
    expect(body).toContain('status: response.status');
    expect(body).toContain('code,');
    expect(body).toContain('roundNumber: round.roundNumber');
    expect(body).toContain("setReportError(tCommon('networkError'));");
    expect(body).not.toContain('err instanceof Error ? err.message');
    expect(body).toContain('setReporting(false);');
  });

  it('redacts registration API details and keeps safe diagnostics', () => {
    const body = handler('const handleAddToTimeAttack', 'const getEnteredTimesCount');

    expect(body).not.toContain('errorData.error');
    expect(body).not.toContain('const errorData = await response.json()');
    expect(body).toContain("logger.error('Failed to add participant to TA:'");
    expect(body).toContain('status: response.status');
    expect(body).toContain("operation: 'register_participant'");
    expect(body).toContain('playerId,');
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

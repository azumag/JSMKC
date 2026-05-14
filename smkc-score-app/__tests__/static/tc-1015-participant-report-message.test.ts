import { e2eCaseSection, readRepoFile } from '../helpers/e2e-cases';

describe('TC-1015 participant report message coverage', () => {
  const helper = readRepoFile('smkc-score-app', 'src', 'lib', 'participant-report-message.ts');
  const unitTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'lib',
    'participant-report-message.test.ts',
  );

  it('documents participant success-message mismatch and correction coverage', () => {
    const section = e2eCaseSection('TC-1015');

    expect(section).toContain('issue #1015/#1016');
    expect(section).toContain('TC-508');
    expect(section).toContain('TC-609');
    expect(section).toContain('TC-708');
    expect(section).toContain('mismatch: true');
    expect(section).toContain('corrected: true');
    expect(section).toContain('ParticipantReportResult');
    expect(section).toContain('participant-report-message.test.ts');
  });

  it('keeps ParticipantReportResult typed to the report API response shape', () => {
    expect(helper).toContain('autoConfirmed?: boolean');
    expect(helper).toContain('corrected?: boolean');
    expect(helper).toContain('mismatch?: boolean');
    expect(helper).toContain('waitingFor?: string');
    expect(helper).not.toContain('autoConfirmed?: unknown');
    expect(helper).not.toContain('corrected?: unknown');
    expect(helper).not.toContain('mismatch?: unknown');
    expect(helper).not.toContain('waitingFor?: unknown');
  });

  it('keeps mismatch and correction helper branches under unit coverage', () => {
    expect(unitTest).toContain('shows mismatch score copy');
    expect(unitTest).toContain('shows correction copy');
    expect(unitTest).toContain('shows mismatch match-result copy');
    expect(unitTest).toContain('getScoreReportSuccessMessage({ mismatch: true }');
    expect(unitTest).toContain('getScoreReportSuccessMessage({ corrected: true }');
    expect(unitTest).toContain('getMatchReportSuccessMessage({ mismatch: true }');
  });
});

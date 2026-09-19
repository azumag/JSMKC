import { readRepoFile } from '../helpers/e2e-cases';

describe('fail-closed client feedback docs', () => {
  const participantDoc = readRepoFile('docs', 'ta-participant-error-fallbacks.md');
  const saveDoc = readRepoFile('smkc-score-app', 'docs', 'qualification-save-error-feedback.md');
  const confirmDoc = readRepoFile('smkc-score-app', 'docs', 'qualification-confirm-error-fallbacks.md');
  const matchReportDoc = readRepoFile('smkc-score-app', 'docs', 'match-report-error-feedback.md');

  it('keeps TA participant failures behind localized fallbacks or stable codes', () => {
    expect(participantDoc).toContain('common.networkError');
    expect(participantDoc).toContain('PLAYER_ELIMINATED');
    expect(participantDoc).not.toContain('可能な限り API が返す具体的な `error` を優先');
    expect(participantDoc).not.toContain('client-side 例外が `Error` として具体的な message を持つ場合');
  });

  it('does not document raw qualification API prose as preferred feedback', () => {
    for (const doc of [saveDoc, confirmDoc]) {
      expect(doc).toContain('common.networkError');
      expect(doc).toContain('raw');
    }
    expect(saveDoc).not.toContain('レスポンスに具体的な `error` がある場合はその文言を優先');
    expect(confirmDoc).not.toContain('API が返す具体的なエラーを優先');
  });

  it('keeps production match-report failures fail-closed while documenting low-level compatibility', () => {
    expect(matchReportDoc).toContain('common.networkError');
    expect(matchReportDoc).toContain('networkErrorMessage');
    expect(matchReportDoc).toContain('低レベル');
    expect(matchReportDoc).not.toContain('その API メッセージを優先');
  });
});

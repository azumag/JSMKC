import { readRepoFile } from '../helpers/e2e-cases';

describe('TA qualification error contract docs', () => {
  const setupDoc = readRepoFile('smkc-score-app', 'docs', 'ta-qualification-setup-error-fallbacks.md');
  const freezeDoc = readRepoFile('smkc-score-app', 'docs', 'ta-qualification-freeze-error-fallbacks.md');
  const adminDoc = readRepoFile('smkc-score-app', 'docs', 'ta-qualification-admin-mutation-error-fallbacks.md');
  const clientContract = readRepoFile('smkc-score-app', 'docs', 'ta-qualification-client-contract.md');

  it('keeps qualification HTTP failures fail-closed in user-facing docs', () => {
    for (const doc of [setupDoc, freezeDoc, adminDoc]) {
      expect(doc).toContain('common.networkError');
      expect(doc).toContain('HTTP non-2xx');
      expect(doc).not.toContain('API が具体的な `error` を返した場合');
    }
  });

  it('does not document raw setup payload prose as preferred feedback', () => {
    expect(setupDoc).toContain('SetupSaveError');
    expect(clientContract).toContain('common.networkError');
    expect(clientContract).not.toContain('prefer the API `payload.error`');
  });
});
